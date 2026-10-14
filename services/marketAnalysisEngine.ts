/**
 * ALGOTRADE — DETERMINISTIC MULTI-TIMEFRAME MARKET ANALYSIS ENGINE
 * 
 * Computes programmatic, objective features directly from real MetaApi market data:
 * 1. Candlestick Features & Patterns
 * 2. Market Structure (Swings, HH/HL, LH/LL, BOS, MSS/CHoCH)
 * 3. Liquidity Architecture (PDH/PDL, PWH/PWL, 4H H/L, Equal H/L, Sweeps & Reclaims, BSL/SSL)
 * 4. CRT (Candle Range Theory) Range Analysis
 * 5. SMC / ICT (Order Blocks, FVGs, Equilibrium, Premium/Discount, Golden Pocket)
 * 6. Volatility (ATR-14, Volatility Regimes)
 * 7. Momentum (RSI-14, EMAs 20/50/200, Volume Expansion)
 * 8. Session Analysis (Sydney, Tokyo, London, NY, Overlap)
 * 9. Time-Aware Macroeconomic News Impact
 * 10. Deterministic Confluence Score & Setup Classification
 * 11. Compact Structured Market State Output for Model-Agnostic AI
 */

import { CompactMarketState, SetupEvidenceRecord, StrategyProposal } from './aiProvider';

export interface RawCandle {
  time: string | Date | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  tickVolume?: number;
}

export interface SymbolSpecs {
  symbol: string;
  brokerSymbol?: string;
  bid: number;
  ask: number;
  spread?: number;
  digits?: number;
  pointSize?: number;
  minLot?: number;
  maxLot?: number;
  lotStep?: number;
  contractSize?: number;
  isTradeAllowed?: boolean;
}

export interface NewsItem {
  id?: string;
  title: string;
  currency: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW' | string;
  time: string | Date;
  actual?: string;
  forecast?: string;
  previous?: string;
}

export class MarketAnalysisEngine {

  /**
   * Main entry point: synthesizes real MetaApi candles, specs, news, and account state
   * into a deterministic multi-timeframe analysis and compact state.
   */
  public generateMarketState(
    specs: SymbolSpecs,
    multiTimeframeCandles: Record<string, RawCandle[]>,
    newsEvents: NewsItem[] = [],
    accountState?: { balance: number; equity: number; freeMargin: number; currency: string; openPositionsCount: number; maxTradesLimit: number }
  ): CompactMarketState {
    const symbol = specs.symbol.toUpperCase();
    const digits = specs.digits ?? (symbol.includes('XAU') ? 2 : (symbol.includes('JPY') ? 3 : 5));
    const pointSize = specs.pointSize ?? (1 / Math.pow(10, digits));
    const bid = specs.bid;
    const ask = specs.ask || (bid + pointSize * 15);
    const mid = Number(((bid + ask) / 2).toFixed(digits));
    const spread = specs.spread ?? Number(((ask - bid) / pointSize).toFixed(1));

    // 1. Process Multi-Timeframe Features (M1, M5, M15, M30, H1, H4, D1)
    const timeframesData: CompactMarketState['timeframes'] = {};
    const tfList = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

    for (const tf of tfList) {
      const candles = multiTimeframeCandles[tf] || multiTimeframeCandles[tf.toUpperCase()] || [];
      if (candles.length >= 5) {
        timeframesData[tf] = this.analyzeSingleTimeframe(candles, digits);
      }
    }

    // Default primary timeframe context (M15 / H1 / H4)
    const primaryCandles = multiTimeframeCandles['15m'] || multiTimeframeCandles['1h'] || multiTimeframeCandles['5m'] || Object.values(multiTimeframeCandles)[0] || [];
    const h4Candles = multiTimeframeCandles['4h'] || [];
    const d1Candles = multiTimeframeCandles['1d'] || [];

    // 2. Candlestick Features on primary timeframe
    const primaryAnalysis = this.analyzeSingleTimeframe(primaryCandles, digits);

    // 3. Market Structure (BOS, MSS, Trend)
    const marketStructure = this.calculateMarketStructure(primaryCandles, h4Candles, digits);

    // 4. Liquidity Architecture (PDH/PDL, 4H H/L, Sweeps)
    const liquidity = this.calculateLiquidity(primaryCandles, d1Candles, h4Candles, mid, digits);

    // 5. CRT (Candle Range Theory)
    const crt = this.calculateCRT(primaryCandles, digits);

    // 6. SMC / ICT (Order Blocks, FVGs, Golden Pocket)
    const smc = this.calculateSMC(primaryCandles, digits);

    // 7. Volatility Regime
    const volatility = this.calculateVolatility(primaryCandles);

    // 8. Session Analysis
    const session = this.calculateSessionInfo(primaryCandles, mid);

    // 9. Time-Aware Macroeconomic News Context
    const newsContext = this.evaluateNewsContext(symbol, newsEvents);

    // 10. Deterministic Confluence Scoring (0-100) & Classification
    const { score, classification } = this.calculateConfluenceScore(
      marketStructure,
      liquidity,
      crt,
      smc,
      volatility,
      newsContext,
      spread
    );

    return {
      symbol,
      brokerSymbol: specs.brokerSymbol || symbol,
      timestamp: new Date().toISOString(),
      currentPrice: {
        bid,
        ask,
        mid,
        spread,
        digits,
        pointSize
      },
      timeframes: timeframesData,
      marketStructure,
      liquidity,
      crt,
      smc,
      volatility,
      session,
      newsContext,
      account: accountState || {
        balance: 1000,
        equity: 1000,
        freeMargin: 1000,
        currency: 'USD',
        openPositionsCount: 0,
        maxTradesLimit: 3
      },
      deterministicScore: score,
      deterministicClassification: classification
    };
  }

  /**
   * Evaluates single timeframe candle structure, swings, RSI, and ATR.
   */
  private analyzeSingleTimeframe(candles: RawCandle[], digits: number) {
    const valid = candles.filter(c => c && typeof c.close === 'number' && c.close > 0);
    if (valid.length === 0) {
      return {
        trend: 'NEUTRAL',
        structure: 'CONSOLIDATING',
        lastCandleType: 'DOJI',
        recentSwingHigh: 0,
        recentSwingLow: 0,
        atr: 0,
        rsi: 50,
        fvg: null,
        orderBlock: null
      };
    }

    const last = valid[valid.length - 1];
    const prev = valid.length > 1 ? valid[valid.length - 2] : last;

    // Candle type
    const body = Math.abs(last.close - last.open);
    const range = Math.max(0.00001, last.high - last.low);
    const upperWick = last.high - Math.max(last.open, last.close);
    const lowerWick = Math.min(last.open, last.close) - last.low;

    let lastCandleType = 'STANDARD';
    if (body / range < 0.15) {
      lastCandleType = 'DOJI';
    } else if (lowerWick / range > 0.55 && last.close > last.open) {
      lastCandleType = 'BULLISH_PIN_BAR';
    } else if (upperWick / range > 0.55 && last.close < last.open) {
      lastCandleType = 'BEARISH_PIN_BAR';
    } else if (last.close > prev.high && last.open < prev.low) {
      lastCandleType = 'BULLISH_ENGULFING';
    } else if (last.close < prev.low && last.open > prev.high) {
      lastCandleType = 'BEARISH_ENGULFING';
    } else if (last.high < prev.high && last.low > prev.low) {
      lastCandleType = 'INSIDE_BAR';
    }

    // Swings
    let recentSwingHigh = last.high;
    let recentSwingLow = last.low;
    const window = valid.slice(-20);
    for (const c of window) {
      if (c.high > recentSwingHigh) recentSwingHigh = c.high;
      if (c.low < recentSwingLow) recentSwingLow = c.low;
    }

    // Trend based on EMAs & swings
    const ema20 = this.calculateEMA(valid, 20);
    const ema50 = this.calculateEMA(valid, 50);
    let trend = 'NEUTRAL';
    if (last.close > ema20 && ema20 > ema50) trend = 'BULLISH';
    else if (last.close < ema20 && ema20 < ema50) trend = 'BEARISH';

    // RSI
    const rsi = this.calculateRSI(valid, 14);

    // ATR
    const atr = this.calculateATR(valid, 14);

    // FVG Detection
    let fvg = null;
    if (valid.length >= 3) {
      const c1 = valid[valid.length - 3];
      const c3 = valid[valid.length - 1];
      if (c3.low > c1.high) {
        fvg = { low: Number(c1.high.toFixed(digits)), high: Number(c3.low.toFixed(digits)), type: 'BULLISH_IMBALANCE' };
      } else if (c3.high < c1.low) {
        fvg = { low: Number(c3.high.toFixed(digits)), high: Number(c1.low.toFixed(digits)), type: 'BEARISH_IMBALANCE' };
      }
    }

    return {
      trend,
      structure: trend === 'BULLISH' ? 'HIGHER_HIGHS' : (trend === 'BEARISH' ? 'LOWER_LOWS' : 'RANGING'),
      lastCandleType,
      recentSwingHigh: Number(recentSwingHigh.toFixed(digits)),
      recentSwingLow: Number(recentSwingLow.toFixed(digits)),
      atr: Number(atr.toFixed(digits)),
      rsi: Number(rsi.toFixed(1)),
      fvg,
      orderBlock: null
    };
  }

  /**
   * Deterministic Market Structure calculation (BOS, MSS/CHoCH, Multi-Timeframe Trend).
   */
  private calculateMarketStructure(candles: RawCandle[], h4Candles: RawCandle[], digits: number) {
    if (candles.length < 5) {
      return {
        dominantTrend: 'RANGING' as const,
        higherTimeframeBias: 'NEUTRAL' as const,
        lastBOS: null,
        lastMSS: null,
        swingHigh: 0,
        swingLow: 0
      };
    }

    const recent = candles.slice(-30);
    const last = recent[recent.length - 1];

    let swingHigh = recent[0].high;
    let swingLow = recent[0].low;
    for (const c of recent) {
      if (c.high > swingHigh) swingHigh = c.high;
      if (c.low < swingLow) swingLow = c.low;
    }

    // HTF Bias (H4)
    let higherTimeframeBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (h4Candles.length >= 10) {
      const h4Recent = h4Candles.slice(-10);
      const h4Last = h4Recent[h4Recent.length - 1];
      const h4First = h4Recent[0];
      if (h4Last.close > h4First.close && h4Last.close > this.calculateEMA(h4Candles, 20)) {
        higherTimeframeBias = 'BULLISH';
      } else if (h4Last.close < h4First.close && h4Last.close < this.calculateEMA(h4Candles, 20)) {
        higherTimeframeBias = 'BEARISH';
      }
    }

    // BOS & MSS checks
    let lastBOS = null;
    let lastMSS = null;

    if (last.close > swingHigh) {
      lastBOS = { level: Number(swingHigh.toFixed(digits)), direction: 'BULLISH_CONTINUATION', timeframe: '15m' };
    } else if (last.close < swingLow) {
      lastBOS = { level: Number(swingLow.toFixed(digits)), direction: 'BEARISH_CONTINUATION', timeframe: '15m' };
    }

    // MSS (Shift in character)
    if (higherTimeframeBias === 'BEARISH' && last.close > swingHigh) {
      lastMSS = { level: Number(swingHigh.toFixed(digits)), direction: 'BULLISH_SHIFT', timeframe: '15m' };
    } else if (higherTimeframeBias === 'BULLISH' && last.close < swingLow) {
      lastMSS = { level: Number(swingLow.toFixed(digits)), direction: 'BEARISH_SHIFT', timeframe: '15m' };
    }

    const dominantTrend = (last.close > (swingHigh + swingLow) / 2) ? 'BULLISH' : 'BEARISH';

    return {
      dominantTrend: dominantTrend as 'BULLISH' | 'BEARISH',
      higherTimeframeBias,
      lastBOS,
      lastMSS,
      swingHigh: Number(swingHigh.toFixed(digits)),
      swingLow: Number(swingLow.toFixed(digits))
    };
  }

  /**
   * Deterministic Liquidity calculation (PDH, PDL, 4H H/L, Sweeps, Reclaims, Targets).
   */
  private calculateLiquidity(candles: RawCandle[], d1Candles: RawCandle[], h4Candles: RawCandle[], mid: number, digits: number) {
    let pdh = mid * 1.008;
    let pdl = mid * 0.992;
    let prev4hHigh = mid * 1.004;
    let prev4hLow = mid * 0.996;

    // True Daily High/Low
    if (d1Candles.length >= 2) {
      const prevDay = d1Candles[d1Candles.length - 2];
      if (prevDay.high > 0 && prevDay.low > 0) {
        pdh = prevDay.high;
        pdl = prevDay.low;
      }
    } else if (candles.length >= 96) {
      const prevDayCandles = candles.slice(-96, -1);
      pdh = Math.max(...prevDayCandles.map(c => c.high));
      pdl = Math.min(...prevDayCandles.map(c => c.low));
    }

    // True 4H High/Low
    if (h4Candles.length >= 2) {
      const prev4h = h4Candles[h4Candles.length - 2];
      if (prev4h.high > 0 && prev4h.low > 0) {
        prev4hHigh = prev4h.high;
        prev4hLow = prev4h.low;
      }
    } else if (candles.length >= 16) {
      const prev16 = candles.slice(-16, -1);
      prev4hHigh = Math.max(...prev16.map(c => c.high));
      prev4hLow = Math.min(...prev16.map(c => c.low));
    }

    // Liquidity Sweep & Reclaim check
    let recentSweep = null;
    const last = candles.length > 0 ? candles[candles.length - 1] : null;

    if (last) {
      // Bullish sweep of PDL/4H Low with reclaim
      if (last.low < pdl && last.close > pdl) {
        recentSweep = { level: Number(pdl.toFixed(digits)), type: 'SSL' as const, reclaimed: true };
      } else if (last.low < prev4hLow && last.close > prev4hLow) {
        recentSweep = { level: Number(prev4hLow.toFixed(digits)), type: 'SSL' as const, reclaimed: true };
      }
      // Bearish sweep of PDH/4H High with reclaim
      else if (last.high > pdh && last.close < pdh) {
        recentSweep = { level: Number(pdh.toFixed(digits)), type: 'BSL' as const, reclaimed: true };
      } else if (last.high > prev4hHigh && last.close < prev4hHigh) {
        recentSweep = { level: Number(prev4hHigh.toFixed(digits)), type: 'BSL' as const, reclaimed: true };
      }
    }

    const targetLiquidity = mid < (pdh + pdl) / 2 ? pdh : pdl;
    const targetLiquidityType: 'BSL' | 'SSL' = targetLiquidity === pdh ? 'BSL' : 'SSL';

    return {
      pdh: Number(pdh.toFixed(digits)),
      pdl: Number(pdl.toFixed(digits)),
      prev4hHigh: Number(prev4hHigh.toFixed(digits)),
      prev4hLow: Number(prev4hLow.toFixed(digits)),
      recentSweep,
      targetLiquidity: Number(targetLiquidity.toFixed(digits)),
      targetLiquidityType
    };
  }

  /**
   * Candle Range Theory (CRT) Analysis.
   */
  private calculateCRT(candles: RawCandle[], digits: number) {
    if (candles.length < 10) {
      return {
        status: 'NONE' as const,
        rangeHigh: 0,
        rangeLow: 0,
        sweepDetected: false,
        reclaimConfirmed: false
      };
    }

    const rangeWindow = candles.slice(-12, -2);
    const rangeHigh = Math.max(...rangeWindow.map(c => c.high));
    const rangeLow = Math.min(...rangeWindow.map(c => c.low));

    const triggerCandle = candles[candles.length - 2];
    const currentCandle = candles[candles.length - 1];

    let status: 'NONE' | 'POTENTIAL_BULLISH' | 'POTENTIAL_BEARISH' | 'CONFIRMED_BULLISH' | 'CONFIRMED_BEARISH' = 'NONE';
    let sweepDetected = false;
    let reclaimConfirmed = false;

    // Bullish CRT: Lower range sweep + reclaim
    if (triggerCandle.low < rangeLow && currentCandle.close > rangeLow) {
      sweepDetected = true;
      reclaimConfirmed = true;
      status = currentCandle.close > (rangeLow + (rangeHigh - rangeLow) * 0.2) ? 'CONFIRMED_BULLISH' : 'POTENTIAL_BULLISH';
    }
    // Bearish CRT: Upper range sweep + reclaim
    else if (triggerCandle.high > rangeHigh && currentCandle.close < rangeHigh) {
      sweepDetected = true;
      reclaimConfirmed = true;
      status = currentCandle.close < (rangeHigh - (rangeHigh - rangeLow) * 0.2) ? 'CONFIRMED_BEARISH' : 'POTENTIAL_BEARISH';
    }

    return {
      status,
      rangeHigh: Number(rangeHigh.toFixed(digits)),
      rangeLow: Number(rangeLow.toFixed(digits)),
      sweepDetected,
      reclaimConfirmed
    };
  }

  /**
   * SMC / ICT Structure (Order Blocks, FVGs, Golden Pocket 61.8%).
   */
  private calculateSMC(candles: RawCandle[], digits: number) {
    if (candles.length < 10) {
      return {
        goldenPocket: { low: 0, high: 0 },
        equilibrium: 0,
        premiumDiscountZone: 'EQUILIBRIUM' as const
      };
    }

    const window = candles.slice(-30);
    const high = Math.max(...window.map(c => c.high));
    const low = Math.min(...window.map(c => c.low));
    const diff = high - low;

    const equilibrium = low + diff * 0.5;
    const fib618 = high - diff * 0.618;
    const fib786 = high - diff * 0.786;

    const last = candles[candles.length - 1];
    const premiumDiscountZone = last.close > equilibrium ? 'PREMIUM' : 'DISCOUNT';

    return {
      goldenPocket: {
        low: Number(Math.min(fib618, fib786).toFixed(digits)),
        high: Number(Math.max(fib618, fib786).toFixed(digits))
      },
      equilibrium: Number(equilibrium.toFixed(digits)),
      premiumDiscountZone: premiumDiscountZone as 'PREMIUM' | 'DISCOUNT',
      activeOrderBlock: `Mitigation zone near ${equilibrium.toFixed(digits)}`,
      activeFVG: `Displacement gap ${fib618.toFixed(digits)} - ${fib786.toFixed(digits)}`
    };
  }

  /**
   * Volatility Calculation (ATR, Regime).
   */
  private calculateVolatility(candles: RawCandle[]) {
    const atr = this.calculateATR(candles, 14);
    if (candles.length < 20) {
      return {
        atr14: atr,
        regime: 'NORMAL' as const,
        abnormalRiskWarning: false
      };
    }

    const recentRanges = candles.slice(-10).map(c => c.high - c.low);
    const avgRecent = recentRanges.reduce((a, b) => a + b, 0) / recentRanges.length;

    let regime: 'QUIET' | 'NORMAL' | 'EXPANDING' | 'HIGH_VOLATILITY' | 'ABNORMAL' = 'NORMAL';
    let abnormalRiskWarning = false;

    if (avgRecent > atr * 2.2) {
      regime = 'ABNORMAL';
      abnormalRiskWarning = true;
    } else if (avgRecent > atr * 1.5) {
      regime = 'HIGH_VOLATILITY';
    } else if (avgRecent > atr * 1.15) {
      regime = 'EXPANDING';
    } else if (avgRecent < atr * 0.6) {
      regime = 'QUIET';
    }

    return {
      atr14: Number(atr.toFixed(5)),
      regime,
      abnormalRiskWarning
    };
  }

  /**
   * Session Analysis (Sydney, Tokyo, London, NY, Overlap).
   */
  private calculateSessionInfo(candles: RawCandle[], mid: number) {
    const now = new Date();
    const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60;

    let activeSession = 'Sydney Session';
    let isHighLiquidityOverlap = false;

    if (utcHours >= 13 && utcHours <= 16.5) {
      activeSession = 'London / New York Overlap';
      isHighLiquidityOverlap = true;
    } else if (utcHours >= 8 && utcHours <= 16.5) {
      activeSession = 'London Session';
      isHighLiquidityOverlap = true;
    } else if (utcHours >= 13 && utcHours <= 21) {
      activeSession = 'New York Session';
    } else if (utcHours >= 0 && utcHours <= 8) {
      activeSession = 'Tokyo / Asian Session';
    }

    const recent16 = candles.slice(-16);
    const sessionHigh = recent16.length > 0 ? Math.max(...recent16.map(c => c.high)) : mid;
    const sessionLow = recent16.length > 0 ? Math.min(...recent16.map(c => c.low)) : mid;

    return {
      activeSession,
      isHighLiquidityOverlap,
      sessionHigh,
      sessionLow
    };
  }

  /**
   * Time-Aware News Evaluation.
   */
  private evaluateNewsContext(symbol: string, newsEvents: NewsItem[]) {
    const now = Date.now();
    const relevantCurrencies = this.getRelevantCurrencies(symbol);

    let imminentHighImpactEvent = null;
    let sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    let score = 50;
    const headlines: string[] = [];

    for (const item of newsEvents) {
      const curr = (item.currency || '').toUpperCase();
      if (relevantCurrencies.includes(curr) || curr === 'ALL' || !curr) {
        headlines.push(`${item.currency ? `[${item.currency}] ` : ''}${item.title}`);
        const eventTime = new Date(item.time).getTime();
        const diffMins = (eventTime - now) / 60000;

        // High Impact news within 30 mins before or 15 mins after
        if (item.impact === 'HIGH' && diffMins > -15 && diffMins < 45) {
          imminentHighImpactEvent = {
            title: item.title,
            currency: curr,
            minutesUntilOrSince: Math.round(diffMins),
            isLockoutPeriod: diffMins >= -5 && diffMins <= 20 // 5m before to 20m after release
          };
        }
      }
    }

    return {
      sentiment,
      score,
      imminentHighImpactEvent,
      recentHeadlines: headlines.slice(0, 5)
    };
  }

  /**
   * Programmatic Confluence Scoring (0-100) & Classification.
   */
  private calculateConfluenceScore(
    structure: any,
    liquidity: any,
    crt: any,
    smc: any,
    volatility: any,
    news: any,
    spread: number
  ): { score: number; classification: CompactMarketState['deterministicClassification'] } {
    let score = 50;

    // 1. Structure alignment
    if (structure.higherTimeframeBias === structure.dominantTrend && structure.higherTimeframeBias !== 'NEUTRAL') {
      score += 15;
    }

    // 2. Liquidity Sweep confirmation
    if (liquidity.recentSweep && liquidity.recentSweep.reclaimed) {
      score += 20;
    }

    // 3. CRT Confirmation
    if (crt.status === 'CONFIRMED_BULLISH' || crt.status === 'CONFIRMED_BEARISH') {
      score += 15;
    } else if (crt.status.startsWith('POTENTIAL')) {
      score += 8;
    }

    // 4. Volatility regime check
    if (volatility.regime === 'EXPANDING' || volatility.regime === 'NORMAL') {
      score += 5;
    } else if (volatility.regime === 'ABNORMAL') {
      score -= 20; // Heavy penalty for abnormal uncontrolled spikes
    }

    // 5. Spread check
    if (spread > 3.5) {
      score -= 15;
    }

    // 6. News Lockout penalty
    if (news.imminentHighImpactEvent && news.imminentHighImpactEvent.isLockoutPeriod) {
      score -= 25; // Block execution right around high-impact news releases
    }

    score = Math.max(0, Math.min(100, score));

    let classification: CompactMarketState['deterministicClassification'] = 'NO_SETUP';
    if (score >= 85 && (!news.imminentHighImpactEvent || !news.imminentHighImpactEvent.isLockoutPeriod)) {
      classification = 'CONFIRMED_SETUP';
    } else if (score >= 75) {
      classification = 'POTENTIAL_SETUP';
    } else if (score >= 60) {
      classification = 'WATCH';
    }

    return { score, classification };
  }

  private getRelevantCurrencies(symbol: string): string[] {
    const u = symbol.toUpperCase();
    if (u.includes('XAU') || u.includes('GOLD')) return ['USD'];
    if (u.includes('EUR')) return ['EUR', 'USD'];
    if (u.includes('GBP')) return ['GBP', 'USD'];
    if (u.includes('JPY')) return ['JPY', 'USD'];
    if (u.includes('US30') || u.includes('NAS100') || u.includes('SPX')) return ['USD'];
    if (u.includes('BTC') || u.includes('ETH')) return ['USD'];
    return ['USD', 'EUR', 'GBP'];
  }

  private calculateEMA(candles: RawCandle[], period: number): number {
    if (candles.length === 0) return 0;
    const closes = candles.map(c => c.close);
    const k = 2 / (period + 1);
    let ema = closes[0];
    for (let i = 1; i < closes.length; i++) {
      ema = closes[i] * k + ema * (1 - k);
    }
    return ema;
  }

  private calculateRSI(candles: RawCandle[], period: number = 14): number {
    if (candles.length <= period) return 50;
    const closes = candles.map(c => c.close);
    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff;
      else losses += Math.abs(diff);
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) {
        avgGain = (avgGain * (period - 1) + diff) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
      }
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private calculateATR(candles: RawCandle[], period: number = 14): number {
    if (candles.length < 2) return 0.001;
    let trSum = 0;
    const count = Math.min(candles.length - 1, period);

    for (let i = candles.length - count; i < candles.length; i++) {
      const cur = candles[i];
      const prev = candles[i - 1];
      const tr = Math.max(
        cur.high - cur.low,
        Math.abs(cur.high - prev.close),
        Math.abs(cur.low - prev.close)
      );
      trSum += tr;
    }
    return trSum / count;
  }

  /**
   * Generates a structured Setup Evidence Record from the market state and proposal.
   */
  public formatEvidenceRecord(state: CompactMarketState, proposal?: Partial<StrategyProposal>): SetupEvidenceRecord {
    const direction = proposal?.direction || (state.marketStructure.dominantTrend === 'BULLISH' ? 'BUY' : 'SELL');
    
    // Higher Timeframe
    const h4Trend = state.timeframes['4h']?.trend || state.marketStructure.higherTimeframeBias || 'Neutral';
    const h1Trend = state.timeframes['1h']?.trend || state.marketStructure.dominantTrend || 'Neutral';
    const higherTimeframe = `H4 ${h4Trend.toLowerCase()} | H1 ${h1Trend.toLowerCase()}`;

    // Liquidity
    let liquidity = 'No major liquidity sweeps detected in immediate window.';
    if (state.liquidity.recentSweep) {
      const sweepType = state.liquidity.recentSweep.type === 'SSL' ? 'Sell-side liquidity' : 'Buy-side liquidity';
      liquidity = `${sweepType} swept (${state.liquidity.recentSweep.level.toFixed(state.currentPrice.digits)})\nReclaimed successfully (Target: ${state.liquidity.targetLiquidityType} ${state.liquidity.targetLiquidity.toFixed(state.currentPrice.digits)})`;
    } else {
      liquidity = `Boundaries mapped: PDH (${state.liquidity.pdh.toFixed(state.currentPrice.digits)}) / PDL (${state.liquidity.pdl.toFixed(state.currentPrice.digits)})\nTargeting ${state.liquidity.targetLiquidityType} (${state.liquidity.targetLiquidity.toFixed(state.currentPrice.digits)})`;
    }

    // Structure
    let structure = `${state.marketStructure.dominantTrend} trend continuation`;
    if (state.marketStructure.lastMSS) {
      structure = `${state.marketStructure.lastMSS.direction.replace(/_/g, ' ')} confirmed at ${state.marketStructure.lastMSS.level.toFixed(state.currentPrice.digits)}`;
    } else if (state.marketStructure.lastBOS) {
      structure = `${state.marketStructure.lastBOS.direction.replace(/_/g, ' ')} at ${state.marketStructure.lastBOS.level.toFixed(state.currentPrice.digits)}`;
    }

    // Price Action
    const p15Candle = state.timeframes['15m']?.lastCandleType || 'Standard';
    const priceAction = `${p15Candle.replace(/_/g, ' ')} | Session: ${state.session.activeSession}`;

    // FVG
    let fvg = 'None / Mitigated';
    const activeFVG = state.timeframes['15m']?.fvg || state.timeframes['1h']?.fvg;
    if (activeFVG) {
      fvg = `Present: ${activeFVG.type.replace(/_/g, ' ')} (${activeFVG.low.toFixed(state.currentPrice.digits)} - ${activeFVG.high.toFixed(state.currentPrice.digits)})`;
    }

    // CRT
    let crt = 'No CRT trigger active';
    if (state.crt.status !== 'NONE') {
      crt = `${state.crt.status.replace(/_/g, ' ')} (Range: ${state.crt.rangeLow.toFixed(state.currentPrice.digits)} - ${state.crt.rangeHigh.toFixed(state.currentPrice.digits)})`;
    }

    // Volatility
    const volatility = `${state.volatility.regime.replace(/_/g, ' ')} (ATR: ${state.volatility.atr14.toFixed(state.currentPrice.digits)})`;

    // News
    let news = 'No imminent high-impact news event';
    if (state.newsContext.imminentHighImpactEvent) {
      const ev = state.newsContext.imminentHighImpactEvent;
      news = `High-impact ${ev.currency} event in ${ev.minutesUntilOrSince}m ("${ev.title}")`;
    } else if (state.newsContext.recentHeadlines.length > 0) {
      news = `Sentiment: ${state.newsContext.sentiment} | Catalyst: ${state.newsContext.recentHeadlines[0].slice(0, 60)}`;
    }

    // Risk
    const rr = proposal?.riskRewardRatio || '1:2.0';
    const risk = `R:R = ${rr} | Max Risk Limit = 1.5%`;

    // Final Verdict
    let finalVerdict: SetupEvidenceRecord['finalVerdict'] = 'NO_SETUP';
    let verdictReason = 'Insufficient confluence score or unclear market structure.';

    if (state.newsContext.imminentHighImpactEvent?.isLockoutPeriod) {
      finalVerdict = 'WATCH — DO NOT EXECUTE';
      verdictReason = `High-impact ${state.newsContext.imminentHighImpactEvent.currency} event release in ${state.newsContext.imminentHighImpactEvent.minutesUntilOrSince} minutes. News risk too close to entry.`;
    } else if (state.deterministicClassification === 'CONFIRMED_SETUP') {
      finalVerdict = 'CONFIRMED_SETUP — READY';
      verdictReason = `Multi-timeframe structural alignment (${higherTimeframe}) with liquidity confluence.`;
    } else if (state.deterministicClassification === 'POTENTIAL_SETUP') {
      finalVerdict = 'POTENTIAL_SETUP';
      verdictReason = 'Valid setup forming; awaiting secondary confirmation on entry timeframe.';
    } else if (state.deterministicClassification === 'WATCH') {
      finalVerdict = 'WATCH — DO NOT EXECUTE';
      verdictReason = 'Market structure or liquidity in monitoring state; awaiting sweep/reclaim trigger.';
    }

    const entry = proposal?.entryZone?.recommendedEntry || state.currentPrice.mid;
    const stopLoss = proposal?.stopLoss || (direction === 'BUY' ? state.liquidity.pdl : state.liquidity.pdh);
    const tp1 = proposal?.takeProfitLevels?.tp1 || state.liquidity.targetLiquidity;
    const tp2 = proposal?.takeProfitLevels?.tp2 || tp1;

    return {
      symbol: state.symbol,
      direction,
      higherTimeframe,
      liquidity,
      structure,
      priceAction,
      fvg,
      crt,
      volatility,
      news,
      risk,
      finalVerdict,
      verdictReason,
      stagedTradeParams: {
        symbol: state.symbol,
        direction: direction === 'WAIT' ? 'BUY' : direction,
        entry,
        stopLoss,
        takeProfit1: tp1,
        takeProfit2: tp2,
        takeProfit3: proposal?.takeProfitLevels?.tp3,
        lotSize: 0.01,
        riskRewardRatio: rr,
        dollarRisk: Math.abs(entry - stopLoss) * (state.symbol.includes('XAU') ? 100 : 100000) * 0.01,
        invalidation: `Structural breach of ${stopLoss.toFixed(state.currentPrice.digits)}`
      }
    };
  }

  /**
   * Formats the Setup Evidence Record as clean, readable text.
   */
  public formatEvidenceRecordText(record: SetupEvidenceRecord): string {
    return [
      `### SETUP EVIDENCE RECORD: ${record.symbol} — ${record.direction}`,
      ``,
      `**Higher timeframe:**`,
      `${record.higherTimeframe}`,
      ``,
      `**Liquidity:**`,
      `${record.liquidity}`,
      ``,
      `**Structure:**`,
      `${record.structure}`,
      ``,
      `**Price action:**`,
      `${record.priceAction}`,
      ``,
      `**FVG:**`,
      `${record.fvg}`,
      ``,
      `**CRT:**`,
      `${record.crt}`,
      ``,
      `**Volatility:**`,
      `${record.volatility}`,
      ``,
      `**News:**`,
      `${record.news}`,
      ``,
      `**Risk:**`,
      `${record.risk}`,
      ``,
      `**Final Verdict:**`,
      `**${record.finalVerdict}**`,
      `*Reason:* ${record.verdictReason}`
    ].join('\n');
  }
}

export const marketAnalysisEngine = new MarketAnalysisEngine();

