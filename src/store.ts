import { create } from 'zustand';

interface AccountStore {
  connectionStatus: "INIT" | "CONNECTING" | "SYNCING" | "READY" | "OFFLINE";
  account: { balance: number; equity: number; currency: string } | null;
  candles: any[];
  activeStream: { symbol: string, timeframe: string } | null;
  isStreaming: boolean;
  positions: any[];
  history: any[];
  stats: any | null;
  chartSettings: {
    upColor: string;
    downColor: string;
    bgImageUrl: string;
    accentColor: string;
  };
  strategySettings: {
    symbol: string;
    lotSize: number;
    maxTrades: number;
    timeframe: string;
    riskConfig: {
      fundedAmount: number;
      riskPercentage: number;
      stopLossPips: number;
      usePreferredLotSize: boolean;
      preferredLotSize: number;
      currency: string;
    };
  };
  marketAnalysis: {
    bins: number[];
    zones: any[];
    detections: any[];
  } | null;

  setConnectionStatus: (status: "INIT" | "CONNECTING" | "SYNCING" | "READY" | "OFFLINE") => void;
  updateAccount: (payload: { balance?: number; equity?: number; currency?: string }) => void;
  setCandles: (candles: any[] | ((prev: any[]) => any[])) => void;
  addCandle: (candle: any) => void;
  setActiveStream: (stream: { symbol: string, timeframe: string } | null) => void;
  setIsStreaming: (isStreaming: boolean) => void;
  clearStreamIntent: () => void;
  setPositions: (positions: any[]) => void;
  setHistory: (history: any[]) => void;
  setStats: (stats: any | null) => void;
  setChartSettings: (settings: { upColor?: string; downColor?: string; bgImageUrl?: string; accentColor?: string }) => void;
  setStrategySettings: (settings: { 
    symbol?: string; 
    lotSize?: number; 
    maxTrades?: number; 
    timeframe?: string;
    riskConfig?: Partial<{
      fundedAmount: number;
      riskPercentage: number;
      stopLossPips: number;
      usePreferredLotSize: boolean;
      preferredLotSize: number;
      currency: string;
    }>;
  }) => void;
  setMarketAnalysis: (analysis: any | null) => void;
}

export const useStore = create<AccountStore>((set) => ({
  connectionStatus: "INIT",
  account: null, // Start with null, DO NOT overwrite with 0 later unless provided
  candles: [],
  activeStream: null,
  isStreaming: false,
  positions: [],
  history: [],
  stats: null,
  marketAnalysis: null,
  chartSettings: (() => {
    try {
      const saved = localStorage.getItem('chartSettings');
      return saved ? JSON.parse(saved) : {
        upColor: '#10b981',
        downColor: '#f43f5e',
        bgImageUrl: '/bot-logo.png?v=2',
        accentColor: '#6366f1',
      };
    } catch {
      return { 
        upColor: '#10b981', 
        downColor: '#f43f5e', 
        bgImageUrl: '/icon-512.png',
        accentColor: '#6366f1' 
      };
    }
  })(),
  strategySettings: (() => {
    const defaults = {
      symbol: 'XAUUSDm',
      lotSize: 0.1,
      maxTrades: 3,
      timeframe: '1m',
      riskConfig: {
        fundedAmount: 1000,
        riskPercentage: 1,
        stopLossPips: 50,
        usePreferredLotSize: false,
        preferredLotSize: 0.1,
        currency: 'USD',
      }
    };
    try {
      const saved = localStorage.getItem('strategySettings');
      if (!saved) return defaults;
      const parsed = JSON.parse(saved);
      return {
        ...defaults,
        ...parsed,
        riskConfig: {
          ...defaults.riskConfig,
          ...(parsed.riskConfig || {})
        }
      };
    } catch {
      return defaults;
    }
  })(),

  setConnectionStatus: (status) => set({ connectionStatus: status }),
  
  updateAccount: (payload) => set((state) => {
    const currentAccount = state.account;
    
    // Check if new data provides meaningful values (including 0 if explicitly provided, but avoid null/undefined)
    const hasNewBalance = payload.balance !== undefined && payload.balance !== null;
    const hasNewEquity = payload.equity !== undefined && payload.equity !== null;
    
    console.log(`[STORE] Updating Account:`, { payload, currentAccount, hasNewBalance, hasNewEquity });

    // New state construction
    const newAccount = {
      balance: hasNewBalance ? payload.balance! : (currentAccount?.balance ?? null),
      equity: hasNewEquity ? payload.equity! : (currentAccount?.equity ?? null),
      currency: payload.currency || currentAccount?.currency || "USD",
    };

    // If both new balance/equity are null/missing and we already have a full balance, just keep old
    if (currentAccount && !hasNewBalance && !hasNewEquity && currentAccount.balance !== null) {
      console.warn("[STORE] Preserving existing balance as new payload is incomplete");
      return state;
    }

    return { account: newAccount };
  }),

  setCandles: (action) => set((state) => ({ 
    candles: typeof action === 'function' ? action(state.candles) : action 
  })),
  
  addCandle: (candle) => set((state) => {
    // Only update LAST candle or push if new
    const newCandles = [...state.candles];
    if (newCandles.length > 0 && newCandles[newCandles.length - 1].time === candle.time) {
      newCandles[newCandles.length - 1] = candle;
    } else {
      newCandles.push(candle);
    }
    return { candles: newCandles };
  }),

  setActiveStream: (stream) => set({ activeStream: stream }),
  setIsStreaming: (isStreaming) => set({ isStreaming }),

  clearStreamIntent: () => set({ isStreaming: false, activeStream: null }),
  setPositions: (positions) => set({ positions }),
  setHistory: (history) => set({ history }),
  setStats: (stats) => set({ stats }),
  setChartSettings: (settings) => set((state) => {
    const newSettings = { ...state.chartSettings, ...settings };
    try {
      localStorage.setItem('chartSettings', JSON.stringify(newSettings));
    } catch(e) {
      console.warn("Could not save chart settings to localStorage", e);
    }
    return { chartSettings: newSettings };
  }),
  setStrategySettings: (settings) => set((state) => {
    const newSettings = { 
      ...state.strategySettings, 
      ...settings,
      riskConfig: settings.riskConfig 
        ? { ...state.strategySettings.riskConfig, ...settings.riskConfig }
        : state.strategySettings.riskConfig
    };
    
    // Auto-calculate everything when Risk Config changes
    if (newSettings.riskConfig && !newSettings.riskConfig.usePreferredLotSize) {
      const { fundedAmount, riskPercentage, stopLossPips, currency } = newSettings.riskConfig;
      
      // Default to 1% if it's 0 or unset (to ensure meaningful auto-calc)
      const activeRiskPercent = riskPercentage || 1;
      if (!riskPercentage) newSettings.riskConfig.riskPercentage = 1;

      // Exchange rate adjustment (rough estimation for ZAR)
      const exchangeRate = currency === 'ZAR' ? 18.5 : 1.0;
      
      // 1. Calculate Risk Amount
      const riskAmount = (fundedAmount * activeRiskPercent) / 100;
      
      // 2. Calculate Lot Size: (Risk Amount in USD) / (SL Pips * $10 per pip for standard lot)
      // We convert riskAmount to USD first for the lot formula
      const riskAmountUSD = riskAmount / exchangeRate;
      const calculatedLot = riskAmountUSD / (stopLossPips * 10); 
      newSettings.lotSize = Math.max(0.01, Math.round(calculatedLot * 100) / 100);
      
      // 3. Calculate Max Trades (Standard scaling: 1 trade per $200 USD balance)
      const fundedAmountUSD = fundedAmount / exchangeRate;
      newSettings.maxTrades = Math.max(1, Math.floor(fundedAmountUSD / 200)); 
    } else if (newSettings.riskConfig?.usePreferredLotSize) {
      newSettings.lotSize = newSettings.riskConfig.preferredLotSize;
      
      // Even with manual lots, we can suggest max trades based on common margin requirements
      const exchangeRate = newSettings.riskConfig.currency === 'ZAR' ? 18.5 : 1.0;
      const fundedAmountUSD = newSettings.riskConfig.fundedAmount / exchangeRate;
      newSettings.maxTrades = Math.max(1, Math.floor(fundedAmountUSD / 200));
    }

    // Validation
    if (newSettings.lotSize !== undefined) newSettings.lotSize = Math.max(0.01, newSettings.lotSize);
    if (newSettings.maxTrades !== undefined) newSettings.maxTrades = Math.max(1, newSettings.maxTrades);

    try {
      localStorage.setItem('strategySettings', JSON.stringify(newSettings));
    } catch(e) {
      console.warn("Could not save strategy settings to localStorage", e);
    }
    return { strategySettings: newSettings };
  }),
  setMarketAnalysis: (analysis) => set({ marketAnalysis: analysis }),
}));
