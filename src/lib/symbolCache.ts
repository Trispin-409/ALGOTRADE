import fs from "fs";
import path from "path";

const symbolsCache = new Map<string, { symbols: string[], lastFetchTime: number, isFetching?: boolean, lastErrorTime?: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours (increased to reduce API load)
const ERROR_TTL = 1000 * 60 * 5; // 5 minutes wait after an error

// Global lock to prevent thundering herd across accounts for heavy symbol operations
let globalFetchLock: Promise<void> = Promise.resolve();

function saveSymbolsToDisk(accountId: string, symbols: string[]) {
  if (!accountId || !symbols || symbols.length === 0) return;
  try {
    const metaapiDir = path.join(process.cwd(), ".metaapi");
    if (!fs.existsSync(metaapiDir)) {
      fs.mkdirSync(metaapiDir, { recursive: true });
    }
    const filePath = path.join(metaapiDir, `symbols-${accountId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(symbols), "utf8");
  } catch (err: any) {
    console.warn(`[SYMBOL_CACHE] Error writing disk cache for ${accountId}:`, err.message);
  }
}

function loadSymbolsFromDisk(accountId: string): string[] {
  if (!accountId) return [];
  try {
    const filePath = path.join(process.cwd(), ".metaapi", `symbols-${accountId}.json`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err: any) {
    console.warn(`[SYMBOL_CACHE] Error reading disk cache for ${accountId}:`, err.message);
  }
  return [];
}

function getFallbackSymbols(accountId: string): string[] {
  const globalScope = globalThis as any;
  const diskSymbols = loadSymbolsFromDisk(accountId);
  if (diskSymbols.length > 0) {
    return diskSymbols;
  }

  const extraSymbols = new Set<string>();

  // Standard major/minor/CFD symbols
  const BASE_FALLBACK_SYMBOLS = [
    // Forex
    "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD",
    "EURGBP", "EURJPY", "GBPJPY", "EURAUD", "EURCAD", "AUDJPY", "GBPAUD", "GBPCAD",
    // Metals
    "XAUUSD", "XAGUSD", "GOLD",
    // Crypto
    "BTCUSD", "ETHUSD", "LTCUSD",
    // Indices / CFDs
    "US30", "NAS100", "SPX500", "GER30", "DE30", "UK100", "JPN225"
  ];

  const COMMON_SUFFIXES = [
    "", "-STD", ".m", "m", ".a", ".pro", "-RAW", "-raw", "_i", "-std", "-ecn", "-micro", ".micro", "-zero", "+", ".ecn", "-c"
  ];

  for (const base of BASE_FALLBACK_SYMBOLS) {
    for (const suffix of COMMON_SUFFIXES) {
      extraSymbols.add(base + suffix);
    }
  }

  // Retrieve symbols from local cached metaapi deals and orders files if they exist
  try {
    const metaapiDir = path.join(process.cwd(), ".metaapi");
    const files = [
      path.join(metaapiDir, `${accountId}-MetaApi-deals.bin`),
      path.join(metaapiDir, `${accountId}-MetaApi-historyOrders.bin`)
    ];
    for (const f of files) {
      if (fs.existsSync(f)) {
        const content = fs.readFileSync(f, "utf8");
        const matches = content.match(/"symbol"\s*:\s*"([^"]+)"/g);
        if (matches) {
          for (const m of matches) {
            const symMatch = m.match(/"symbol"\s*:\s*"([^"]+)"/);
            if (symMatch && symMatch[1]) {
              extraSymbols.add(symMatch[1]);
            }
          }
        }
      }
    }
  } catch (err: any) {
    console.warn("[SYMBOL_CACHE] Error reading local metaapi cache files:", err.message);
  }

  // 1. Add suffix variants based on known active settings
  const settings = globalScope.STRATEGY_SETTINGS?.get(accountId);
  if (settings && settings.symbol) {
    extraSymbols.add(settings.symbol);
    const baseSymbolMatch = settings.symbol.match(/^([A-Z0-9]+?)([^A-Z0-9]+.*|[a-z]+.*)?$/);
    if (baseSymbolMatch && baseSymbolMatch[2]) {
      const suffix = baseSymbolMatch[2];
      for (const s of BASE_FALLBACK_SYMBOLS) {
        extraSymbols.add(s + suffix);
      }
    }
  }

  // 2. Add from account cache positions and orders
  const accountCache = globalScope.ACCOUNT_CACHE?.get(accountId);
  if (accountCache) {
    if (Array.isArray(accountCache.positions)) {
      for (const pos of accountCache.positions) {
        if (pos.symbol) {
          extraSymbols.add(pos.symbol);
          const baseSymbolMatch = pos.symbol.match(/^([A-Z0-9]+?)([^A-Z0-9]+.*|[a-z]+.*)?$/);
          if (baseSymbolMatch && baseSymbolMatch[2]) {
            const suffix = baseSymbolMatch[2];
            for (const s of BASE_FALLBACK_SYMBOLS) {
              extraSymbols.add(s + suffix);
            }
          }
        }
      }
    }
    if (Array.isArray(accountCache.orders)) {
      for (const ord of accountCache.orders) {
        if (ord.symbol) {
          extraSymbols.add(ord.symbol);
        }
      }
    }
  }

  return Array.from(extraSymbols);
}

export async function getSymbolsCached(metaapi: any, accountId: string): Promise<string[]> {
  const now = Date.now();

  // 0. Check if we already have a synchronized connection in server registry
  const globalScope = globalThis as any;
  const existingConn = globalScope.CONNECTIONS?.get(accountId) || globalScope.RPC_CONNECTIONS?.get(accountId);
  if (existingConn?.terminalState) {
    let streamSymbols: string[] = [];
    if (Array.isArray(existingConn.terminalState.symbols) && existingConn.terminalState.symbols.length > 0) {
      streamSymbols = existingConn.terminalState.symbols;
    } else if (existingConn.terminalState.specifications) {
      const specs = existingConn.terminalState.specifications;
      if (Array.isArray(specs)) streamSymbols = specs.map((s: any) => s.symbol || s);
      else if (typeof specs === 'object' && specs !== null) streamSymbols = Object.keys(specs);
    }
    if (streamSymbols.length > 0) {
      saveSymbolsToDisk(accountId, streamSymbols);
      symbolsCache.set(accountId, { 
        symbols: streamSymbols, 
        lastFetchTime: now, 
        isFetching: false 
      });
      return streamSymbols;
    }
  }

  // 1. Return in-memory cache if valid
  let currentCache = symbolsCache.get(accountId);
  if (currentCache && currentCache.symbols.length > 0 && (now - currentCache.lastFetchTime < CACHE_TTL)) {
    return currentCache.symbols;
  }

  // 1b. Return disk cache if present
  const diskSymbols = loadSymbolsFromDisk(accountId);
  if (diskSymbols.length > 0) {
    symbolsCache.set(accountId, { symbols: diskSymbols, lastFetchTime: now, isFetching: false });
    return diskSymbols;
  }

  // 2. If already fetching, wait until finished
  if (currentCache?.isFetching) {
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500));
      const reCheck = symbolsCache.get(accountId);
      if (!reCheck?.isFetching) {
        return reCheck?.symbols && reCheck.symbols.length > 0
          ? reCheck.symbols
          : getFallbackSymbols(accountId);
      }
    }
    if (currentCache?.symbols && currentCache.symbols.length > 0) {
       return currentCache.symbols;
    }
  }
  
  // RACE CONDITION GUARD: Re-check immediately in case another async context just set it
  currentCache = symbolsCache.get(accountId);
  if (currentCache?.isFetching) {
     return getSymbolsCached(metaapi, accountId);
  }

  // 3. If we had a recent error (like rate limit), don't retry immediately
  const lastErrorTime = currentCache?.lastErrorTime || 0;
  if (now - lastErrorTime < ERROR_TTL) {
    return currentCache?.symbols && currentCache.symbols.length > 0
      ? currentCache.symbols
      : getFallbackSymbols(accountId);
  }

  // Mark as fetching immediately to lock out other sync tasks
  symbolsCache.set(accountId, { 
    symbols: currentCache?.symbols || [], 
    lastFetchTime: currentCache?.lastFetchTime || 0,
    isFetching: true 
  });

  async function fetchWithRetry(attempt = 1): Promise<string[]> {
    // Acquire global lock and add spacing between calls
    const currentLock = globalFetchLock;
    let resolveLock: () => void;
    globalFetchLock = new Promise(r => resolveLock = r);
    await currentLock;
    
    try {
      await new Promise(r => setTimeout(r, 300 + Math.random() * 300));
      
      const account = await metaapi.metatraderAccountApi.getAccount(accountId);
      
      if (account.state !== 'DEPLOYED') {
        throw new Error(`UNDEPLOYED_STATE`);
      }
      
      let symbols: string[] = [];
      
      // Step 1: REST getSymbols
      try {
        if (typeof account.getSymbols === 'function') {
          symbols = await Promise.race([
            account.getSymbols(),
            new Promise<string[]>((_, reject) => setTimeout(() => reject(new Error("Timeout (30s)")), 30000))
          ]);
        }
      } catch (e: any) {
        if (e.message?.includes('cpu credits') || e.message?.includes('rate limit')) throw e;
        console.warn(`[SYMBOL_CACHE] account.getSymbols failed for ${accountId}, trying specifications...`);
      }
      
      // Step 2: REST specifications fallback
      if (!symbols || symbols.length === 0) {
        try {
          if (typeof account.getSymbolSpecifications === 'function') {
            const specs = await Promise.race([
              account.getSymbolSpecifications(),
              new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error("Timeout (30s)")), 30000))
            ]);
            symbols = specs.map((s: any) => s.symbol || s);
          }
        } catch (e: any) {
          if (e.message?.includes('cpu credits') || e.message?.includes('rate limit')) throw e;
          console.warn(`[SYMBOL_CACHE] account.getSymbolSpecifications failed for ${accountId}`);
        }
      }
      
      // Step 3: RPC last resort
      if (!symbols || symbols.length === 0) {
        try {
          const connection = await account.getRPCConnection();
          if (!connection.terminalState?.connected) {
            await Promise.race([
              connection.connect(),
              new Promise<void>((_, reject) => setTimeout(() => reject(new Error("Timeout (30s)")), 30000))
            ]);
            try {
              await connection.waitSynchronized({ timeoutInSeconds: 30 });
            } catch (e) {}
          }
          symbols = await Promise.race([
            connection.getSymbols(),
            new Promise<string[]>((_, reject) => setTimeout(() => reject(new Error("Timeout (30s)")), 30000))
          ]);
        } catch (e: any) {
          if (!e.message?.includes('cpu credits') && !e.message?.includes('rate limit')) {
            console.warn(`[SYMBOL_CACHE] RPC getSymbols failed for ${accountId}:`, e.message);
          }
          throw e;
        }
      }
      
      if (symbols && symbols.length > 0) {
        saveSymbolsToDisk(accountId, symbols);
        symbolsCache.set(accountId, { symbols, lastFetchTime: Date.now(), isFetching: false });
      } else {
        const fallbacks = getFallbackSymbols(accountId);
        symbolsCache.set(accountId, { symbols: fallbacks, lastFetchTime: Date.now(), isFetching: false });
        symbols = fallbacks;
      }
      return symbols;
    } catch (err: any) {
      const isRateLimit = err.message?.toLowerCase().includes('rate limit') || 
                          err.message?.toLowerCase().includes('quota') ||
                          err.message?.toLowerCase().includes('cpu credits');

      const hasCachedSymbols = currentCache?.symbols && currentCache.symbols.length > 0;
      if (isRateLimit && attempt < 2 && !hasCachedSymbols) {
        const delay = 1000 + Math.random() * 500;
        console.warn(`[SYMBOL_CACHE] Rate limited for ${accountId}. Retrying in ${delay.toFixed(0)}ms... (Attempt ${attempt})`);
        await new Promise(r => setTimeout(r, delay));
        return fetchWithRetry(attempt + 1);
      }

      if (err.message === 'UNDEPLOYED_STATE') {
        symbolsCache.set(accountId, { symbols: [], lastFetchTime: 0, isFetching: false });
        return [];
      }

      if (err.message?.toLowerCase().includes('not found') || err.message?.toLowerCase().includes('404')) {
        console.warn(`[SYMBOL_CACHE] Trading account ${accountId} not found on server or deleted.`);
        symbolsCache.set(accountId, { 
          symbols: [], 
          lastFetchTime: Date.now(), 
          isFetching: false,
          lastErrorTime: Date.now() + 1000 * 60 * 55
        });
        return [];
      }

      if (isRateLimit) {
        console.log(`[SYMBOL_CACHE] API Rate-limited for ${accountId}. Using cache/fallback.`);
      } else {
        console.warn(`[SYMBOL_CACHE] API Fetch failed for ${accountId}:`, err.message);
      }
      
      const fallbackList = hasCachedSymbols
        ? currentCache!.symbols
        : getFallbackSymbols(accountId);

      symbolsCache.set(accountId, { 
        symbols: fallbackList, 
        lastFetchTime: currentCache?.lastFetchTime || 0, 
        isFetching: false,
        lastErrorTime: Date.now()
      });
      return fallbackList;
    } finally {
      setTimeout(() => resolveLock(), 500);
    }
  }

  return fetchWithRetry();
}

