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
  };
  strategySettings: {
    symbol: string;
    lotSize: number;
    maxTrades: number;
    timeframe: string;
  };
  marketAnalysis: {
    bins: number[];
    zones: any[];
    detections: any[];
  } | null;

  setConnectionStatus: (status: "INIT" | "CONNECTING" | "SYNCING" | "READY" | "OFFLINE") => void;
  updateAccount: (payload: { balance?: number; equity?: number; currency?: string }) => void;
  setCandles: (candles: any[]) => void;
  addCandle: (candle: any) => void;
  setActiveStream: (stream: { symbol: string, timeframe: string } | null) => void;
  setIsStreaming: (isStreaming: boolean) => void;
  clearStreamIntent: () => void;
  setPositions: (positions: any[]) => void;
  setHistory: (history: any[]) => void;
  setStats: (stats: any | null) => void;
  setChartSettings: (settings: { upColor?: string; downColor?: string; bgImageUrl?: string }) => void;
  setStrategySettings: (settings: { symbol?: string; lotSize?: number; maxTrades?: number; timeframe?: string }) => void;
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
        bgImageUrl: '',
      };
    } catch {
      return { upColor: '#10b981', downColor: '#f43f5e', bgImageUrl: '' };
    }
  })(),
  strategySettings: (() => {
    try {
      const saved = localStorage.getItem('strategySettings');
      return saved ? JSON.parse(saved) : {
        symbol: 'XAUUSDm',
        lotSize: 0.1,
        maxTrades: 3,
        timeframe: '1m',
      };
    } catch {
      return { symbol: 'XAUUSDm', lotSize: 0.1, maxTrades: 3, timeframe: '1m' };
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

  setCandles: (candles) => set({ candles }),
  
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
    const newSettings = { ...state.strategySettings, ...settings };
    
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
