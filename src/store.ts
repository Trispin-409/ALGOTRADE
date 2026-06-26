import { create } from 'zustand';

interface AccountStore {
  connectionStatus: "INIT" | "CONNECTING" | "SYNCING" | "READY" | "OFFLINE";
  account: { balance: number; equity: number; margin?: number; freeMargin?: number; marginLevel?: number; currency: string } | null;
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
    theme?: 'dark' | 'light';
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
  currentUserEmail: string | null;
  activeSetup: any | null;
  isAutoTrade: boolean;
  autoTradeConfirmationOpen: boolean;
  // Agent Monitoring State
  agentStatus: { [key: string]: { status: string, latestInsight: string, confidence: number } };
  agentLogs: { [key: string]: string[] };
  activityFeed: string[];
  
  // Strategy & Market State
  strategies: { name: string, confidence: number, status: 'MATCHED' | 'REJECTED' | 'WAITING', reason?: string }[];
  marketSession: string;
  timeframeAnalysis: { [tf: string]: { trend: string, structure?: string, momentum?: string, bias: string } };
  newsImpact: { title: string, impact: 'HIGH' | 'MEDIUM' | 'LOW', bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL', score: number, articleCount?: number, sentimentScore?: number };
  riskMetrics: any;
  tradeSignal: any | null;
  activeStepIndex: number;
  pipelineLogs: string[];
  debateDialogue: string[];

  setConnectionStatus: (status: "INIT" | "CONNECTING" | "SYNCING" | "READY" | "OFFLINE") => void;
  updateAccount: (payload: { balance?: number; equity?: number; margin?: number; freeMargin?: number; marginLevel?: number; currency?: string }) => void;
  setCandles: (candles: any[] | ((prev: any[]) => any[])) => void;
  addCandle: (candle: any) => void;
  setActiveStream: (stream: { symbol: string, timeframe: string } | null) => void;
  setIsStreaming: (isStreaming: boolean) => void;
  clearStreamIntent: () => void;
  setPositions: (positions: any[]) => void;
  setHistory: (history: any[]) => void;
  setStats: (stats: any | null) => void;
  setCurrentUserEmail: (email: string | null) => void;
  setChartSettings: (settings: { upColor?: string; downColor?: string; bgImageUrl?: string; accentColor?: string, theme?: 'dark' | 'light' }) => void;
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
  setActiveSetup: (setup: any | null) => void;
  
  // Global Actions
  setIsAutoTrade: (isAutoTrade: boolean) => void;
  setAutoTradeConfirmationOpen: (open: boolean) => void;
  setAgentStatus: (id: string, status: Partial<{ status: string, latestInsight: string, confidence: number }>) => void;
  addAgentLog: (id: string, log: string) => void;
  addActivity: (activity: string) => void;
  setMarketSession: (session: string) => void;
  setTimeframeAnalysis: (tf: string, analysis: { trend: string, structure?: string, momentum?: string, bias: string }) => void;
  setNewsImpact: (impact: any) => void;
  setRiskMetrics: (metrics: any) => void;
  setTradeSignal: (signal: any) => void;
  setStrategies: (strategies: any[]) => void;
  setActiveStepIndex: (index: number) => void;
  addPipelineLog: (log: string) => void;
  setDebateDialogue: (dialogue: string[]) => void;
}

export const useStore = create<AccountStore>((set) => ({
  connectionStatus: "INIT",
  account: null,
  candles: [],
  activeStream: null,
  isStreaming: false,
  positions: [],
  history: [],
  stats: null,
  marketAnalysis: null,
  currentUserEmail: null,
  activeSetup: null,
  isAutoTrade: false,
  autoTradeConfirmationOpen: false,
  agentStatus: {},
  agentLogs: {},
  activityFeed: [],
  strategies: [],
  marketSession: 'New York',
  timeframeAnalysis: {},
  newsImpact: { title: 'No major news', impact: 'LOW', bias: 'NEUTRAL', score: 0 },
  riskMetrics: { balance: 1000, risk: 0, drawdown: 0, health: 'Stable' },
  tradeSignal: null,
  activeStepIndex: 0,
  pipelineLogs: [],
  debateDialogue: [],
  chartSettings: (() => {
    try {
      const saved = localStorage.getItem('chartSettings');
      return saved ? { theme: 'dark', ...JSON.parse(saved) } : {
        upColor: '#10b981',
        downColor: '#f43f5e',
        bgImageUrl: '/bot-logo.png?v=5',
        accentColor: '#face6f',
        theme: 'dark',
      };
    } catch {
      return { 
        upColor: '#10b981', 
        downColor: '#f43f5e', 
        bgImageUrl: '/icon-512.png?v=5',
        accentColor: '#face6f',
        theme: 'dark'
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
    const hasNewBalance = payload.balance !== undefined && payload.balance !== null;
    const hasNewEquity = payload.equity !== undefined && payload.equity !== null;
    const hasNewMargin = payload.margin !== undefined && payload.margin !== null;
    const hasNewFreeMargin = payload.freeMargin !== undefined && payload.freeMargin !== null;
    const hasNewMarginLevel = payload.marginLevel !== undefined && payload.marginLevel !== null;
    
    const newAccount = {
      balance: hasNewBalance ? payload.balance! : (currentAccount?.balance ?? null),
      equity: hasNewEquity ? payload.equity! : (currentAccount?.equity ?? null),
      margin: hasNewMargin ? payload.margin! : (currentAccount?.margin ?? null),
      freeMargin: hasNewFreeMargin ? payload.freeMargin! : (currentAccount?.freeMargin ?? null),
      marginLevel: hasNewMarginLevel ? payload.marginLevel! : (currentAccount?.marginLevel ?? null),
      currency: payload.currency || currentAccount?.currency || "USD",
    };
    
    // Check if anything actually changed
    const balanceChanged = hasNewBalance && payload.balance !== currentAccount?.balance;
    const equityChanged = hasNewEquity && payload.equity !== currentAccount?.equity;
    const marginChanged = hasNewMargin && payload.margin !== currentAccount?.margin;
    const freeMarginChanged = hasNewFreeMargin && payload.freeMargin !== currentAccount?.freeMargin;
    const marginLevelChanged = hasNewMarginLevel && payload.marginLevel !== currentAccount?.marginLevel;
    const currencyChanged = payload.currency !== undefined && payload.currency !== currentAccount?.currency;

    if (currentAccount && !balanceChanged && !equityChanged && !marginChanged && !freeMarginChanged && !marginLevelChanged && !currencyChanged) {
      return state;
    }
    return { account: newAccount };
  }),

  setCandles: (action) => set((state) => ({ 
    candles: typeof action === 'function' ? action(state.candles) : action 
  })),
  
  addCandle: (candle) => set((state) => {
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

  setCurrentUserEmail: (email) => set((state) => {
    if (!email) {
      return { currentUserEmail: null };
    }
    let chartSettings = state.chartSettings;
    try {
      const saved = localStorage.getItem(`chartSettings:${email}`);
      if (saved) {
        chartSettings = JSON.parse(saved);
      } else {
        const legacy = localStorage.getItem('chartSettings');
        if (legacy) {
          chartSettings = JSON.parse(legacy);
          localStorage.setItem(`chartSettings:${email}`, legacy);
        }
      }
    } catch (e) {
      console.warn("Error reading chart settings for email", e);
    }
    let strategySettings = state.strategySettings;
    try {
      const saved = localStorage.getItem(`strategySettings:${email}`);
      if (saved) {
        strategySettings = JSON.parse(saved);
      } else {
        const legacy = localStorage.getItem('strategySettings');
        if (legacy) {
          strategySettings = JSON.parse(legacy);
          localStorage.setItem(`strategySettings:${email}`, legacy);
        }
      }
    } catch (e) {
      console.warn("Error reading strategy settings for email", e);
    }
    return { 
      currentUserEmail: email,
      chartSettings,
      strategySettings
    };
  }),

  setChartSettings: (settings) => set((state) => {
    const newSettings = { ...state.chartSettings, ...settings };
    try {
      localStorage.setItem('chartSettings', JSON.stringify(newSettings));
      if (state.currentUserEmail) {
        localStorage.setItem(`chartSettings:${state.currentUserEmail}`, JSON.stringify(newSettings));
      }
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
    if (newSettings.riskConfig && !newSettings.riskConfig.usePreferredLotSize) {
      const { fundedAmount, riskPercentage, stopLossPips, currency } = newSettings.riskConfig;
      const activeRiskPercent = riskPercentage || 1;
      if (!riskPercentage) newSettings.riskConfig.riskPercentage = 1;
      const exchangeRate = currency === 'ZAR' ? 18.5 : 1.0;
      const riskAmount = (fundedAmount * activeRiskPercent) / 100;
      const riskAmountUSD = riskAmount / exchangeRate;
      const calculatedLot = riskAmountUSD / (stopLossPips * 10); 
      newSettings.lotSize = Math.max(0.01, Math.round(calculatedLot * 100) / 100);
      const fundedAmountUSD = fundedAmount / exchangeRate;
      newSettings.maxTrades = Math.max(1, Math.floor(fundedAmountUSD / 200)); 
    } else if (newSettings.riskConfig?.usePreferredLotSize) {
      newSettings.lotSize = newSettings.riskConfig.preferredLotSize;
      const exchangeRate = newSettings.riskConfig.currency === 'ZAR' ? 18.5 : 1.0;
      const fundedAmountUSD = newSettings.riskConfig.fundedAmount / exchangeRate;
      newSettings.maxTrades = Math.max(1, Math.floor(fundedAmountUSD / 200));
    }
    if (newSettings.lotSize !== undefined) newSettings.lotSize = Math.max(0.01, newSettings.lotSize);
    if (newSettings.maxTrades !== undefined) newSettings.maxTrades = Math.max(1, newSettings.maxTrades);
    try {
      localStorage.setItem('strategySettings', JSON.stringify(newSettings));
      if (state.currentUserEmail) {
        localStorage.setItem(`strategySettings:${state.currentUserEmail}`, JSON.stringify(newSettings));
      }
    } catch(e) {
      console.warn("Could not save strategy settings to localStorage", e);
    }
    return { strategySettings: newSettings };
  }),
  setMarketAnalysis: (analysis) => set({ marketAnalysis: analysis }),
  setActiveSetup: (setup) => set({ activeSetup: setup }),
  setIsAutoTrade: (isAutoTrade) => set({ isAutoTrade }),
  setAutoTradeConfirmationOpen: (open) => set({ autoTradeConfirmationOpen: open }),
  setAgentStatus: (id, status) => set((state) => ({
      agentStatus: { ...state.agentStatus, [id]: { ...state.agentStatus[id], ...status } }
  })),
  addAgentLog: (id, log) => set((state) => ({
      agentLogs: { ...state.agentLogs, [id]: [log, ...(state.agentLogs[id] || [])].slice(0, 10) }
  })),
  addActivity: (activity) => set((state) => ({
      activityFeed: [activity, ...state.activityFeed].slice(0, 50)
  })),
  setMarketSession: (session) => set({ marketSession: session }),
  setTimeframeAnalysis: (tf, analysis) => set((state) => ({ timeframeAnalysis: { ...state.timeframeAnalysis, [tf]: analysis } })),
  setNewsImpact: (impact) => set({ newsImpact: impact }),
  setRiskMetrics: (metrics) => set({ riskMetrics: metrics }),
  setTradeSignal: (signal) => set({ tradeSignal: signal }),
  setStrategies: (strategies) => set({ strategies }),
  setActiveStepIndex: (index) => set({ activeStepIndex: index }),
  addPipelineLog: (log) => set((state) => ({ pipelineLogs: [log, ...state.pipelineLogs].slice(0, 100) })),
  setDebateDialogue: (dialogue) => set({ debateDialogue: dialogue }),
}));

export interface SessionDetails {
  utcTime: string;
  sydneyActive: boolean;
  tokyoActive: boolean;
  londonActive: boolean;
  newYorkActive: boolean;
  currentSession: string;
  killZone: string;
  amdPhase: "Accumulation" | "Manipulation" | "Distribution" | "Reversal";
  economicReleaseWindow: boolean;
}

export function calculateTradingSession(now: Date = new Date()): SessionDetails {
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  const decimalHour = utcHours + utcMinutes / 60;

  const month = now.getUTCMonth();
  const date = now.getUTCDate();
  const day = now.getUTCDay();

  let isDst = false;
  if (month > 2 && month < 10) {
    isDst = true;
  } else if (month === 2) {
    const prevSunday = date - day;
    isDst = prevSunday >= 8;
  } else if (month === 10) {
    const prevSunday = date - day;
    isDst = prevSunday < 1;
  }

  const londonStart = isDst ? 7 : 8;
  const londonEnd = isDst ? 16 : 17;
  const nyStart = isDst ? 12 : 13;
  const nyEnd = isDst ? 21 : 22;
  const tokyoStart = 0;
  const tokyoEnd = 9;
  const sydneyStart = 22;
  const sydneyEnd = 7;

  const sydneyActive = decimalHour >= sydneyStart || decimalHour < sydneyEnd;
  const tokyoActive = decimalHour >= tokyoStart && decimalHour < tokyoEnd;
  const londonActive = decimalHour >= londonStart && decimalHour < londonEnd;
  const newYorkActive = decimalHour >= nyStart && decimalHour < nyEnd;

  let currentSession = "Asian Consolidation";
  if (londonActive && newYorkActive) {
    currentSession = "London/NY Overlap";
  } else if (londonActive) {
    currentSession = "London Session";
  } else if (newYorkActive) {
    currentSession = "New York Session";
  } else if (tokyoActive) {
    currentSession = "Tokyo Session";
  } else if (sydneyActive) {
    currentSession = "Sydney Session";
  }

  let killZone = "None";
  if (decimalHour >= 0 && decimalHour < 4) {
    killZone = "Asian Kill Zone";
  } else if (decimalHour >= (londonStart - 1) && decimalHour < (londonStart + 2)) {
    killZone = "London Open Kill Zone";
  } else if (decimalHour >= (nyStart - 1) && decimalHour < (nyStart + 2)) {
    killZone = "New York Open Kill Zone";
  } else if (decimalHour >= (londonEnd - 1) && decimalHour < (londonEnd + 1)) {
    killZone = "London Close Kill Zone";
  }

  let amdPhase: "Accumulation" | "Manipulation" | "Distribution" | "Reversal" = "Accumulation";
  if (decimalHour >= 0 && decimalHour < 8) {
    amdPhase = "Accumulation";
  } else if (decimalHour >= 8 && decimalHour < 12) {
    amdPhase = "Manipulation";
  } else if (decimalHour >= 12 && decimalHour < 21) {
    amdPhase = "Distribution";
  } else {
    amdPhase = "Reversal";
  }

  const economicReleaseWindow = decimalHour >= 12 && decimalHour < 14.5;
  const utcTimeString = now.toISOString().replace("T", " ").substring(0, 19) + " UTC";

  return {
    utcTime: utcTimeString,
    sydneyActive,
    tokyoActive,
    londonActive,
    newYorkActive,
    currentSession,
    killZone,
    amdPhase,
    economicReleaseWindow
  };
}

