const symbolsCache = new Map<string, { symbols: string[], lastFetchTime: number, isFetching?: boolean, lastErrorTime?: number }>();
const CACHE_TTL = 1000 * 60 * 30; // 30 min (increased to reduce API load)
const ERROR_TTL = 1000 * 30; // 30 seconds wait after an error

export async function getSymbolsCached(metaapi: any, accountId: string): Promise<string[]> {
  const now = Date.now();
  const cached = symbolsCache.get(accountId);

  // Return cached if valid
  if (cached && cached.symbols.length > 0 && (now - cached.lastFetchTime < CACHE_TTL)) {
    return cached.symbols;
  }

  // If already fetching, wait a bit or return current cache
  if (cached?.isFetching) {
    if (cached.symbols.length > 0) return cached.symbols;
    await new Promise(r => setTimeout(r, 2000));
    const reCheck = symbolsCache.get(accountId);
    if (reCheck?.symbols.length > 0) return reCheck.symbols;
  }

  // If we had a recent error (like rate limit), don't retry immediately
  if (cached?.lastErrorTime && (now - cached.lastErrorTime < ERROR_TTL)) {
    console.warn(`[SYMBOL_CACHE] Skipping retry for ${accountId} due to recent error (Cooling down).`);
    return cached.symbols || [];
  }

  // Mark as fetching
  symbolsCache.set(accountId, { 
    symbols: cached?.symbols || [], 
    lastFetchTime: cached?.lastFetchTime || 0,
    isFetching: true 
  });

  async function fetchWithRetry(attempt = 1): Promise<string[]> {
    try {
      const account = await metaapi.metatraderAccountApi.getAccount(accountId);
      let symbols: string[] = [];
      
      try {
        // 1. Try getSymbols
        if (typeof account.getSymbols === 'function') {
          symbols = await account.getSymbols();
        } else {
          throw new Error('getSymbols not found on account');
        }
      } catch (e: any) {
        if (e.message?.includes('rate limit') || e.message?.includes('quota')) throw e;

        try {
          // 2. Try getSymbolSpecifications (fallback)
          if (typeof account.getSymbolSpecifications === 'function') {
            const specs = await account.getSymbolSpecifications();
            symbols = specs.map((s: any) => s.symbol || s);
          } else {
            throw new Error('getSymbolSpecifications not found on account');
          }
        } catch (e2: any) {
          if (e2.message?.includes('rate limit') || e2.message?.includes('quota')) throw e2;

          try {
            // 3. RPC Fallback
            console.log(`[SYMBOL_CACHE] Attempting RPC fallback for ${accountId}...`);
            const connection = await account.getRPCConnection();
            await connection.connect();
            await connection.waitSynchronized();
            symbols = await connection.getSymbols();
          } catch (e3: any) {
             throw e3;
          }
        }
      }
      
      if (symbols && symbols.length > 0) {
        symbolsCache.set(accountId, { symbols, lastFetchTime: Date.now(), isFetching: false });
      } else {
        symbolsCache.set(accountId, { symbols: [], lastFetchTime: 0, isFetching: false });
      }
      return symbols;
    } catch (err: any) {
      const isRateLimit = err.message?.toLowerCase().includes('rate limit') || 
                          err.message?.toLowerCase().includes('quota') ||
                          err.message?.toLowerCase().includes('cpu credits');

      if (isRateLimit && attempt < 3) {
        const delay = attempt * 5000;
        console.warn(`[SYMBOL_CACHE] Rate limited for ${accountId}. Retrying in ${delay/1000}s... (Attempt ${attempt})`);
        await new Promise(r => setTimeout(r, delay));
        return fetchWithRetry(attempt + 1);
      }

      console.error(`[SYMBOL_CACHE] Failed to fetch symbols for ${accountId}:`, err.message);
      symbolsCache.set(accountId, { 
        symbols: cached?.symbols || [], 
        lastFetchTime: cached?.lastFetchTime || 0, 
        isFetching: false,
        lastErrorTime: Date.now()
      });
      return cached?.symbols || [];
    }
  }

  return fetchWithRetry();
}
