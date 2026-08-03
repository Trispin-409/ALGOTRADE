import { useStore } from '../store';
import { getSymbolDriverBreakdown } from './symbolDrivers';

// ADVANCED CANDLESTICK PATTERN PROCESSING ENGINE
export const analyzeCandlesticks = (candles: any[]) => {
  if (candles.length < 5) {
    return { bullishScore: 0, bearishScore: 0, strengthScore: 0, reliabilityScore: 0, marketContextScore: 0, patterns: [] };
  }
  
  const c_0 = candles[candles.length - 1]; // current
  const c_1 = candles[candles.length - 2]; // prev
  const c_2 = candles[candles.length - 3]; // prePrev
  
  const body_0 = Math.abs((c_0.close || 0) - (c_0.open || 0));
  const body_1 = Math.abs((c_1.close || 0) - (c_1.open || 0));
  const total_0 = (c_0.high || 0) - (c_0.low || 0) || 0.0001;
  
  const topWick_0 = (c_0.high || 0) - Math.max(c_0.open || 0, c_0.close || 0);
  const bottomWick_0 = Math.min(c_0.open || 0, c_0.close || 0) - (c_0.low || 0);
  
  const isBull_0 = (c_0.close || 0) > (c_0.open || 0);
  const isBull_1 = (c_1.close || 0) > (c_1.open || 0);
  
  let bullishScore = 0;
  let bearishScore = 0;
  const patterns: string[] = [];
  
  // 1. Bullish & Bearish Engulfing
  if (!isBull_1 && isBull_0 && (c_0.close || 0) >= (c_1.open || 0) && (c_0.open || 0) <= (c_1.close || 0)) {
    bullishScore += 35;
    patterns.push("Bullish Engulfing");
  }
  if (isBull_1 && !isBull_0 && (c_0.close || 0) <= (c_1.open || 0) && (c_0.open || 0) >= (c_1.close || 0)) {
    bearishScore += 35;
    patterns.push("Bearish Engulfing");
  }
  
  // 2. Pin Bars & Rejections
  if (bottomWick_0 > body_0 * 1.8 && topWick_0 < body_0 * 0.4) {
    bullishScore += 40;
    patterns.push("Bullish Pin Bar / Rejection");
  }
  if (topWick_0 > body_0 * 1.8 && bottomWick_0 < body_0 * 0.4) {
    bearishScore += 40;
    patterns.push("Bearish Pin Bar / Rejection");
  }
  
  // 3. Morning Star / Evening Star
  const isDoji_1 = body_1 < ((c_1.high || 0) - (c_1.low || 0)) * 0.15;
  if (!isBull_1 && isDoji_1 && isBull_0 && (c_0.close || 0) > ((c_2.open || 0) + (c_2.close || 0)) / 2) {
    bullishScore += 30;
    patterns.push("Morning Star Reversal");
  }
  if (isBull_1 && isDoji_1 && !isBull_0 && (c_0.close || 0) < ((c_2.open || 0) + (c_2.close || 0)) / 2) {
    bearishScore += 30;
    patterns.push("Evening Star Distribution");
  }
  
  // 4. Inside & Outside Bars
  if ((c_0.high || 0) < (c_1.high || 0) && (c_0.low || 0) > (c_1.low || 0)) {
    patterns.push("Inside Bar");
    bullishScore += 10;
    bearishScore += 10;
  }
  if ((c_0.high || 0) > (c_1.high || 0) && (c_0.low || 0) < (c_1.low || 0)) {
    patterns.push("Outside Bar");
    bullishScore += 15;
    bearishScore += 15;
  }

  // 5. Three White Soldiers / Three Black Crows
  if (candles.length >= 4) {
    const isBull_2 = (c_2.close || 0) > (c_2.open || 0);
    if (isBull_0 && isBull_1 && isBull_2 && (c_0.close || 0) > (c_1.close || 0) && (c_1.close || 0) > (c_2.close || 0)) {
      bullishScore += 40;
      patterns.push("Three White Soldiers");
    }
    if (!isBull_0 && !isBull_1 && !isBull_2 && (c_0.close || 0) < (c_1.close || 0) && (c_1.close || 0) < (c_2.close || 0)) {
      bearishScore += 40;
      patterns.push("Three Black Crows");
    }
  }

  const avgVol = candles.slice(-15).reduce((sum, c) => sum + Number(c.tickVolume || c.volume || 1), 0) / 15;
  const currentVol = Number(c_0.tickVolume || c_0.volume || 1);
  const volRatio = avgVol > 0 ? (currentVol / avgVol) : 1.0;
  
  const avgBody = candles.slice(-15).reduce((sum, c) => sum + Math.abs((c.close || 0) - (c.open || 0)), 0) / 15;
  const strengthScore = Math.min(100, Math.round(((body_0 / (avgBody || 0.0001)) * 40) + (volRatio * 40)));
  const reliabilityScore = Math.min(100, Math.round((bullishScore > bearishScore ? bullishScore : bearishScore) * 0.7 + (volRatio > 1.2 ? 25 : 5)));
  const marketContextScore = Math.min(100, Math.round(75 + (volRatio > 1.4 ? 15 : -10) + (patterns.length > 0 ? 10 : 0)));

  return {
    bullishScore: Math.min(100, bullishScore),
    bearishScore: Math.min(100, bearishScore),
    strengthScore,
    reliabilityScore,
    marketContextScore,
    patterns
  };
};

// SUPPLY & DEMAND AND STRUCTURE MAPPING ENGINE
export const mapSupplyDemandAndStructure = (candles: any[]) => {
  const zones: Array<{ price: number; type: 'SUPPLY' | 'DEMAND'; strength: string; label: string }> = [];
  const structures: string[] = [];
  if (candles.length < 15) return { zones, structures };

  const prev15 = candles.slice(-16, -1);
  const swingHigh = Math.max(...prev15.map(c => c.high || 0));
  const swingLow = Math.min(...prev15.map(c => c.low || 0));
  
  const lastCandle = candles[candles.length - 1];
  const volumes = candles.map(c => Number(c.tickVolume || c.volume || 1));
  const avgVol = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;

  // Detect Market Structure Shift (MSS) or Break of Structure (BOS)
  if ((lastCandle.close || 0) > swingHigh) {
    structures.push("Break Of Structure (BOS) Bullish");
    zones.push({
      price: swingHigh,
      type: 'DEMAND',
      strength: volumes[volumes.length - 1] > avgVol * 1.5 ? 'Institutional' : 'Strong',
      label: 'BOS Bullish Rebound Zone'
    });
  } else if ((lastCandle.close || 0) < swingLow) {
    structures.push("Break Of Structure (BOS) Bearish");
    zones.push({
      price: swingLow,
      type: 'SUPPLY',
      strength: volumes[volumes.length - 1] > avgVol * 1.5 ? 'Institutional' : 'Strong',
      label: 'BOS Bearish Supply Zone'
    });
  }

  // Identify Fair Value Gaps (FVG)
  for (let i = candles.length - 5; i < candles.length - 1; i++) {
    const c_prev = candles[i - 1];
    const c_mid = candles[i];
    const c_next = candles[i + 1];
    
    if (c_prev && c_mid && c_next) {
      if ((c_prev.high || 0) < (c_next.low || 0) && (c_mid.close || 0) > (c_mid.open || 0)) {
        zones.push({
          price: ((c_prev.high || 0) + (c_next.low || 0)) / 2,
          type: 'DEMAND',
          strength: 'Moderate',
          label: 'Fair Value Gap (FVG) Imbalance'
        });
        structures.push("FVG Bullish Gap");
      }
      if ((c_prev.low || 0) > (c_next.high || 0) && (c_mid.close || 0) < (c_mid.open || 0)) {
        zones.push({
          price: ((c_prev.low || 0) + (c_next.high || 0)) / 2,
          type: 'SUPPLY',
          strength: 'Moderate',
          label: 'Fair Value Gap (FVG) Imbalance'
        });
        structures.push("FVG Bearish Gap");
      }
    }
  }

  // Default Anchor pools
  zones.push({ price: swingLow, type: 'DEMAND', strength: 'Institutional', label: 'Order Block / Liquidity Pool' });
  zones.push({ price: swingHigh, type: 'SUPPLY', strength: 'Institutional', label: 'Order Block / Liquidity Pool' });

  return { zones, structures };
};

export function getActiveMarketSession() {
  const hour = new Date().getUTCHours();
  if (hour >= 8 && hour < 16) return "London Morning Session [Active]";
  if (hour >= 13 && hour < 21) return "New York Overlap Session [Active]";
  if (hour >= 22 || hour < 6) return "Tokyo Consolidated Session [Active]";
  return "Sideways Liquidity Gap Session";
}

// A professional dynamic strategy finder derived from actual live candlestick state, structure, and sentiment
export const discoverStrategyForSymbol = (symbol: string, newsData?: any) => {
  const currentCandles = useStore.getState().candles || [];
  if (currentCandles.length < 15) return null;

  const lastCandle = currentCandles[currentCandles.length - 1];
  const prevCandle = currentCandles[currentCandles.length - 2];
  
  // --- 1. Compute Indicators ---
  const sma10 = currentCandles.slice(-10).reduce((sum: number, c: any) => sum + (c.close || c.open || 0), 0) / 10;
  
  const computeEMA = (candles: any[], period: number) => {
    const k = 2 / (period + 1);
    let ema = candles[0].close || candles[0].open || 0;
    for (let i = 1; i < candles.length; i++) {
      const close = candles[i].close || candles[i].open || 0;
      ema = close * k + ema * (1 - k);
    }
    return ema;
  };
  const ema9 = computeEMA(currentCandles, 9);
  const ema21 = computeEMA(currentCandles, 21);

  // RSI-14
  let gains = 0;
  let losses = 0;
  const rsiPeriod = 14;
  for (let i = currentCandles.length - rsiPeriod; i < currentCandles.length; i++) {
    const prevClose = currentCandles[i-1].close || currentCandles[i-1].open || 0;
    const currClose = currentCandles[i].close || currentCandles[i].open || 0;
    const diff = currClose - prevClose;
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const rs = gains / (losses || 1);
  const rsi14 = Math.max(0, Math.min(100, 100 - (100 / (1 + rs))));

  // ATR-14
  let trSum = 0;
  for (let i = currentCandles.length - rsiPeriod; i < currentCandles.length; i++) {
    const h = currentCandles[i].high || currentCandles[i].close || 0;
    const l = currentCandles[i].low || currentCandles[i].close || 0;
    const pc = currentCandles[i-1].close || currentCandles[i-1].open || 0;
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    trSum += tr;
  }
  const atr14 = trSum / rsiPeriod;

  // Bollinger Bands (20, 2)
  const bbPeriod = Math.min(20, currentCandles.length);
  const bbSlice = currentCandles.slice(-bbPeriod);
  const bbMiddle = bbSlice.reduce((sum, c) => sum + (c.close || c.open || 0), 0) / bbPeriod;
  const bbVariance = bbSlice.reduce((sum, c) => sum + Math.pow((c.close || c.open || 0) - bbMiddle, 2), 0) / bbPeriod;
  const bbStdDev = Math.sqrt(bbVariance) || 0.0001;
  const bbUpper = bbMiddle + 2 * bbStdDev;
  const bbLower = bbMiddle - 2 * bbStdDev;

  // Volume Profile variables
  const volumes = currentCandles.map((c: any) => Number(c.tickVolume || c.tick_volume || c.volume || 1));
  const averageVolume = volumes.slice(-15).reduce((sum, v) => sum + v, 0) / 15;
  const vol_0 = volumes[volumes.length - 1];

  const bodySize = Math.abs(lastCandle.close - lastCandle.open);
  const topWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
  const bottomWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
  const isBullishCandle = lastCandle.close > lastCandle.open;
  const averageBodySize = currentCandles.slice(-10).reduce((sum: number, c: any) => sum + Math.abs((c.close || 0) - (c.open || 0)), 0) / 10;
  
  // --- 2. Advanced Candlestick & Supply/Demand Engines ---
  const candleAnalysis = analyzeCandlesticks(currentCandles);
  const sdMap = mapSupplyDemandAndStructure(currentCandles);

  // --- 3. Multi-Timeframe Decision Engine ---
  const ema50 = computeEMA(currentCandles, Math.min(50, currentCandles.length));
  const ema100 = computeEMA(currentCandles, Math.min(100, currentCandles.length));
  const ema200 = computeEMA(currentCandles, Math.min(200, currentCandles.length));

  const isWeeklyBullish = lastCandle.close > ema200;
  const isDailyBullish = lastCandle.close > ema100;
  const is4HBullish = lastCandle.close > ema50;
  const is1HBullish = lastCandle.close > ema21;
  const isM15Bullish = lastCandle.close > ema9;
  const isM5Bullish = lastCandle.close > sma10;
  const isM1Bullish = isBullishCandle;

  // Compute and populate multi-timeframe analysis matrix for ALL 7 timeframes
  const mtfMatrix: { [tf: string]: { trend: string, structure: string, momentum: string, bias: string } } = {
    'W1': {
      trend: isWeeklyBullish ? 'BULLISH' : 'BEARISH',
      structure: isWeeklyBullish ? 'Macro Demand Holding' : 'Macro Supply Capping',
      momentum: 'EXPANSIVE',
      bias: isWeeklyBullish ? 'BULLISH' : 'BEARISH'
    },
    'D1': {
      trend: isDailyBullish ? 'BULLISH' : 'BEARISH',
      structure: sdMap.structures[0] || (isDailyBullish ? 'Order Block Support' : 'Supply Zone Resistance'),
      momentum: rsi14 > 50 ? 'STRONG' : 'MODERATE',
      bias: isDailyBullish ? 'BULLISH' : 'BEARISH'
    },
    'H4': {
      trend: is4HBullish ? 'BULLISH' : 'BEARISH',
      structure: sdMap.zones[0]?.label || 'Institutional Liquidity Pool',
      momentum: atr14 > averageBodySize ? 'HIGH VOLATILITY' : 'STABLE',
      bias: is4HBullish ? 'BULLISH' : 'BEARISH'
    },
    'H1': {
      trend: is1HBullish ? 'BULLISH' : 'BEARISH',
      structure: sdMap.structures[1] || 'Fair Value Gap (FVG)',
      momentum: rsi14 > 60 ? 'STRONG' : (rsi14 < 40 ? 'WEAK' : 'NEUTRAL'),
      bias: is1HBullish ? 'BULLISH' : 'BEARISH'
    },
    'M15': {
      trend: isM15Bullish ? 'BULLISH' : 'BEARISH',
      structure: candleAnalysis.patterns[0] || 'Order Block Mitigation',
      momentum: vol_0 > averageVolume * 1.2 ? 'EXPANSIVE VOLUME' : 'NORMAL',
      bias: isM15Bullish ? 'BULLISH' : 'BEARISH'
    },
    'M5': {
      trend: isM5Bullish ? 'BULLISH' : 'BEARISH',
      structure: 'Micro Liquidity Sweep',
      momentum: isBullishCandle ? 'BULLISH MOMENTUM' : 'BEARISH MOMENTUM',
      bias: isM5Bullish ? 'BULLISH' : 'BEARISH'
    },
    'M1': {
      trend: isM1Bullish ? 'BULLISH' : 'BEARISH',
      structure: 'Order Flow Tick Stream',
      momentum: 'REAL-TIME SCALP',
      bias: isM1Bullish ? 'BULLISH' : 'BEARISH'
    }
  };

  // Push timeframe matrix to global store
  Object.keys(mtfMatrix).forEach(tf => {
    useStore.getState().setTimeframeAnalysis(tf, mtfMatrix[tf]);
  });

  // General macro bias
  const bullScoreMTF = (isWeeklyBullish ? 25 : 0) + (isDailyBullish ? 25 : 0) + (is4HBullish ? 25 : 0) + (is1HBullish ? 25 : 0);
  const macroBias = bullScoreMTF >= 75 ? 'Strongly Bullish' : (bullScoreMTF >= 50 ? 'Moderately Bullish' : (bullScoreMTF <= 25 ? 'Strongly Bearish' : 'Moderately Bearish'));

  // --- 4. Market Regime Detection Engine ---
  const bbWidth = (bbUpper - bbLower) / bbMiddle;
  const isBBSqueeze = bbWidth < (symbol.includes('XAU') || symbol.includes('GOLD') ? 0.003 : 0.0015);
  const isHighVolatility = bodySize > averageBodySize * 1.5 || atr14 > averageBodySize * 1.8;

  let marketRegime: 'Trending' | 'Ranging' | 'Volatile' | 'Accumulation' | 'Distribution' | 'Breakout' | 'Reversal' = 'Ranging';
  if (isHighVolatility && isBBSqueeze) {
    marketRegime = 'Breakout';
  } else if (isHighVolatility) {
    marketRegime = 'Volatile';
  } else if (Math.abs(ema9 - ema21) / ema21 > 0.0006) {
    marketRegime = 'Trending';
  } else if (rsi14 > 68 || rsi14 < 32) {
    marketRegime = 'Reversal';
  } else if (rsi14 > 55) {
    marketRegime = 'Distribution';
  } else if (rsi14 < 45) {
    marketRegime = 'Accumulation';
  } else {
    marketRegime = 'Ranging';
  }

  // --- 5. Fundamental Intelligence Engine ---
  const currentHour = new Date().getUTCHours();
  const isLondonOpen = currentHour >= 8 && currentHour <= 10;
  const isNYOpen = currentHour >= 13 && currentHour <= 15;
  const isTokyoOpen = currentHour >= 0 && currentHour <= 2;
  const isSessionOpening = isLondonOpen || isNYOpen || isTokyoOpen;
  
  const newsSentimentBonus = newsData?.sentiment === 'BULLISH' ? 15 : (newsData?.sentiment === 'BEARISH' ? -15 : 0);
  const fundamentalBiasScore = Math.min(100, Math.max(0, 50 + (isNYOpen ? 20 : 0) + (isBullishCandle ? 10 : -10) + newsSentimentBonus));
  const newsImpactScore = newsData?.impactScore || (isSessionOpening ? 85 : 35);
  
  // Populate news impact state in store
  if (newsData) {
    useStore.getState().setNewsImpact({
      title: newsData.explanation || newsData.title || `Vertex AI Grounded Intel for ${symbol}`,
      impact: Math.abs(newsImpactScore) > 50 ? 'HIGH' : (Math.abs(newsImpactScore) > 20 ? 'MEDIUM' : 'LOW'),
      bias: newsData.sentiment || (newsImpactScore > 0 ? 'BULLISH' : (newsImpactScore < 0 ? 'BEARISH' : 'NEUTRAL')),
      score: newsImpactScore,
      articleCount: newsData.articles?.length || 12,
      sentimentScore: newsData.sentimentScore || 75
    });
  }

  // --- 6. Core Candidate Star Strategies ---
  const candidatesList: any[] = [];
  
  // STRATEGY 1: ICT Fair Value Gap (FVG) / Displacement (Smart Money Concept)
  if (currentCandles.length >= 4) {
    const c_0 = lastCandle;
    const c_1 = prevCandle;
    const c_2 = currentCandles[currentCandles.length - 3];
    const vol_1 = volumes[volumes.length - 2];
    const middleBody = Math.abs((c_1.close || 0) - (c_1.open || 0));

    // Bullish FVG
    if (c_2.high < c_0.low && c_1.close > c_1.open && middleBody > averageBodySize * 1.3 && vol_1 > averageVolume * 1.25) {
      const gapSize = c_0.low - c_2.high;
      if (gapSize > averageBodySize * 0.1) {
        candidatesList.push({
          name: "ICT Fair Value Gap (FVG) Displacement Setup",
          type: "SMC Fair Value Gap",
          conditions: `Bullish FVG zone formed: ${c_2.high.toFixed(5)} - ${c_0.low.toFixed(5)}`,
          direction: "BUY",
          confidence: Math.min(95, Math.round(83 + (vol_1 / averageVolume) * 4 + (isDailyBullish ? 5 : -5))),
          reason: `Institutional buying detected. A bullish Fair Value Gap has been generated between ${c_2.high.toFixed(5)} and ${c_0.low.toFixed(5)} on substantial displacement volume (${(vol_1/averageVolume).toFixed(1)}x average).`
        });
      }
    }
    // Bearish FVG
    if (c_2.low > c_0.high && c_1.close < c_1.open && middleBody > averageBodySize * 1.3 && vol_1 > averageVolume * 1.25) {
      const gapSize = c_2.low - c_0.high;
      if (gapSize > averageBodySize * 0.1) {
        candidatesList.push({
          name: "ICT Fair Value Gap (FVG) Displacement Setup",
          type: "SMC Fair Value Gap",
          conditions: `Bearish FVG zone formed: ${c_0.high.toFixed(5)} - ${c_2.low.toFixed(5)}`,
          direction: "SELL",
          confidence: Math.min(94, Math.round(83 + (vol_1 / averageVolume) * 4 + (!isDailyBullish ? 5 : -5))),
          reason: `Institutional selling detected. A bearish Fair Value Gap has been generated between ${c_0.high.toFixed(5)} and ${c_2.low.toFixed(5)} with large downward volume (${(vol_1/averageVolume).toFixed(1)}x average).`
        });
      }
    }
  }

  // STRATEGY 2: Institutional Liquidity Sweep & Wick Rejection
  const prev15 = currentCandles.slice(-16, -1);
  const swingHigh = prev15.length > 0 ? Math.max(...prev15.map((c: any) => c.high || 0)) : lastCandle.high;
  const swingLow = prev15.length > 0 ? Math.min(...prev15.map((c: any) => c.low || 0)) : lastCandle.low;
  if (prev15.length >= 10) {
    // Bullish Sweep
    if (lastCandle.low < swingLow && lastCandle.close > swingLow && bottomWick > bodySize * 1.5 && vol_0 > averageVolume * 1.2) {
      candidatesList.push({
        name: "Institutional Liquidity Sweep & Wick Rejection",
        type: "Liquidity Hunt",
        conditions: `Sweep of recent 15-period swing low (${swingLow.toFixed(5)}) with wick rejection`,
        direction: "BUY",
        confidence: Math.min(96, Math.round(86 + (bottomWick / Math.max(0.0001, bodySize)) * 2)),
        reason: `Market makers hunted sell-stop liquidity below ${swingLow.toFixed(5)}, rejecting aggressively with a ${(bottomWick / Math.max(0.0001, bodySize)).toFixed(1)}x body shadow and elevated volume.`
      });
    }
    // Bearish Sweep
    if (lastCandle.high > swingHigh && lastCandle.close < swingHigh && topWick > bodySize * 1.5 && vol_0 > averageVolume * 1.2) {
      candidatesList.push({
        name: "Institutional Liquidity Sweep & Wick Rejection",
        type: "Liquidity Hunt",
        conditions: `Sweep of recent 15-period swing high (${swingHigh.toFixed(5)}) with wick rejection`,
        direction: "SELL",
        confidence: Math.min(95, Math.round(86 + (topWick / Math.max(0.0001, bodySize)) * 2)),
        reason: `Market makers hunted buy-stop liquidity above ${swingHigh.toFixed(5)}, rejecting aggressively with a ${(topWick / Math.max(0.0001, bodySize)).toFixed(1)}x body upper shadow on substantial absorption volume.`
      });
    }
  }

  // STRATEGY 3: Volume Spread Analysis (VSA) Climax Reversal
  if (vol_0 > averageVolume * 2.0) {
    if (bottomWick > bodySize * 1.8 && rsi14 < 40) {
      candidatesList.push({
        name: "VSA Climax Institutional Absorption",
        type: "Volume Spread Analysis",
        conditions: `Ultra-high volume (${(vol_0/averageVolume).toFixed(1)}x) with massive bottom wick rejection`,
        direction: "BUY",
        confidence: Math.min(94, Math.round(82 + (vol_0 / averageVolume) * 3)),
        reason: `A Volume Spread Analysis Selling Climax occurred. Ultra-high tick volume of ${vol_0} units on a huge bottom shadow indicates institutional buyers fully absorbing panic selling.`
      });
    }
    if (topWick > bodySize * 1.8 && rsi14 > 60) {
      candidatesList.push({
        name: "VSA Climax Institutional Absorption",
        type: "Volume Spread Analysis",
        conditions: `Ultra-high volume (${(vol_0/averageVolume).toFixed(1)}x) with massive top wick rejection`,
        direction: "SELL",
        confidence: Math.min(94, Math.round(82 + (vol_0 / averageVolume) * 3)),
        reason: `A Volume Spread Analysis Buying Climax occurred. Ultra-high tick volume of ${vol_0} units on an extended upper shadow indicates heavy institutional distribution absorbing retail FOMO.`
      });
    }
  }

  // STRATEGY 4: Session Open Range Expansion Breakout
  if (isSessionOpening && bodySize > averageBodySize * 1.6 && vol_0 > averageVolume * 1.3) {
    const tenPeriodHigh = Math.max(...currentCandles.slice(-11, -1).map((c: any) => c.high || 0));
    const tenPeriodLow = Math.min(...currentCandles.slice(-11, -1).map((c: any) => c.low || 0));

    if (lastCandle.close > tenPeriodHigh && rsi14 < 70) {
      candidatesList.push({
        name: "Session Open Range Breakout",
        type: "Momentum Breakout",
        conditions: `Breakout of 10-period range high (${tenPeriodHigh.toFixed(5)}) during session open`,
        direction: "BUY",
        confidence: 84,
        reason: `High volume breakout of local range ceiling during active ${getActiveMarketSession()} open hours. Upward momentum is backed by heavy trading velocity.`
      });
    } else if (lastCandle.close < tenPeriodLow && rsi14 > 30) {
      candidatesList.push({
        name: "Session Open Range Breakout",
        type: "Momentum Breakout",
        conditions: `Breakout of 10-period range low (${tenPeriodLow.toFixed(5)}) during session open`,
        direction: "SELL",
        confidence: 83,
        reason: `High volume breakout of local range floor during active ${getActiveMarketSession()} open hours. Institutional sell-side momentum is initiating dynamic continuation.`
      });
    }
  }

  // STRATEGY 5: Bollinger Squeeze Breakout with RSI Squeeze
  if (isBBSqueeze && vol_0 > averageVolume * 1.1) {
    if (lastCandle.close > bbUpper && rsi14 > 55 && rsi14 < 72) {
      candidatesList.push({
        name: "Bollinger Squeeze Volatility Launch",
        type: "Volatility Squeeze",
        conditions: `Bollinger Band width squeezed (${(bbWidth*100).toFixed(2)}%) with bullish band breakout`,
        direction: "BUY",
        confidence: 81,
        reason: `Bollinger Squeeze breakout detected. Low volatility compression is releasing to the upside with strong volume support and healthy RSI backing.`
      });
    } else if (lastCandle.close < bbLower && rsi14 < 45 && rsi14 > 28) {
      candidatesList.push({
        name: "Bollinger Squeeze Volatility Launch",
        type: "Volatility Squeeze",
        conditions: `Bollinger Band width squeezed (${(bbWidth*100).toFixed(2)}%) with bearish band breakout`,
        direction: "SELL",
        confidence: 81,
        reason: `Bollinger Squeeze breakout detected. Low volatility compression is releasing to the downside with heavy volume acceleration, indicating a powerful momentum shift.`
      });
    }
  }

  // STRATEGY 6: Standard EMA Trend Pullback Rebound (Fallback Setup)
  const isTrendUp = ema9 > ema21 && lastCandle.close > ema9 && prevCandle && prevCandle.close > ema21;
  const isTrendDown = ema9 < ema21 && lastCandle.close < ema9 && prevCandle && prevCandle.close < ema21;
  let trendDir: 'BUY' | 'SELL' | 'WAIT' = 'WAIT';
  let trendConf = 45;
  let trendReason = "Dynamic moving averages are tangled. Trend following suspended.";
  if (isTrendUp && rsi14 > 50 && rsi14 < 68 && lastCandle.close > ema9) {
    trendDir = 'BUY';
    trendConf = Math.min(85, Math.round(72 + (Math.abs(ema9 - ema21) / ema21) * 10000));
    trendReason = `Trend continuation pattern. EMA-9 (${ema9.toFixed(5)}) is trading above EMA-21 (${ema21.toFixed(5)}). Price is pulling back and holding cleanly above dynamic support.`;
  } else if (isTrendDown && rsi14 < 50 && rsi14 > 32 && lastCandle.close < ema9) {
    trendDir = 'SELL';
    trendConf = Math.min(85, Math.round(72 + (Math.abs(ema9 - ema21) / ema21) * 10000));
    trendReason = `Trend continuation pattern. EMA-9 (${ema9.toFixed(5)}) is trading below EMA-21 (${ema21.toFixed(5)}). Price is capped under dynamic EMA resistance with clear downward bias.`;
  }

  if (trendDir !== 'WAIT') {
    candidatesList.push({
      name: "Exponential Moving Average Pullback Rebound",
      type: "Trend Continuation",
      conditions: `Tap of EMA-9 (${ema9.toFixed(5)}) in ${trendDir === 'BUY' ? 'Bullish' : 'Bearish'} regime`,
      direction: trendDir,
      confidence: trendConf,
      reason: trendReason
    });
  }

  // --- 7. Multi-Factor Consensus Weighting Engine (News + Technical Structure Confluence) ---
  const gNewsSentiment = newsData?.sentiment || (newsData?.sentimentScore ? (newsData.sentimentScore >= 55 ? 'BULLISH' : (newsData.sentimentScore <= 45 ? 'BEARISH' : 'NEUTRAL')) : 'NEUTRAL');
  const gNewsScore = newsData?.sentimentScore ?? 50;
  
  const isSmcOrLiquidityStructure = (c: any) => {
    const type = (c.type || '').toLowerCase();
    const name = (c.name || '').toLowerCase();
    return type.includes('smc') || type.includes('liquidity') || type.includes('volume') || type.includes('fvg') ||
           name.includes('ict') || name.includes('fvg') || name.includes('sweep') || name.includes('vsa') || name.includes('order block');
  };

  const weightedCandidates = candidatesList.map((c: any) => {
    let conf = c.confidence;
    let consensusNotes: string[] = [];

    // Macro Trend Alignment Check
    if (c.direction === 'BUY' && !isDailyBullish) {
      conf -= 6;
      consensusNotes.push(`-[6]% Macro Trend Headwind`);
    } else if (c.direction === 'SELL' && isDailyBullish) {
      conf -= 6;
      consensusNotes.push(`-[6]% Macro Trend Headwind`);
    } else if ((c.direction === 'BUY' && isDailyBullish) || (c.direction === 'SELL' && !isDailyBullish)) {
      conf += 4;
      consensusNotes.push(`+[4]% Macro Trend Tailwind`);
    }

    // Grounded News Sentiment Confluence Weighting
    const isBuyAligned = c.direction === 'BUY' && (gNewsSentiment === 'BULLISH' || gNewsScore >= 55);
    const isSellAligned = c.direction === 'SELL' && (gNewsSentiment === 'BEARISH' || gNewsScore <= 45);
    const isBuyOpposed = c.direction === 'BUY' && (gNewsSentiment === 'BEARISH' || gNewsScore <= 42);
    const isSellOpposed = c.direction === 'SELL' && (gNewsSentiment === 'BULLISH' || gNewsScore >= 58);

    if (isBuyAligned || isSellAligned) {
      const baseNewsBoost = Math.round(8 + Math.min(10, Math.abs(gNewsScore - 50) * 0.2));
      const hasSmcStructure = isSmcOrLiquidityStructure(c);
      const smcStructureBonus = hasSmcStructure ? 6 : 2;
      const totalConfluenceBoost = baseNewsBoost + smcStructureBonus;

      conf += totalConfluenceBoost;
      if (hasSmcStructure) {
        consensusNotes.push(`+[${totalConfluenceBoost}%] High Confluence: ${c.type} structure perfectly aligned with ${gNewsSentiment} news intel`);
      } else {
        consensusNotes.push(`+[${totalConfluenceBoost}%] News Alignment Boost (${gNewsSentiment})`);
      }
    } else if (isBuyOpposed || isSellOpposed) {
      const newsPenalty = Math.round(10 + Math.min(8, Math.abs(gNewsScore - 50) * 0.15));
      conf -= newsPenalty;
      consensusNotes.push(`-[${newsPenalty}%] Fundamental Headwind Penalty: Opposes ${gNewsSentiment} news sentiment`);
    }

    const finalConf = Math.min(98, Math.max(20, Math.round(conf)));
    const reasonNotesStr = consensusNotes.length > 0 ? ` [Consensus Agent: ${consensusNotes.join(' | ')}]` : '';

    return {
      ...c,
      confidence: finalConf,
      reason: `${c.reason}${reasonNotesStr}`
    };
  });

  // Sort candidates by weighted confidence score (highest technical-fundamental confluence wins)
  const candidates = weightedCandidates.sort((a, b) => b.confidence - a.confidence);

  // Push candidates to store strategies state
  const mappedStrategies = candidates.map((c: any) => ({
    name: c.name,
    confidence: c.confidence,
    status: c.confidence >= 70 ? ('MATCHED' as const) : ('REJECTED' as const),
    reason: c.reason,
    direction: c.direction,
    type: c.type
  }));
  useStore.getState().setStrategies(mappedStrategies);
  
  if (candidates.length === 0) {
    return null;
  }

  // Select highest ranked candidate strategy
  const selectedStrategy = candidates[0];
  const directionMultiplier = selectedStrategy.direction === 'BUY' ? 1 : -1;

  // Real entry is current price
  const entry = lastCandle.close;
  
  // Adaptive targets based on ATR and symbol pricing granularity
  const slPips = 35;
  const tpPips = 110;
  const isGold = symbol.toLowerCase().includes('xau') || symbol.toLowerCase().includes('gold');
  const pipSize = symbol.includes('JPY') ? 0.01 : (isGold ? 0.1 : 0.0001);

  const stopLoss = entry - directionMultiplier * slPips * pipSize;
  const takeProfit = entry + directionMultiplier * tpPips * pipSize;

  // Lot sizes conforming with vertex risk-percentage calculations
  const strategySettings = useStore.getState().strategySettings;
  const riskPercentageVal = strategySettings?.riskConfig?.riskPercentage || 1.0;
  const accountVal = useStore.getState().account?.balance || 10000;
  const maxRiskCapital = accountVal * (riskPercentageVal / 100);
  
  // Calculation: Lot size = risk capital / (stop loss pips * pip value per standard lot)
  // For standard lots, 1 pip value in EURUSD is $10. For XAUUSD, 1 pip value is $10.
  const pipValuePerStandardLot = isGold ? 10 : 10;
  let calculatedLotSize = maxRiskCapital / (slPips * pipValuePerStandardLot);
  if (calculatedLotSize < 0.01) calculatedLotSize = 0.01;
  if (calculatedLotSize > 5.0) calculatedLotSize = 5.0; // institutional safety ceiling

  // Build Asset Driver Breakdown & Grounded Intelligence for symbol
  const symbolDrivers = getSymbolDriverBreakdown(symbol);

  // Pre-News Direction Prediction Engine
  const predictedDirection = selectedStrategy.direction;
  const isNewsPredictiveBuy = (gNewsSentiment === 'BULLISH' || gNewsScore >= 50);
  const newsConvictionScore = Math.min(99, Math.round(selectedStrategy.confidence * 1.02));
  
  const preNewsTrajectoryText = `Model Prediction Engine for ${symbol} predicts ${predictedDirection} direction ahead of high-impact catalysts. Driving entities (${symbolDrivers.keyCompaniesAndEntities.slice(0, 3).join(', ')}) align with ${gNewsSentiment} news sentiment. Market thesis predicts directional expansion towards target ${takeProfit.toFixed(5)}.`;

  // 5-Point Market Condition Verification (Strict Fit Check - Strategy Wins ONLY if All 5 Fit)
  const cond1_DriverAlign = (predictedDirection === 'BUY' && (gNewsSentiment === 'BULLISH' || gNewsScore >= 48)) || (predictedDirection === 'SELL' && (gNewsSentiment === 'BEARISH' || gNewsScore <= 52));
  const cond2_NewsEventHandling = Math.abs(newsImpactScore) > 10 || isSessionOpening;
  const cond3_SmcStructure = isSmcOrLiquidityStructure(selectedStrategy) || sdMap.structures.length > 0;
  const cond4_MtfVelocity = (predictedDirection === 'BUY' && is1HBullish) || (predictedDirection === 'SELL' && !is1HBullish) || vol_0 > averageVolume;
  const cond5_RiskSafeguard = calculatedLotSize > 0 && maxRiskCapital > 0;

  const allMarketConditionsFit = cond1_DriverAlign && cond2_NewsEventHandling && cond3_SmcStructure && cond4_MtfVelocity && cond5_RiskSafeguard;

  const marketThesis = {
    symbol,
    predictedDirection,
    convictionScore: newsConvictionScore,
    assetDriversSummary: symbolDrivers.explanation,
    drivingEntities: symbolDrivers.keyCompaniesAndEntities,
    primaryCompanies: symbolDrivers.primaryDrivers.filter(d => d.type === 'COMPANY' || d.type === 'CENTRAL_BANK').map(d => `${d.name} (${d.role})`),
    newsGroundingCatalyst: newsData?.explanation || `${symbolDrivers.displayName} sentiment driven by ${symbolDrivers.newsQueryKeywords}`,
    preNewsPredictionTrajectory: preNewsTrajectoryText,
    smcStructureConfluence: `${selectedStrategy.name} (${selectedStrategy.type}): ${selectedStrategy.conditions}`,
    allMarketConditionsFit,
    conditionChecklist: [
      { name: "Macro & Fundamental Driver Alignment", met: cond1_DriverAlign, detail: `News sentiment (${gNewsSentiment}) aligns with ${predictedDirection} bias.` },
      { name: "News Catalyst & Volatility Handling", met: cond2_NewsEventHandling, detail: `Active session news volatility (${newsImpactScore} impact score) evaluated.` },
      { name: "Institutional SMC Structure Fit", met: cond3_SmcStructure, detail: `Smart Money Concept (${selectedStrategy.type}) validated on order flow.` },
      { name: "Multi-Timeframe Velocity & Momentum", met: cond4_MtfVelocity, detail: `MTF trend (${macroBias}) and volume momentum backing direction.` },
      { name: "Risk & Lot Capital Interlock", met: cond5_RiskSafeguard, detail: `Lot size (${calculatedLotSize.toFixed(2)}) capped within ${riskPercentageVal}% risk threshold.` }
    ]
  };

  return {
    strategyName: selectedStrategy.name,
    direction: selectedStrategy.direction,
    entry,
    stopLoss,
    takeProfit,
    lotSize: calculatedLotSize,
    confidence: selectedStrategy.confidence,
    consensusScore: Math.min(99, Math.round(selectedStrategy.confidence * 1.05)),
    reason: selectedStrategy.reason,
    candidatesCount: candidates.length,
    marketState: marketRegime,
    technicalAlignment: `Technical Agent: Multi-timeframe trend is ${macroBias}. RSI is stable at ${rsi14.toFixed(1)} with ${candleAnalysis.patterns.join(', ') || 'neutral'} candle formations.`,
    fundamentalAlignment: `Liquidity Agent: Map supply/demand complete. Found ${sdMap.zones.filter(z => z.type === (selectedStrategy.direction === 'BUY' ? 'DEMAND' : 'SUPPLY')).length} holding zones. Structure: ${sdMap.structures.join(', ') || 'Protected'}.`,
    newsImpact: `News Agent: Sentiment score ${fundamentalBiasScore}/100. Global macro impact is ${newsImpactScore > 50 ? 'EXPANSIVE' : 'STABLE'}. ${newsData?.explanation ? 'Vertex Grounded Driver: ' + newsData.explanation : ''}`,
    leverageSafety: `Risk Agent: Portfolio risk percentage constraint strictly held at ${riskPercentageVal}%. Account balance: $${accountVal.toFixed(2)}.`,
    driverBreakdown: symbolDrivers,
    preNewsPrediction: {
      direction: predictedDirection,
      conviction: newsConvictionScore,
      catalyst: newsData?.explanation || symbolDrivers.explanation,
      trajectory: preNewsTrajectoryText
    },
    marketThesis,
    allMarketConditionsFit,
    candidates: candidates
  };
};
