/**
 * ALGOTRADE — DETERMINISTIC RISK ENGINE
 * 
 * Strict pre-trade validation gatekeeper. Every AI strategy proposal MUST pass through
 * this deterministic risk engine before MetaApi is permitted to execute.
 */

import { CompactMarketState, StrategyProposal } from './aiProvider';
import { SymbolSpecs } from './marketAnalysisEngine';

export interface RiskEvaluationRequest {
  proposal: StrategyProposal;
  marketState: CompactMarketState;
  specs: SymbolSpecs;
  account: {
    balance: number;
    equity: number;
    freeMargin: number;
    currency: string;
    openPositionsCount: number;
    maxTradesLimit: number;
    activePositions?: Array<{ symbol: string; type: string; volume: number }>;
  };
  customRiskSettings?: {
    maxRiskPercent?: number; // e.g. 1.5%
    userPreferredLot?: number;
    maxSpreadPips?: number;
    enforceNewsLockout?: boolean;
  };
}

export interface RiskEvaluationResult {
  approved: boolean;
  rejectionReason?: string;
  sanitizedTradeParams?: {
    symbol: string;
    direction: 'BUY' | 'SELL';
    entryPrice: number;
    lotSize: number;
    stopLoss: number;
    takeProfit: number;
    riskRewardRatio: number;
    riskAmountCurrency: number;
    riskPercentage: number;
    comment: string;
  };
  warnings: string[];
}

export class RiskEngine {
  private readonly DEFAULT_MAX_RISK_PERCENT = 1.5;
  private readonly MAX_ALLOWABLE_SPREAD_PIPS = 3.5;

  public evaluateTradeRisk(req: RiskEvaluationRequest): RiskEvaluationResult {
    const { proposal, marketState, specs, account, customRiskSettings } = req;
    const warnings: string[] = [];

    // 1. DIRECTION CHECK
    if (proposal.direction === 'WAIT' || proposal.setupStatus === 'NO_SETUP' || proposal.setupStatus === 'WATCH') {
      return {
        approved: false,
        rejectionReason: `Trade proposal is not executable (Status: ${proposal.setupStatus}, Direction: ${proposal.direction})`,
        warnings
      };
    }

    const direction: 'BUY' | 'SELL' = proposal.direction;

    // 2. OPEN TRADES CAPACITY CHECK
    const maxTrades = account.maxTradesLimit || 3;
    if (account.openPositionsCount >= maxTrades) {
      return {
        approved: false,
        rejectionReason: `Capacity exceeded: Account has ${account.openPositionsCount}/${maxTrades} maximum active trades.`,
        warnings
      };
    }

    // 3. DUPLICATE POSITION CHECK
    if (account.activePositions && account.activePositions.length > 0) {
      const isDuplicate = account.activePositions.some(
        pos => pos.symbol.toUpperCase() === specs.symbol.toUpperCase() && pos.type.toUpperCase() === direction
      );
      if (isDuplicate) {
        return {
          approved: false,
          rejectionReason: `Duplicate trade blocked: Existing ${direction} position active on ${specs.symbol}.`,
          warnings
        };
      }
    }

    // 4. FREE MARGIN & EQUITY CHECK
    const equity = Math.max(0, account.equity || account.balance || 0);
    if (equity <= 10) {
      return {
        approved: false,
        rejectionReason: `Insufficient equity: Account equity (${account.currency} ${equity.toFixed(2)}) is below minimum trading threshold.`,
        warnings
      };
    }

    // 5. SPREAD CHECK
    const maxSpread = customRiskSettings?.maxSpreadPips ?? this.MAX_ALLOWABLE_SPREAD_PIPS;
    if (marketState.currentPrice.spread > maxSpread) {
      return {
        approved: false,
        rejectionReason: `Excessive spread: Current spread (${marketState.currentPrice.spread} pips) exceeds maximum allowable limit (${maxSpread} pips).`,
        warnings
      };
    }

    // 6. HIGH IMPACT NEWS LOCKOUT CHECK
    const enforceNews = customRiskSettings?.enforceNewsLockout !== false;
    if (enforceNews && marketState.newsContext.imminentHighImpactEvent?.isLockoutPeriod) {
      return {
        approved: false,
        rejectionReason: `High-impact news lockout: High-impact release "${marketState.newsContext.imminentHighImpactEvent.title}" is imminent (${marketState.newsContext.imminentHighImpactEvent.minutesUntilOrSince}m).`,
        warnings
      };
    }

    // 7. ENTRY & STOP LOSS SANITY CHECK
    const digits = specs.digits ?? marketState.currentPrice.digits ?? 5;
    const entryPrice = proposal.entryZone.recommendedEntry || (direction === 'BUY' ? marketState.currentPrice.ask : marketState.currentPrice.bid);
    const stopLoss = proposal.stopLoss;
    const takeProfit = proposal.takeProfitLevels.tp1;

    if (!stopLoss || stopLoss <= 0) {
      return {
        approved: false,
        rejectionReason: 'Invalid Stop Loss: Stop Loss level must be strictly positive and defined.',
        warnings
      };
    }

    if (direction === 'BUY' && stopLoss >= entryPrice) {
      return {
        approved: false,
        rejectionReason: `Invalid Stop Loss for BUY: Stop Loss (${stopLoss}) must be below Entry (${entryPrice}).`,
        warnings
      };
    }

    if (direction === 'SELL' && stopLoss <= entryPrice) {
      return {
        approved: false,
        rejectionReason: `Invalid Stop Loss for SELL: Stop Loss (${stopLoss}) must be above Entry (${entryPrice}).`,
        warnings
      };
    }

    // 8. RISK-REWARD RATIO CHECK
    const riskDistance = Math.abs(entryPrice - stopLoss);
    const rewardDistance = Math.abs(takeProfit - entryPrice);
    const rrRatio = riskDistance > 0 ? rewardDistance / riskDistance : 0;

    if (rrRatio < 1.3) {
      warnings.push(`Low Risk:Reward ratio (${rrRatio.toFixed(2)}). Minimum recommended is 1:1.5.`);
    }

    // 9. SAFE LOT SIZE CALCULATION
    const minLot = specs.minLot ?? 0.01;
    const maxLot = specs.maxLot ?? 100.0;
    const lotStep = specs.lotStep ?? 0.01;

    let lotSize = minLot;

    // Small account protection: micro lots for small capital
    if (equity < 400 || (account.currency === 'ZAR' && equity < 7500)) {
      lotSize = minLot; // Strict 0.01 for micro accounts
    } else {
      const riskPercent = (customRiskSettings?.maxRiskPercent ?? this.DEFAULT_MAX_RISK_PERCENT) / 100;
      const targetRiskAmount = equity * riskPercent;

      // Calculate pip value estimation
      const isGold = specs.symbol.toUpperCase().includes('XAU');
      const pointValue = isGold ? 100 : 100000;
      const riskInPoints = riskDistance;
      const calculatedVolume = targetRiskAmount / Math.max(1, riskInPoints * pointValue);

      // Clamp and round to lot step
      const rawClamped = Math.max(minLot, Math.min(maxLot, calculatedVolume));
      const steps = Math.floor(rawClamped / lotStep);
      lotSize = Number((steps * lotStep).toFixed(2));
    }

    // Manual user preferred lot override if requested
    if (customRiskSettings?.userPreferredLot && customRiskSettings.userPreferredLot >= minLot) {
      lotSize = Math.min(maxLot, customRiskSettings.userPreferredLot);
    }

    const estimatedRiskCurrency = Number((riskDistance * (specs.symbol.includes('XAU') ? 100 : 100000) * lotSize).toFixed(2));
    const estimatedRiskPercent = Number(((estimatedRiskCurrency / equity) * 100).toFixed(2));

    const cleanComment = `AI:${proposal.strategyName.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 25)}`;

    return {
      approved: true,
      sanitizedTradeParams: {
        symbol: specs.symbol,
        direction,
        entryPrice: Number(entryPrice.toFixed(digits)),
        lotSize: Math.max(minLot, lotSize),
        stopLoss: Number(stopLoss.toFixed(digits)),
        takeProfit: Number(takeProfit.toFixed(digits)),
        riskRewardRatio: Number(rrRatio.toFixed(2)),
        riskAmountCurrency: estimatedRiskCurrency,
        riskPercentage: estimatedRiskPercent,
        comment: cleanComment
      },
      warnings
    };
  }
}

export const riskEngine = new RiskEngine();
