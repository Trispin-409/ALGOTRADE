const symbolsCache = new Map<string, { symbols: any[], lastFetchTime: number }>();
const CACHE_TTL = 1000 * 60 * 10; // 10 min

export async function getSymbolsCached(connection: any, accountId: string): Promise<any[]> {
  const now = Date.now();
  const cached = symbolsCache.get(accountId);

  if (cached && (now - cached.lastFetchTime < CACHE_TTL)) {
    return cached.symbols;
  }

  const symbols = await connection.getSymbols();
  symbolsCache.set(accountId, { symbols, lastFetchTime: now });
  return symbols;
}
