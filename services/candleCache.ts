import fs from 'fs';
import path from 'path';

export function getPath(accountId: string, symbol: string, tf: string) {
  return `./storage/accounts/${accountId}/candles/${symbol}_${tf}.json`;
}

/**
 * Extracts the single latest contiguous block of candles leading up to the most recent candle.
 * Discards any historical blocks separated by long gaps (> 96 hours) or abnormal price jumps (> 2.5%).
 */
export function extractLatestContinuousSegment(candles: any[]): any[] {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  
  const valid = candles
    .filter(c => c && c.time && typeof c.close === 'number' && !isNaN(c.close) && c.close > 0)
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  if (valid.length <= 1) return valid;

  let startIndex = 0;
  for (let i = valid.length - 1; i >= 1; i--) {
    const cur = valid[i];
    const prev = valid[i - 1];
    const curTime = new Date(cur.time).getTime();
    const prevTime = new Date(prev.time).getTime();
    const gapHours = (curTime - prevTime) / (1000 * 3600);
    const priceChangeRatio = Math.abs(cur.close - prev.close) / prev.close;

    // Reject any gap > 96 hours (4 days) or single-bar price jump > 2.5% as a disconnected epoch
    if (gapHours > 96 || priceChangeRatio > 0.025) {
      startIndex = i;
      break;
    }
  }

  return valid.slice(startIndex);
}

export function load(accountId: string, symbol: string, tf: string) {
  const file = getPath(accountId, symbol, tf);
  if (!fs.existsSync(file)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    return extractLatestContinuousSegment(raw);
  } catch (e) {
    return [];
  }
}

export function save(accountId: string, symbol: string, tf: string, data: any[]) {
  const filepath = getPath(accountId, symbol, tf);
  const dir = path.dirname(filepath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const clean = extractLatestContinuousSegment(data);
  fs.writeFileSync(filepath, JSON.stringify(clean, null, 2));
}

// Function to maintain a cache size limit and guarantee a single contiguous chart dataset
export function mergeAndSave(accountId: string, symbol: string, tf: string, liveData: any[]) {
  const cached = load(accountId, symbol, tf);
  const cleanLive = extractLatestContinuousSegment(liveData);

  let combined: any[] = [];

  if (cleanLive.length > 0) {
    if (cached.length > 0) {
      const cachedLatest = cached[cached.length - 1];
      const liveFirst = cleanLive[0];
      const gapHours = (new Date(liveFirst.time).getTime() - new Date(cachedLatest.time).getTime()) / (1000 * 3600);
      const priceDiff = Math.abs(liveFirst.close - cachedLatest.close) / cachedLatest.close;

      // Only merge cached history if it connects seamlessly to the live stream
      if (gapHours <= 96 && gapHours >= -1 && priceDiff <= 0.025) {
        const map = new Map<number, any>();
        cached.forEach((c: any) => map.set(new Date(c.time).getTime(), c));
        cleanLive.forEach((c: any) => map.set(new Date(c.time).getTime(), c));
        combined = Array.from(map.values()).sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime());
      } else {
        // Cache is stale or belongs to disconnected epoch - discard old cache and use fresh live stream
        combined = cleanLive;
      }
    } else {
      combined = cleanLive;
    }
  } else {
    combined = cached;
  }

  const finalClean = extractLatestContinuousSegment(combined).slice(-2000);
  save(accountId, symbol, tf, finalClean);
  return finalClean;
}

