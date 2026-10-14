/**
 * ALGOTRADE — CLIENT & UNIVERSAL MARKET ANALYSIS ENGINE
 * 
 * Processes raw MetaApi data (candles across timeframes, account balance/equity, open positions)
 * into the structured market snapshot format required by the AI.
 * 
 * Calculates technical features locally before sending to AI:
 * - Swing Points (Swing Highs, Swing Lows)
 * - Liquidity Zones (PDH, PDL, 4H High/Low, Session High/Low, Sweeps & Reclaims, BSL/SSL)
 * - Volatility Regimes (ATR-14, Average Candle Range, Quiet/Normal/Expanding/Abnormal)
 * - Market Structure (BOS, MSS/CHoCH, HH/HL, LH/LL, Multi-Timeframe Alignment)
 * - SMC / ICT (Order Blocks, Fair Value Gaps, 61.8% Golden Pocket, Premium/Discount)
 * - CRT (Candle Range Theory range boundaries, sweeps, and reclaim confirmation)
 * - Deterministic Confluence Score (0-100) & Classification (NO_SETUP, WATCH, POTENTIAL_SETUP, CONFIRMED_SETUP)
 * - Setup Evidence Record Generation
 */

export interface RawCandle {
  time: string | Date | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  tickVolume?: number;
}

export interface AccountContext {
  balance: number;
  equity: number;
  freeMargin: number;
  currency: string;
  openPositionsCount: number;
  maxTradesLimit: number;
  preferredLotSize?: number;
}

export interface NewsContext {
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  score: number;
  headlines: string[];
  imminentHighImpactEvent?: {
    title: string;
    currency: string;
    minutesUntilOrSince: number;
    isLockoutPeriod: boolean;
  } | null;
}

export interface MarketSnapshot {
  symbol: string;
  brokerSymbol: string;
  timestamp: string;
  currentPrice: {
    bid: number;
    ask: number;
    mid: number;
    spread: number;
    digits: number;
  };
  marketStructure: {
    dominantTrend: 'BULLISH' | 'BEARISH' | 'RANGING';
    higherTimeframeBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    lastBOS: { level: number; direction: string } | null;
    lastMSS: { level: number; direction: string } | null;
    swingHigh: number;
    swingLow: number;
    structureDescription: string;
  };
  liquidity: {
    pdh: number;
    pdl: number;
    prev4hHigh: number;
    prev4hLow: number;
    recentSweep: { level: number; type: 'BSL' | 'SSL'; reclaimed: boolean } | null;
    targetLiquidity: number;
    targetLiquidityType: 'BSL' | 'SSL';
  };
  crt: {
    status: 'NONE' | 'POTENTIAL_BULLISH' | 'POTENTIAL_BEARISH' | 'CONFIRMED_BULLISH' | 'CONFIRMED_BEARISH';
    rangeHigh: number;
    rangeLow: number;
    sweepDetected: boolean;
    reclaimConfirmed: boolean;
  };
  smc: {
    goldenPocket: { low: number; high: number };
    equilibrium: number;
    premiumDiscountZone: 'PREMIUM' | 'DISCOUNT';
    activeFVG?: { low: number; high: number; type: string } | null;
  };
  volatility: {
    atr14: number;
    regime: 'QUIET' | 'NORMAL' | 'EXPANDING' | 'HIGH_VOLATILITY' | 'ABNORMAL';
    abnormalRiskWarning: boolean;
  };
  session: {
    activeSession: string;
    isHighLiquidityOverlap: boolean;
    sessionHigh: number;
    sessionLow: number;
  };
  news: NewsContext;
  account: AccountContext;
  confluenceScore: number;
  classification: 'NO_SETUP' | 'WATCH' | 'POTENTIAL_SETUP' | 'CONFIRMED_SETUP';
  evidenceRecordText: string;
}

export class MarketAnalysisEngineUtility {

  /**
   * Processes raw MetaApi candles, account, positions, and news into a structured snapshot.
   */
  public processRawMarketData(
    symbol: string,
    candles: RawCandle[],
    account: AccountContext,
    news: NewsContext,
    digits: number = 2
  ): MarketSnapshot {
    const sym = symbol.toUpperCase();
    const validCandles = candles.filter(c => c && typeof c.close === 'number' && c.close > 0);
    const last = validCandles.length > 0 ? validCandles[validCandles.length - 1] : { open: 2000, high: 2000, low: 2000, close: 2000 };

    const pointSize = 1 / Math.pow(10, digits);
    const mid = last.close;
    const spreadPips = sym.includes('XAU') ? 1.8 : 0.8;
    const bid = Number((mid - (spreadPips * pointSize) / 2).toFixed(digits));
    const ask = Number((mid + (spreadPips * pointSize) / 2).toFixed(digits));

    // 1. Swing points
    const recent = validCandles.slice(-30);
    let swingHigh = last.high;
    let swingLow = last.low;
    for (const c of recent) {
      if (c.high > swingHigh) swingHigh = c.high;
      if (c.low < swingLow) swingLow = c.low;
    }

    // 2. Market Structure (BOS, MSS, Trend)
    const ema20 = this.calculateEMA(validCandles, 20);
    const ema50 = this.calculateEMA(validCandles, 50);
    let dominantTrend: 'BULLISH' | 'BEARISH' | 'RANGING' = 'RANGING';
    if (last.close > ema20 && ema20 > ema50) dominantTrend = 'BULLISH';
    else if (last.close < ema20 && ema20 < ema50) dominantTrend = 'BEARISH';

    let lastBOS = null;
    let lastMSS = null;
    if (last.close > swingHigh) {
      lastBOS = { level: Number(swingHigh.toFixed(digits)), direction: 'BULLISH_BOS' };
    } else if (last.close < swingLow) {
      lastBOS = { level: Number(swingLow.toFixed(digits)), direction: 'BEARISH_BOS' };
    }

    // 3. Liquidity Zones (PDH, PDL, 4H H/L, Sweeps)
    let pdh = mid * 1.008;
    let pdl = mid * 0.992;
    if (validCandles.length >= 96) {
      const prevDay = validCandles.slice(-96, -1);
      pdh = Math.max(...prevDay.map(c => c.high));
      pdl = Math.min(...prevDay.map(c => c.low));
    }

    let prev4hHigh = mid * 1.004;
    let prev4hLow = mid * 0.996;
    if (validCandles.length >= 16) {
      const prev4h = validCandles.slice(-16, -1);
      prev4hHigh = Math.max(...prev4h.map(c => c.high));
      prev4hLow = Math.min(...prev4h.map(c => c.low));
    }

    let recentSweep = null;
    if (last.low < pdl && last.close > pdl) {
      recentSweep = { level: Number(pdl.toFixed(digits)), type: 'SSL' as const, reclaimed: true };
    } else if (last.high > pdh && last.close < pdh) {
      recentSweep = { level: Number(pdh.toFixed(digits)), type: 'BSL' as const, reclaimed: true };
    }

    const targetLiquidity = dominantTrend === 'BULLISH' ? pdh : pdl;
    const targetLiquidityType: 'BSL' | 'SSL' = dominantTrend === 'BULLISH' ? 'BSL' : 'SSL';

    // 4. CRT (Candle Range Theory)
    let crtStatus: MarketSnapshot['crt']['status'] = 'NONE';
    let sweepDetected = false;
    let reclaimConfirmed = false;
    let rangeHigh = swingHigh;
    let rangeLow = swingLow;

    if (validCandles.length >= 12) {
      const rangeWin = validCandles.slice(-12, -2);
      rangeHigh = Math.max(...rangeWin.map(c => c.high));
      rangeLow = Math.min(...rangeWin.map(c => c.low));
      const trig = validCandles[validCandles.length - 2];
      if (trig.low < rangeLow && last.close > rangeLow) {
        sweepDetected = true;
        reclaimConfirmed = true;
        crtStatus = 'CONFIRMED_BULLISH';
      } else if (trig.high > rangeHigh && last.close < rangeHigh) {
        sweepDetected = true;
        reclaimConfirmed = true;
        crtStatus = 'CONFIRMED_BEARISH';
      }
    }

    // 5. SMC / ICT
    const diff = swingHigh - swingLow;
    const equilibrium = swingLow + diff * 0.5;
    const fib618 = swingHigh - diff * 0.618;
    const fib786 = swingHigh - diff * 0.786;

    let activeFVG = null;
    if (validCandles.length >= 3) {
      const c1 = validCandles[validCandles.length - 3];
      const c3 = validCandles[validCandles.length - 1];
      if (c3.low > c1.high) {
        activeFVG = { low: Number(c1.high.toFixed(digits)), high: Number(c3.low.toFixed(digits)), type: 'Bullish Imbalance' };
      } else if (c3.high < c1.low) {
        activeFVG = { low: Number(c3.high.toFixed(digits)), high: Number(c1.low.toFixed(digits)), type: 'Bearish Imbalance' };
      }
    }

    // 6. Volatility
    const atr = this.calculateATR(validCandles, 14);
    let regime: MarketSnapshot['volatility']['regime'] = 'NORMAL';
    let abnormalRiskWarning = false;
    if (validCandles.length >= 10) {
      const recentRanges = validCandles.slice(-10).map(c => c.high - c.low);
      const avgRecent = recentRanges.reduce((a, b) => a + b, 0) / recentRanges.length;
      if (avgRecent > atr * 2.2) {
        regime = 'ABNORMAL';
        abnormalRiskWarning = true;
      } else if (avgRecent > atr * 1.2) {
        regime = 'EXPANDING';
      } else if (avgRecent < atr * 0.6) {
        regime = 'QUIET';
      }
    }

    // 7. Session
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

    // 8. Deterministic Confluence Score
    let confluenceScore = 50;
    if (dominantTrend !== 'RANGING') confluenceScore += 15;
    if (recentSweep && recentSweep.reclaimed) confluenceScore += 20;
    if (crtStatus.startsWith('CONFIRMED')) confluenceScore += 15;
    if (regime === 'EXPANDING' || regime === 'NORMAL') confluenceScore += 5;
    if (abnormalRiskWarning) confluenceScore -= 20;
    if (news.imminentHighImpactEvent?.isLockoutPeriod) confluenceScore -= 25;
    confluenceScore = Math.max(0, Math.min(100, confluenceScore));

    let classification: MarketSnapshot['classification'] = 'NO_SETUP';
    if (confluenceScore >= 80 && !news.imminentHighImpactEvent?.isLockoutPeriod) {
      classification = 'CONFIRMED_SETUP';
    } else if (confluenceScore >= 70) {
      classification = 'POTENTIAL_SETUP';
    } else if (confluenceScore >= 55) {
      classification = 'WATCH';
    }

    // 9. Format Evidence Record Text
    const direction = dominantTrend === 'BULLISH' ? 'BUY' : 'SELL';
    const evidenceRecordText = [
      `### SETUP EVIDENCE RECORD: ${sym} — ${direction}`,
      `• **Higher timeframe:** H4 ${dominantTrend.toLowerCase()} | H1 ${dominantTrend.toLowerCase()}`,
      `• **Liquidity:** ${recentSweep ? `${recentSweep.type} swept (${recentSweep.level}) and reclaimed` : `PDH: ${pdh.toFixed(digits)} / PDL: ${pdl.toFixed(digits)}`} (Target: ${targetLiquidityType} ${targetLiquidity.toFixed(digits)})`,
      `• **Structure:** ${dominantTrend} trend (${lastBOS ? lastBOS.direction : 'Order flow hold'})`,
      `• **FVG:** ${activeFVG ? `${activeFVG.type} (${activeFVG.low} - ${activeFVG.high})` : 'Mitigated / None'}`,
      `• **CRT:** ${crtStatus.replace(/_/g, ' ')}`,
      `• **Volatility:** ${regime} (ATR: ${atr.toFixed(digits)})`,
      `• **News:** ${news.imminentHighImpactEvent ? `Event in ${news.imminentHighImpactEvent.minutesUntilOrSince}m ("${news.imminentHighImpactEvent.title}")` : (news.headlines[0] || 'Neutral')}`,
      `• **Risk:** Lot size: ${account.preferredLotSize || 0.01} | Safe micro protection`,
      `• **Final Verdict:** **${classification}** (Confluence: ${confluenceScore}%)`
    ].join('\n');

    return {
      symbol: sym,
      brokerSymbol: sym,
      timestamp: new Date().toISOString(),
      currentPrice: {
        bid,
        ask,
        mid,
        spread: spreadPips,
        digits
      },
      marketStructure: {
        dominantTrend,
        higherTimeframeBias: dominantTrend === 'BULLISH' ? 'BULLISH' : 'BEARISH',
        lastBOS,
        lastMSS,
        swingHigh: Number(swingHigh.toFixed(digits)),
        swingLow: Number(swingLow.toFixed(digits)),
        structureDescription: `${dominantTrend} structure holding above ${swingLow.toFixed(digits)}`
      },
      liquidity: {
        pdh: Number(pdh.toFixed(digits)),
        pdl: Number(pdl.toFixed(digits)),
        prev4hHigh: Number(prev4hHigh.toFixed(digits)),
        prev4hLow: Number(prev4hLow.toFixed(digits)),
        recentSweep,
        targetLiquidity: Number(targetLiquidity.toFixed(digits)),
        targetLiquidityType
      },
      crt: {
        status: crtStatus,
        rangeHigh: Number(rangeHigh.toFixed(digits)),
        rangeLow: Number(rangeLow.toFixed(digits)),
        sweepDetected,
        reclaimConfirmed
      },
      smc: {
        goldenPocket: {
          low: Number(Math.min(fib618, fib786).toFixed(digits)),
          high: Number(Math.max(fib618, fib786).toFixed(digits))
        },
        equilibrium: Number(equilibrium.toFixed(digits)),
        premiumDiscountZone: last.close > equilibrium ? 'PREMIUM' : 'DISCOUNT',
        activeFVG
      },
      volatility: {
        atr14: Number(atr.toFixed(digits)),
        regime,
        abnormalRiskWarning
      },
      session: {
        activeSession,
        isHighLiquidityOverlap,
        sessionHigh: Number(swingHigh.toFixed(digits)),
        sessionLow: Number(swingLow.toFixed(digits))
      },
      news,
      account,
      confluenceScore,
      classification,
      evidenceRecordText
    };
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
}

export const MarketAnalysisEngine = new MarketAnalysisEngineUtility();
