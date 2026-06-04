import fs from 'fs';
import path from 'path';

export function getPath(accountId: string, symbol: string, tf: string) {
  return `./storage/accounts/${accountId}/candles/${symbol}_${tf}.json`;
}

export function load(accountId: string, symbol: string, tf: string) {
  const file = getPath(accountId, symbol, tf);
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
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

  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

// Function to maintain a cache size limit, mostly appending new data
export function mergeAndSave(accountId: string, symbol: string, tf: string, liveData: any[]) {
  const cached = load(accountId, symbol, tf);
  const map = new Map();

  [...cached, ...liveData].forEach((c: any) => {
    if (c && c.time) {
      map.set(new Date(c.time).getTime(), c);
    }
  });

  const merged = Array.from(map.values()).sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime());
  // Optional limit to last 2000 candles to avoid memory blowup
  const trimmed = merged.slice(-2000); 
  
  save(accountId, symbol, tf, trimmed);
  return trimmed;
}

