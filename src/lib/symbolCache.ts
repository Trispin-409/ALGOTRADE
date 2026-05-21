const symbolsCache = new Map<string, { symbols: string[], lastFetchTime: number, isFetching?: boolean, lastErrorTime?: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours (increased to reduce API load)
const ERROR_TTL = 1000 * 60 * 5; // 5 minutes wait after an error (increased from 1 min)

// Global lock to prevent thundering herd across accounts for heavy symbol operations
let globalFetchLock: Promise<void> = Promise.resolve();

function getFallbackSymbols(accountId: string): string[] {
  const globalScope = globalThis as any;
  const extraSymbols = new Set<string>();

  // Use standard majors/minors
  const FALLBACK_SYMBOLS = [
    // Forex
    "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD",
    "EURGBP", "EURJPY", "GBPJPY", "EURAUD", "EURCAD", "AUDJPY", "GBPAUD", "GBPCAD",
    // Metals
    "XAUUSD", "XAGUSD",
    // Crypto
    "BTCUSD", "ETHUSD", "LTCUSD",
    // Indices / CFDs
    "US30", "NAS100", "SPX500", "GER30", "DE30", "UK100", "JPN225"
  ];

  for (const s of FALLBACK_SYMBOLS) {
    extraSymbols.add(s);
  }

  // 1. Add suffix variants based on known active settings
  const settings = globalScope.STRATEGY_SETTINGS?.get(accountId);
  if (settings && settings.symbol) {
    extraSymbols.add(settings.symbol);
    // Extract suffix if present (e.g. from EURUSD.m, suffix is ".m")
    const baseSymbolMatch = settings.symbol.match(/^([A-Z0-9]+?)([^A-Z0-9]+.*|[a-z]+.*)?$/);
    if (baseSymbolMatch && baseSymbolMatch[2]) {
      const suffix = baseSymbolMatch[2];
      for (const s of FALLBACK_SYMBOLS) {
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
          // Extract suffix if present
          const baseSymbolMatch = pos.symbol.match(/^([A-Z0-9]+?)([^A-Z0-9]+.*|[a-z]+.*)?$/);
          if (baseSymbolMatch && baseSymbolMatch[2]) {
            const suffix = baseSymbolMatch[2];
            for (const s of FALLBACK_SYMBOLS) {
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

  // 0. Check if we already have a synchronized stream in server registry
  const globalScope = globalThis as any;
  const existingConn = globalScope.CONNECTIONS?.get(accountId);
  if (existingConn && existingConn.synchronized && existingConn.terminalState?.symbols) {
    const streamSymbols = existingConn.terminalState.symbols;
    if (streamSymbols.length > 0) {
      // Sync cache with stream data
      symbolsCache.set(accountId, { 
        symbols: streamSymbols, 
        lastFetchTime: now, 
        isFetching: false 
      });
      return streamSymbols;
    }
  }

  // 1. Return cached if valid
  let currentCache = symbolsCache.get(accountId);
  if (currentCache && currentCache.symbols.length > 0 && (now - currentCache.lastFetchTime < CACHE_TTL)) {
    return currentCache.symbols;
  }

  // 2. If already fetching, wait until finished
  if (currentCache?.isFetching) {
    for (let i = 0; i < 45; i++) {
      await new Promise(r => setTimeout(r, 1000));
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
     return getSymbolsCached(metaapi, accountId); // re-enter to wait in the loop
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
      // Add a small jittered burst protection delay between different account fetches
      await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
      
      const account = await metaapi.metatraderAccountApi.getAccount(accountId);
      
      if (account.state !== 'DEPLOYED') {
        throw new Error(`UNDEPLOYED_STATE`);
      }
      
      let symbols: string[] = [];
      
      // Step 1: REST getSymbols
      try {
        if (typeof account.getSymbols === 'function') {
          symbols = await account.getSymbols();
        }
      } catch (e: any) {
        if (e.message?.includes('cpu credits') || e.message?.includes('rate limit')) throw e;
        console.warn(`[SYMBOL_CACHE] account.getSymbols failed for ${accountId}, trying specifications...`);
      }
      
      // Step 2: REST specifications fallback
      if (!symbols || symbols.length === 0) {
        try {
          if (typeof account.getSymbolSpecifications === 'function') {
            const specs = await account.getSymbolSpecifications();
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
            await connection.connect();
            try {
              await connection.waitSynchronized({ timeoutInSeconds: 20 });
            } catch (e) {}
          }
          symbols = await connection.getSymbols();
        } catch (e: any) {
          console.error(`[SYMBOL_CACHE] RPC getSymbols failed for ${accountId}:`, e.message);
          throw e; // Final throw to hit the catch block below
        }
      }
      
      if (symbols && symbols.length > 0) {
        symbolsCache.set(accountId, { symbols, lastFetchTime: Date.now(), isFetching: false });
      } else {
        // Only clear if we truly found nothing and no error
        symbolsCache.set(accountId, { symbols: [], lastFetchTime: Date.now(), isFetching: false });
      }
      return symbols;
    } catch (err: any) {
      const isRateLimit = err.message?.toLowerCase().includes('rate limit') || 
                          err.message?.toLowerCase().includes('quota') ||
                          err.message?.toLowerCase().includes('cpu credits');

      // For transient rate limits, try exactly one super-quick retry ONLY if we DO NOT have any cached symbols.
      // If we already have cached symbols, immediately use them and save CPU credits / quota!
      const hasCachedSymbols = currentCache?.symbols && currentCache.symbols.length > 0;
      if (isRateLimit && attempt < 2 && !hasCachedSymbols) {
        const delay = 1000 + Math.random() * 500;
        console.warn(`[SYMBOL_CACHE] Rate limited for ${accountId}. Retrying quickly in ${delay.toFixed(0)}ms... (Attempt ${attempt})`);
        await new Promise(r => setTimeout(r, delay));
        return fetchWithRetry(attempt + 1);
      }

      if (err.message === 'UNDEPLOYED_STATE') {
        symbolsCache.set(accountId, { symbols: [], lastFetchTime: 0, isFetching: false });
        return [];
      }

      if (isRateLimit) {
        console.warn(`[SYMBOL_CACHE] API Rate-limited for ${accountId}: ${err.message}. Using cache/fallback.`);
      } else {
        console.error(`[SYMBOL_CACHE] API Fetch failed for ${accountId}:`, err.message);
      }
      
      const fallbackList = hasCachedSymbols
        ? currentCache!.symbols
        : getFallbackSymbols(accountId);

      symbolsCache.set(accountId, { 
        symbols: fallbackList, 
        lastFetchTime: currentCache?.lastFetchTime || 0, 
        isFetching: false,
        // Block consecutive API spams for 5 minutes by setting lastErrorTime
        lastErrorTime: Date.now()
      });
      return fallbackList;
    } finally {
      // Release lock with a mandatory spacing delay
      setTimeout(() => resolveLock(), 1000);
    }
  }

  return fetchWithRetry();
}
