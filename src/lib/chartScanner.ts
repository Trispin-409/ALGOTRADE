export interface Candle {
  time: string | Date | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  tickVolume?: number;
}

export interface FibLevel {
  ratio: number;
  price: number;
  label: string;
}

export interface ScannedMarketStructure {
  symbol: string;
  currentPrice: number;
  pdh: number; // Previous Day High
  pdl: number; // Previous Day Low
  prev4hHigh: number; // Previous 4-Hour High
  prev4hLow: number; // Previous 4-Hour Low
  swingHigh: number;
  swingLow: number;
  fibLevels: FibLevel[];
  goldenPocket: { low: number; high: number };
  detectedPatterns: string[];
  primaryPattern: string;
  targetLiquidity: number;
  targetLiquidityType: 'BSL' | 'SSL';
  activeSession: string;
  direction: 'BUY' | 'SELL' | 'WAIT';
  strategyName: string;
  confidence: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: string;
  recommendedLotSize: number;
  newsAlignment: string;
  summary: string;
}

/**
 * Determines current active trading session based on UTC time.
 */
export function getActiveTradingSession(date: Date = new Date()): { sessionName: string; isHighLiquidity: boolean } {
  const utcHour = date.getUTCHours();
  const utcMinute = date.getUTCMinutes();
  const timeVal = utcHour + utcMinute / 60;

  // London / New York Overlap: 13:00 - 16:30 UTC (Prime institutional volume)
  if (timeVal >= 13 && timeVal <= 16.5) {
    return { sessionName: 'London / New York Overlap', isHighLiquidity: true };
  }
  // London Session: 08:00 - 16:30 UTC
  if (timeVal >= 8 && timeVal <= 16.5) {
    return { sessionName: 'London Session', isHighLiquidity: true };
  }
  // New York Session: 13:00 - 21:00 UTC
  if (timeVal >= 13 && timeVal <= 21) {
    return { sessionName: 'New York Session', isHighLiquidity: true };
  }
  // Asian / Tokyo Session: 00:00 - 08:00 UTC
  if (timeVal >= 0 && timeVal < 8) {
    return { sessionName: 'Asian / Tokyo Session', isHighLiquidity: false };
  }
  // Sydney Session: 21:00 - 06:00 UTC
  return { sessionName: 'Sydney / Asian Session', isHighLiquidity: false };
}

/**
 * Calculates safe institutional lot size based on real Metatrader account equity, balance, and currency.
 */
export function calculateAccountLotSize(
  equity: number,
  currency: string = 'USD',
  stopLossPips: number = 25,
  riskPercentage: number = 1.5,
  userPreferredLotSize?: number
): number {
  if (userPreferredLotSize && userPreferredLotSize > 0) {
    return Number(Math.max(0.01, Math.min(10.0, userPreferredLotSize)).toFixed(2));
  }

  const safeEquity = Math.max(10, Number(equity) || 100);
  const curr = (currency || 'USD').toUpperCase();

  // Normalize equity to approximate USD value if account is in ZAR or others
  let normalizedUsdEquity = safeEquity;
  if (curr === 'ZAR') {
    normalizedUsdEquity = safeEquity / 18.5; // Approximate ZAR to USD conversion
  } else if (curr === 'EUR') {
    normalizedUsdEquity = safeEquity * 1.08;
  } else if (curr === 'GBP') {
    normalizedUsdEquity = safeEquity * 1.28;
  }

  // Micro Account Tier ($50 - $400): Strict micro lots (0.01 - 0.02)
  if (normalizedUsdEquity < 400) {
    return 0.01;
  }
  // Small Account Tier ($400 - $1,500): 0.02 - 0.05 lots
  if (normalizedUsdEquity < 1500) {
    return Number(Math.min(0.05, Math.max(0.02, (normalizedUsdEquity / 20000))).toFixed(2));
  }
  // Moderate Account Tier ($1,500 - $10,000): 0.05 - 0.30 lots
  if (normalizedUsdEquity < 10000) {
    const riskAmount = normalizedUsdEquity * (riskPercentage / 100);
    const pipsRisk = Math.max(15, stopLossPips);
    const calculated = (riskAmount / (pipsRisk * 10));
    return Number(Math.min(0.50, Math.max(0.05, calculated)).toFixed(2));
  }
  // Enterprise / Prop Tier ($10,000+): Scaled lot sizing
  const riskAmount = normalizedUsdEquity * (riskPercentage / 100);
  const pipsRisk = Math.max(15, stopLossPips);
  const calculated = (riskAmount / (pipsRisk * 10));
  return Number(Math.min(5.0, Math.max(0.20, calculated)).toFixed(2));
}

/**
 * Scans real candlestick chart data to extract Previous Day High/Low,
 * 4-Hour Previous High/Low, Fibonacci levels, Double Top/Bottom, Liquidity Sweeps,
 * and generates high-confluence institutional strategy parameters.
 */
export function scanChartStructure(
  candles: Candle[],
  symbol: string = 'XAUUSD',
  accountContext?: { equity?: number; balance?: number; currency?: string; preferredLotSize?: number },
  newsContext?: { sentiment?: string; headlines?: string[]; score?: number }
): ScannedMarketStructure {
  if (!candles || candles.length < 10) {
    const fallbackPrice = candles?.[candles.length - 1]?.close || 1.08500;
    return {
      symbol,
      currentPrice: fallbackPrice,
      pdh: fallbackPrice * 1.006,
      pdl: fallbackPrice * 0.994,
      prev4hHigh: fallbackPrice * 1.003,
      prev4hLow: fallbackPrice * 0.997,
      swingHigh: fallbackPrice * 1.008,
      swingLow: fallbackPrice * 0.992,
      fibLevels: [],
      goldenPocket: { low: fallbackPrice * 0.998, high: fallbackPrice * 1.002 },
      detectedPatterns: ['Building Candlestick History'],
      primaryPattern: 'Accumulating Ticks',
      targetLiquidity: fallbackPrice * 1.006,
      targetLiquidityType: 'BSL',
      activeSession: getActiveTradingSession().sessionName,
      direction: 'WAIT',
      strategyName: 'Market Structure Accumulation',
      confidence: 60,
      entry: fallbackPrice,
      stopLoss: fallbackPrice * 0.995,
      takeProfit: fallbackPrice * 1.010,
      riskRewardRatio: '1:2.0',
      recommendedLotSize: 0.01,
      newsAlignment: 'Neutral',
      summary: 'Awaiting candle stream formation to establish reliable structural levels.'
    };
  }

  const currentCandle = candles[candles.length - 1];
  const currentPrice = currentCandle.close;

  // 1. COMPUTE PREVIOUS DAY HIGH (PDH) & PREVIOUS DAY LOW (PDL)
  // Divide candles into 24-hour groups or take the prior completed 24h chunk
  let pdh = 0;
  let pdl = Infinity;
  const nowTime = new Date(currentCandle.time).getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const twoDaysMs = 48 * 60 * 60 * 1000;

  const yesterdayCandles = candles.filter(c => {
    const t = new Date(c.time).getTime();
    return t >= (nowTime - twoDaysMs) && t < (nowTime - oneDayMs);
  });

  if (yesterdayCandles.length >= 4) {
    pdh = Math.max(...yesterdayCandles.map(c => c.high));
    pdl = Math.min(...yesterdayCandles.map(c => c.low));
  } else {
    // If exact yesterday boundaries not spanned, calculate from the prior 60% of chart history
    const priorChunk = candles.slice(0, Math.max(1, Math.floor(candles.length * 0.65)));
    pdh = Math.max(...priorChunk.map(c => c.high));
    pdl = Math.min(...priorChunk.map(c => c.low));
  }

  // Sanity check PDH/PDL
  if (pdh <= 0 || !isFinite(pdh)) pdh = currentPrice * 1.007;
  if (pdl <= 0 || !isFinite(pdl)) pdl = currentPrice * 0.993;

  // 2. COMPUTE 4-HOUR PREVIOUS HIGH & LOW
  const fourHoursMs = 4 * 60 * 60 * 1000;
  const eightHoursMs = 8 * 60 * 60 * 1000;

  const prev4hCandles = candles.filter(c => {
    const t = new Date(c.time).getTime();
    return t >= (nowTime - eightHoursMs) && t < (nowTime - fourHoursMs);
  });

  let prev4hHigh = 0;
  let prev4hLow = Infinity;
  if (prev4hCandles.length >= 2) {
    prev4hHigh = Math.max(...prev4hCandles.map(c => c.high));
    prev4hLow = Math.min(...prev4hCandles.map(c => c.low));
  } else {
    // Take previous 16 candles prior to the last 8
    const sliceStart = Math.max(0, candles.length - 24);
    const sliceEnd = Math.max(1, candles.length - 8);
    const slice = candles.slice(sliceStart, sliceEnd);
    if (slice.length > 0) {
      prev4hHigh = Math.max(...slice.map(c => c.high));
      prev4hLow = Math.min(...slice.map(c => c.low));
    } else {
      prev4hHigh = currentPrice * 1.0035;
      prev4hLow = currentPrice * 0.9965;
    }
  }

  if (prev4hHigh <= 0 || !isFinite(prev4hHigh)) prev4hHigh = currentPrice * 1.0035;
  if (prev4hLow <= 0 || !isFinite(prev4hLow)) prev4hLow = currentPrice * 0.9965;

  // 3. COMPUTE SWING HIGH, SWING LOW & FIBONACCI RETRACEMENT
  const recentWindow = candles.slice(-50);
  let swingHigh = Math.max(...recentWindow.map(c => c.high));
  let swingLow = Math.min(...recentWindow.map(c => c.low));
  const swingRange = Math.max(0.0001, swingHigh - swingLow);

  // Find index of swing high and swing low to determine trend direction
  const highIndex = recentWindow.findIndex(c => c.high === swingHigh);
  const lowIndex = recentWindow.findIndex(c => c.low === swingLow);
  const isUptrend = lowIndex < highIndex; // Swing low formed before swing high

  const fibRatios = [0.236, 0.382, 0.500, 0.618, 0.786];
  const fibLevels: FibLevel[] = fibRatios.map(ratio => {
    let price = isUptrend
      ? swingHigh - (swingRange * ratio)
      : swingLow + (swingRange * ratio);

    let label = `${(ratio * 100).toFixed(1)}%`;
    if (ratio === 0.500) label = '50.0% Equilibrium';
    if (ratio === 0.618) label = '61.8% Golden Pocket';

    return { ratio, price, label };
  });

  const golden618 = isUptrend ? swingHigh - (swingRange * 0.618) : swingLow + (swingRange * 0.618);
  const golden650 = isUptrend ? swingHigh - (swingRange * 0.650) : swingLow + (swingRange * 0.650);
  const goldenPocket = {
    low: Math.min(golden618, golden650),
    high: Math.max(golden618, golden650)
  };

  // 4. DETECT MARKET PATTERNS (Double Top, Double Bottom, Liquidity Sweeps, Pin Bars)
  const detectedPatterns: string[] = [];

  // Check Double Bottom / Double Top in last 30 candles
  const last30 = candles.slice(-30);
  let doubleBottomFound = false;
  let doubleTopFound = false;

  // Find local valleys (troughs)
  const troughs: { index: number; price: number }[] = [];
  const peaks: { index: number; price: number }[] = [];

  for (let i = 2; i < last30.length - 2; i++) {
    const c = last30[i];
    if (c.low < last30[i - 1].low && c.low < last30[i - 2].low && c.low < last30[i + 1].low && c.low < last30[i + 2].low) {
      troughs.push({ index: i, price: c.low });
    }
    if (c.high > last30[i - 1].high && c.high > last30[i - 2].high && c.high > last30[i + 1].high && c.high > last30[i + 2].high) {
      peaks.push({ index: i, price: c.high });
    }
  }

  // Check for Double Bottom
  if (troughs.length >= 2) {
    const t1 = troughs[troughs.length - 2];
    const t2 = troughs[troughs.length - 1];
    const diffPct = Math.abs(t1.price - t2.price) / t1.price;
    if (diffPct <= 0.0025 && (t2.index - t1.index) >= 4) {
      doubleBottomFound = true;
      detectedPatterns.push('Double Bottom Reversal');
    }
  }

  // Check for Double Top
  if (peaks.length >= 2) {
    const p1 = peaks[peaks.length - 2];
    const p2 = peaks[peaks.length - 1];
    const diffPct = Math.abs(p1.price - p2.price) / p1.price;
    if (diffPct <= 0.0025 && (p2.index - p1.index) >= 4) {
      doubleTopFound = true;
      detectedPatterns.push('Double Top Reversal');
    }
  }

  // Check for Liquidity Sweeps
  const last3 = candles.slice(-3);
  let sweepPDL = false;
  let sweepPDH = false;
  let sweep4HLow = false;
  let sweep4HHigh = false;

  for (const c of last3) {
    if (c.low < pdl && c.close > pdl) {
      sweepPDL = true;
      detectedPatterns.push('PDL Liquidity Sweep (Bullish Reclaim)');
    }
    if (c.high > pdh && c.close < pdh) {
      sweepPDH = true;
      detectedPatterns.push('PDH Liquidity Sweep (Bearish Reject)');
    }
    if (c.low < prev4hLow && c.close > prev4hLow) {
      sweep4HLow = true;
      detectedPatterns.push('4H Low Liquidity Sweep');
    }
    if (c.high > prev4hHigh && c.close < prev4hHigh) {
      sweep4HHigh = true;
      detectedPatterns.push('4H High Liquidity Sweep');
    }
  }

  // Check Pin Bars / Wick Rejections
  const lastC = currentCandle;
  const body = Math.abs(lastC.close - lastC.open);
  const upperWick = lastC.high - Math.max(lastC.open, lastC.close);
  const lowerWick = Math.min(lastC.open, lastC.close) - lastC.low;

  if (lowerWick >= 2 * body && lowerWick > upperWick * 1.5) {
    detectedPatterns.push('Bullish Pin Bar (Demand Wick)');
  } else if (upperWick >= 2 * body && upperWick > lowerWick * 1.5) {
    detectedPatterns.push('Bearish Pin Bar (Supply Wick)');
  }

  // Bullish/Bearish Engulfing
  if (candles.length >= 2) {
    const prevC = candles[candles.length - 2];
    if (prevC.close < prevC.open && lastC.close > lastC.open && lastC.close > prevC.open && lastC.open < prevC.close) {
      detectedPatterns.push('Bullish Engulfing');
    } else if (prevC.close > prevC.open && lastC.close < lastC.open && lastC.close < prevC.open && lastC.open > prevC.close) {
      detectedPatterns.push('Bearish Engulfing');
    }
  }

  // Check if price is inside or touching Golden Pocket
  const isInsideGoldenPocket = currentPrice >= goldenPocket.low && currentPrice <= goldenPocket.high;
  if (isInsideGoldenPocket) {
    detectedPatterns.push('Fibonacci Golden Pocket Zone (61.8%)');
  }

  if (detectedPatterns.length === 0) {
    detectedPatterns.push(isUptrend ? 'Bullish Trend Order Flow' : 'Bearish Trend Order Flow');
  }

  const primaryPattern = detectedPatterns[0];

  // 5. DETERMINE DIRECTION & STRATEGY SELECTION
  let direction: 'BUY' | 'SELL' | 'WAIT' = 'WAIT';
  let strategyName = 'Market Structure Accumulation';
  let confidence = 70;

  let bullPoints = 0;
  let bearPoints = 0;

  if (doubleBottomFound) bullPoints += 3;
  if (doubleTopFound) bearPoints += 3;
  if (sweepPDL || sweep4HLow) bullPoints += 2.5;
  if (sweepPDH || sweep4HHigh) bearPoints += 2.5;
  if (detectedPatterns.some(p => p.includes('Bullish Pin Bar') || p.includes('Bullish Engulfing'))) bullPoints += 2;
  if (detectedPatterns.some(p => p.includes('Bearish Pin Bar') || p.includes('Bearish Engulfing'))) bearPoints += 2;
  if (isInsideGoldenPocket && isUptrend) bullPoints += 2;
  if (isInsideGoldenPocket && !isUptrend) bearPoints += 2;

  // News influence
  const newsSentiment = (newsContext?.sentiment || 'NEUTRAL').toUpperCase();
  if (newsSentiment.includes('BULL')) bullPoints += 1.5;
  if (newsSentiment.includes('BEAR')) bearPoints += 1.5;

  const sessionInfo = getActiveTradingSession();

  if (bullPoints >= 3 && bullPoints > bearPoints) {
    direction = 'BUY';
    confidence = Math.min(95, Math.round(75 + bullPoints * 3.5));
    if (doubleBottomFound) {
      strategyName = 'Double Bottom Liquidity Expansion';
    } else if (isInsideGoldenPocket) {
      strategyName = 'Fibonacci Golden Pocket Reversal';
    } else if (sweepPDL || sweep4HLow) {
      strategyName = 'London/NY Liquidity Sweep Rebound';
    } else {
      strategyName = 'ICT Fair Value & Structure Retest';
    }
  } else if (bearPoints >= 3 && bearPoints > bullPoints) {
    direction = 'SELL';
    confidence = Math.min(95, Math.round(75 + bearPoints * 3.5));
    if (doubleTopFound) {
      strategyName = 'Double Top Liquidity Rejection';
    } else if (isInsideGoldenPocket) {
      strategyName = 'Fibonacci Golden Pocket Short Reversal';
    } else if (sweepPDH || sweep4HHigh) {
      strategyName = 'PDH/4H Liquidity Sweep & Reject';
    } else {
      strategyName = 'SMC Bearish Order Block Mitigation';
    }
  } else {
    direction = 'WAIT';
    confidence = 55;
    strategyName = 'Equilibrium Range Consolidation';
  }

  // 6. TARGET LIQUIDITY & SL/TP CALCULATION
  let targetLiquidity = 0;
  let targetLiquidityType: 'BSL' | 'SSL' = 'BSL';
  let entry = currentPrice;
  let stopLoss = 0;
  let takeProfit = 0;

  const spreadBuffer = symbol.includes('XAU') ? 1.5 : (currentPrice * 0.0008);

  if (direction === 'BUY') {
    targetLiquidityType = 'BSL';
    // Target BSL at PDH or Swing High
    targetLiquidity = pdh > currentPrice ? pdh : (swingHigh > currentPrice ? swingHigh : currentPrice * 1.008);
    // SL below PDL, 4H Low, or recent swing low
    const structuralLow = Math.min(pdl, prev4hLow, swingLow);
    stopLoss = Math.max(structuralLow - spreadBuffer, currentPrice - (targetLiquidity - currentPrice) * 0.5);
    takeProfit = targetLiquidity;
  } else if (direction === 'SELL') {
    targetLiquidityType = 'SSL';
    // Target SSL at PDL or Swing Low
    targetLiquidity = pdl < currentPrice ? pdl : (swingLow < currentPrice ? swingLow : currentPrice * 0.992);
    // SL above PDH, 4H High, or recent swing high
    const structuralHigh = Math.max(pdh, prev4hHigh, swingHigh);
    stopLoss = Math.min(structuralHigh + spreadBuffer, currentPrice + (currentPrice - targetLiquidity) * 0.5);
    takeProfit = targetLiquidity;
  } else {
    targetLiquidity = pdh;
    stopLoss = pdl;
    takeProfit = pdh;
  }

  const riskDistance = Math.abs(entry - stopLoss);
  const rewardDistance = Math.abs(takeProfit - entry);
  const rr = riskDistance > 0 ? (rewardDistance / riskDistance).toFixed(1) : '1:2.0';
  const riskRewardRatio = `1:${rr}`;

  // 7. ACCOUNT SIZING
  const pips = symbol.includes('XAU') ? Math.round(riskDistance * 10) : Math.round(riskDistance * 10000);
  const recommendedLotSize = calculateAccountLotSize(
    accountContext?.equity || 1000,
    accountContext?.currency || 'USD',
    pips,
    1.5,
    accountContext?.preferredLotSize
  );

  const newsAlignment = direction === 'BUY'
    ? (newsSentiment.includes('BULL') ? 'Aligned Bullish Macro' : 'Cautious / Neutral News')
    : (direction === 'SELL'
      ? (newsSentiment.includes('BEAR') ? 'Aligned Bearish Macro' : 'Cautious / Neutral News')
      : 'Awaiting Clear Catalyst');

  const summary = `${direction === 'WAIT' ? 'Standby' : direction} setup via ${strategyName} on ${symbol}. Key Levels: PDH (${pdh.toFixed(symbol.includes('XAU') ? 2 : 5)}), PDL (${pdl.toFixed(symbol.includes('XAU') ? 2 : 5)}), 4H H/L, ${primaryPattern}. Session: ${sessionInfo.sessionName}. News: ${newsAlignment}.`;

  return {
    symbol,
    currentPrice,
    pdh,
    pdl,
    prev4hHigh,
    prev4hLow,
    swingHigh,
    swingLow,
    fibLevels,
    goldenPocket,
    detectedPatterns,
    primaryPattern,
    targetLiquidity,
    targetLiquidityType,
    activeSession: sessionInfo.sessionName,
    direction,
    strategyName,
    confidence,
    entry,
    stopLoss,
    takeProfit,
    riskRewardRatio,
    recommendedLotSize,
    newsAlignment,
    summary
  };
}

/**
 * Global In-Memory & LocalStorage Candlestick Cache Manager.
 * Reuses existing candles and appends new incoming ticks/candles to prevent redundant history rescans.
 */
class CandlestickCache {
  private memoryCache: Map<string, Candle[]> = new Map();
  private lastAnalysisCache: Map<string, { structure: ScannedMarketStructure; timestamp: number }> = new Map();
  private lastKnownCandleTime: Map<string, number> = new Map();

  private getKey(symbol: string, timeframe: string): string {
    return `${(symbol || 'XAUUSD').toUpperCase()}:${(timeframe || '15m').toLowerCase()}`;
  }

  public getCandles(symbol: string, timeframe: string): Candle[] {
    const key = this.getKey(symbol, timeframe);
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key) || [];
    }
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(`candle_cache_${key}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.memoryCache.set(key, parsed);
            return parsed;
          }
        }
      }
    } catch (e) {
      console.warn('[CANDLE_CACHE] Error reading local cache:', e);
    }
    return [];
  }

  public updateCandles(symbol: string, timeframe: string, incomingCandles: Candle[]): { isNewCandleFormed: boolean; candles: Candle[] } {
    const key = this.getKey(symbol, timeframe);
    const existing = this.getCandles(symbol, timeframe);
    if (!incomingCandles || incomingCandles.length === 0) {
      return { isNewCandleFormed: false, candles: existing };
    }

    const mergedMap = new Map<number, Candle>();
    for (const c of existing) {
      const t = new Date(c.time).getTime();
      if (!isNaN(t) && c.close > 0) mergedMap.set(t, c);
    }
    for (const c of incomingCandles) {
      const t = new Date(c.time).getTime();
      if (!isNaN(t) && c.close > 0) mergedMap.set(t, c);
    }

    const merged = Array.from(mergedMap.values()).sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    const capped = merged.slice(-300); // Keep last 300 candles for optimal memory
    this.memoryCache.set(key, capped);

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(`candle_cache_${key}`, JSON.stringify(capped));
      }
    } catch (e) {
      // Storage quota or private mode
    }

    const latestTime = capped.length > 0 ? new Date(capped[capped.length - 1].time).getTime() : 0;
    const prevLatest = this.lastKnownCandleTime.get(key) || 0;
    let isNewCandleFormed = false;

    if (latestTime > prevLatest && prevLatest > 0) {
      isNewCandleFormed = true;
    }
    this.lastKnownCandleTime.set(key, latestTime);

    return { isNewCandleFormed, candles: capped };
  }

  public getCachedAnalysis(symbol: string, timeframe: string): ScannedMarketStructure | null {
    const key = this.getKey(symbol, timeframe);
    const entry = this.lastAnalysisCache.get(key);
    if (entry && (Date.now() - entry.timestamp) < 60000) { // 60s cache validity
      return entry.structure;
    }
    return null;
  }

  public setCachedAnalysis(symbol: string, timeframe: string, structure: ScannedMarketStructure): void {
    const key = this.getKey(symbol, timeframe);
    this.lastAnalysisCache.set(key, { structure, timestamp: Date.now() });
  }
}

export const candleCache = new CandlestickCache();

/**
 * Token Budget Guardrail ($10.00 / month limit).
 * Strictly monitors token consumption so user spends <= $10.00/month while trading every daily session.
 */
class TokenBudgetGuardrail {
  private readonly MONTHLY_CAP_USD = 10.00;
  private readonly STORAGE_KEY = 'chatrade_token_budget_v1';

  public getBudgetStatus(): {
    monthlyCapUSD: number;
    usedUSD: number;
    remainingUSD: number;
    scansCountToday: number;
    isBudgetExceeded: boolean;
    isBudgetWarning: boolean;
  } {
    let usedUSD = 0.00;
    let scansCountToday = 0;
    let lastResetMonth = new Date().getUTCMonth();

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          const currentMonth = new Date().getUTCMonth();
          if (parsed.month === currentMonth) {
            usedUSD = Number(parsed.usedUSD) || 0;
            scansCountToday = Number(parsed.scansCountToday) || 0;
          } else {
            // New month reset
            this.resetMonthlyBudget();
          }
        }
      }
    } catch (e) {
      console.warn('[TOKEN_BUDGET] Error loading status:', e);
    }

    const remainingUSD = Math.max(0, this.MONTHLY_CAP_USD - usedUSD);
    const isBudgetExceeded = usedUSD >= this.MONTHLY_CAP_USD;
    const isBudgetWarning = usedUSD >= this.MONTHLY_CAP_USD * 0.90;

    return {
      monthlyCapUSD: this.MONTHLY_CAP_USD,
      usedUSD: Number(usedUSD.toFixed(4)),
      remainingUSD: Number(remainingUSD.toFixed(4)),
      scansCountToday,
      isBudgetExceeded,
      isBudgetWarning
    };
  }

  public recordScan(costUSD: number = 0.0001): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const currentMonth = new Date().getUTCMonth();
        const status = this.getBudgetStatus();
        const newUsed = Math.min(this.MONTHLY_CAP_USD, status.usedUSD + costUSD);
        const newCount = status.scansCountToday + 1;

        localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
          month: currentMonth,
          usedUSD: newUsed,
          scansCountToday: newCount,
          lastUpdated: Date.now()
        }));
      }
    } catch (e) {
      // Storage error
    }
  }

  public resetMonthlyBudget(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
          month: new Date().getUTCMonth(),
          usedUSD: 0.00,
          scansCountToday: 0,
          lastUpdated: Date.now()
        }));
      }
    } catch (e) {
      // Storage error
    }
  }
}

export const tokenBudget = new TokenBudgetGuardrail();

/**
 * Scans chart structure and synthesizes with AI using ultra-low-token payload.
 * Leverages cached candle history to avoid redundant historical rescans.
 */
export async function scanChartWithAI(
  candles: Candle[],
  symbol: string = 'XAUUSD',
  timeframe: string = '15m',
  accountContext?: { equity?: number; balance?: number; currency?: string; preferredLotSize?: number; maxTrades?: number },
  newsContext?: { sentiment?: string; headlines?: string[]; score?: number },
  authToken?: string
): Promise<ScannedMarketStructure> {
  // 1. Run deterministic market structure scan first
  const baseStructure = scanChartStructure(candles, symbol, accountContext, newsContext);

  // 2. Check token budget guardrail ($10.00 / month)
  const budget = tokenBudget.getBudgetStatus();
  if (budget.isBudgetExceeded || !authToken) {
    candleCache.setCachedAnalysis(symbol, timeframe, baseStructure);
    return baseStructure;
  }

  // 3. Trigger compact AI validation via /api/chart/scan-ai
  try {
    const res = await fetch('/api/chart/scan-ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        symbol,
        timeframe,
        structure: {
          currentPrice: baseStructure.currentPrice,
          pdh: baseStructure.pdh,
          pdl: baseStructure.pdl,
          prev4hHigh: baseStructure.prev4hHigh,
          prev4hLow: baseStructure.prev4hLow,
          goldenPocket: baseStructure.goldenPocket,
          primaryPattern: baseStructure.primaryPattern,
          detectedPatterns: baseStructure.detectedPatterns,
          targetLiquidity: baseStructure.targetLiquidity,
          targetLiquidityType: baseStructure.targetLiquidityType,
          activeSession: baseStructure.activeSession,
          direction: baseStructure.direction,
          confidence: baseStructure.confidence,
          strategyName: baseStructure.strategyName,
          entry: baseStructure.entry,
          stopLoss: baseStructure.stopLoss,
          takeProfit: baseStructure.takeProfit,
          riskRewardRatio: baseStructure.riskRewardRatio,
          recommendedLotSize: baseStructure.recommendedLotSize
        },
        newsContext,
        accountContext
      })
    });

    if (res.ok) {
      const data = await res.json();
      tokenBudget.recordScan(0.0001); // Record ~$0.0001 cost per scan

      if (data && data.signal) {
        const s = data.signal;
        const enhancedStructure: ScannedMarketStructure = {
          ...baseStructure,
          direction: s.direction || baseStructure.direction,
          strategyName: s.strategyName || baseStructure.strategyName,
          confidence: s.confidence || baseStructure.confidence,
          entry: s.entry || baseStructure.entry,
          stopLoss: s.stopLoss || baseStructure.stopLoss,
          takeProfit: s.takeProfit || baseStructure.takeProfit,
          targetLiquidity: s.targetLiquidity || baseStructure.targetLiquidity,
          newsAlignment: s.newsAlignment || baseStructure.newsAlignment,
          summary: s.summary || baseStructure.summary
        };
        candleCache.setCachedAnalysis(symbol, timeframe, enhancedStructure);
        return enhancedStructure;
      }
    }
  } catch (err) {
    console.warn('[CHART_SCAN_AI] Fallback to deterministic structure:', err);
  }

  candleCache.setCachedAnalysis(symbol, timeframe, baseStructure);
  return baseStructure;
}

/**
 * Runs the complete model-agnostic multi-timeframe analysis and deterministic risk engine.
 */
export async function analyzeFullMarket(
  symbol: string = 'XAUUSD',
  accountId?: string,
  timeframe: string = '15m',
  authToken?: string,
  customRiskSettings?: any
): Promise<{ success: boolean; marketState?: any; proposal?: any; riskEvaluation?: any; error?: string }> {
  try {
    const res = await fetch('/api/market/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        accountId,
        symbol,
        timeframe,
        customRiskSettings
      })
    });

    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: err };
    }

    const data = await res.json();
    return data;
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * Dispatches trade through deterministic risk engine and MetaApi.
 */
export async function executeValidatedSetup(
  accountId: string,
  proposal: any,
  authToken?: string,
  customRiskSettings?: any
): Promise<{ success: boolean; tradeResult?: any; executedParams?: any; rejectionReason?: string; riskWarnings?: string[]; error?: string }> {
  try {
    const res = await fetch('/api/trade/execute-setup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        accountId,
        proposal,
        customRiskSettings
      })
    });

    const data = await res.json();
    return data;
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

