
export const SystemState = {
  BOOTING: "BOOTING",
  METAAPI_STARTING: "METAAPI_STARTING",
  SYNCING: "SYNCING",
  READY: "READY",
  DEGRADED: "DEGRADED",
  OFFLINE: "OFFLINE"
} as const;

export type SystemState = typeof SystemState[keyof typeof SystemState];

export const PlatformType = {
  MT4: 'mt4',
  MT5: 'mt5'
} as const;

export type PlatformType = typeof PlatformType[keyof typeof PlatformType];

export interface TradingAccount {
  id: string;
  name: string;
  platform: PlatformType;
  login: string;
  connectionStatus: string;
  state: string;
  balance?: number;
  equity?: number;
  margin?: number;
  freeMargin?: number;
  marginLevel?: number;
  currency?: string;
  ready?: boolean;
}

export interface MetaStats {
  trades?: number;
  profit?: number;
  pips?: number;
  winRate?: number;
  drawdown?: number;
  equity?: number;
  balance?: number;
}

export interface RiskLimit {
  id?: string;
  type: 'equity' | 'balance' | 'drawdown';
  threshold: number;
  action: 'stop-trading' | 'close-trades' | 'notify';
  active: boolean;
}

export interface ExpertAdvisor {
  expertId: string;
  period: string;
  symbol: string;
  fileUploaded: boolean;
}

export interface TradeSignal {
  symbol: string;
  type: 'POSITION_TYPE_BUY' | 'POSITION_TYPE_SELL';
  volume: number;
  time: string;
  price?: number;
}

export interface Metric {
  label: string;
  value: string | number;
  change?: number;
}
