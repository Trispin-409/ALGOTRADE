import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Bell, RefreshCw, Settings2, Square, Loader2, Zap, Activity } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TradingAccount, MetaStats } from '../types';
import { formatCurrency, safeFetch } from '../src/lib/utils';
import { useStore } from '../src/store';

interface DashboardProps {
  accounts: TradingAccount[];
  selectedAccountId?: string;
  isLoading: boolean;
  isAlgoTradeRunning: boolean;
  syncedAccountIds: Set<string>;
  selectedSymbol: string;
  isTradingReady: boolean;
  token?: string;
  onBuy?: () => Promise<void>;
  onSell?: () => Promise<void>;
  onToggleAlgo?: () => Promise<void>;
  lotSize?: number;
  setLotSize?: (val: number) => void;
  tradeStatus?: string;
  hasActiveSubscription?: boolean;
}

const COLORS = ['#00E5FF', '#B388FF', '#FF9800', '#00E676', '#2196F3'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const currency = payload[0].payload.currency || 'USD';
    return (
      <div className="bg-[#1C212A] border border-white/10 rounded-lg p-3 shadow-xl">
        <p className="text-[10px] text-slate-400 font-mono mb-1">{label}</p>
        <p className="text-sm font-black text-white font-mono break-all">{formatCurrency(payload[0].value, currency)}</p>
      </div>
    );
  }
  return null;
};

const Dashboard: React.FC<DashboardProps> = ({ 
  accounts, 
  selectedAccountId,
  isLoading, 
  isTradingReady, 
  token,
  hasActiveSubscription = true
}) => {
  const [stats, setStats] = useState<MetaStats | null>(null);
  const [journalTrades, setJournalTrades] = useState<any[]>([]);
  const [journalMetrics, setJournalMetrics] = useState<any>(null);
  const [journalError, setJournalError] = useState<string | null>(null);
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  
  const history = useStore(state => state.history);
  const setHistory = useStore(state => state.setHistory);

  const [isSynced, setIsSynced] = useState(isTradingReady);
  useEffect(() => { if (isTradingReady) setIsSynced(true); }, [isTradingReady]);

  const lastValidValues = useRef<{ balance: number, equity: number, margin: number, freeMargin: number, marginLevel: number, currency: string }>({ 
    balance: 0, equity: 0, margin: 0, freeMargin: 0, marginLevel: 0, currency: 'ZAR' 
  });

  const readyAccounts = useMemo(() => {
    return accounts.map(acc => ({
      ...acc,
      balance: acc.balance ?? 0,
      equity: acc.equity ?? acc.balance ?? 0,
      margin: acc.margin ?? 0,
      freeMargin: acc.freeMargin ?? 0,
      marginLevel: acc.marginLevel ?? 0,
      currency: acc.currency ?? 'ZAR'
    }));
  }, [accounts]);

  const activeAccount = useMemo(() => 
    readyAccounts.find(a => a.id === selectedAccountId) || readyAccounts[0]
  , [readyAccounts, selectedAccountId]);

  const totalBalance = useMemo(() => readyAccounts.reduce((sum, acc) => sum + Number(acc.balance), 0), [readyAccounts]);
  const totalEquity = useMemo(() => readyAccounts.reduce((sum, acc) => sum + Number(acc.equity), 0), [readyAccounts]);
  const totalMargin = useMemo(() => readyAccounts.reduce((sum, acc) => sum + Number(acc.margin), 0), [readyAccounts]);
  const totalFreeMargin = useMemo(() => readyAccounts.reduce((sum, acc) => sum + Number(acc.freeMargin), 0), [readyAccounts]);
  const avgMarginLevel = useMemo(() => {
    const valid = readyAccounts.filter(a => a.marginLevel > 0);
    if (!valid.length) return 0;
    return valid.reduce((sum, acc) => sum + acc.marginLevel, 0) / valid.length;
  }, [readyAccounts]);
  
  const resolvedCurrency = useMemo(() => {
    return readyAccounts.find(a => a.currency)?.currency || 'ZAR';
  }, [readyAccounts]);

  useEffect(() => {
    if (totalBalance > 0 || totalEquity > 0) {
      lastValidValues.current = {
        balance: totalBalance,
        equity: totalEquity,
        margin: totalMargin,
        freeMargin: totalFreeMargin,
        marginLevel: avgMarginLevel,
        currency: resolvedCurrency
      };
    }
  }, [totalBalance, totalEquity, totalMargin, totalFreeMargin, avgMarginLevel, resolvedCurrency]);

  const isInitialLoad = useRef(true);
  const [, forceUpdate] = useState({});
  useEffect(() => {
    if (readyAccounts.length > 0 && isInitialLoad.current) {
      isInitialLoad.current = false;
      forceUpdate({});
    }
  }, [readyAccounts]);

  const displayBalance = totalBalance > 0 ? totalBalance : lastValidValues.current.balance;
  const displayEquity = totalEquity > 0 ? totalEquity : lastValidValues.current.equity;
  const displayMargin = totalMargin > 0 ? totalMargin : lastValidValues.current.margin;
  const displayFreeMargin = totalFreeMargin > 0 ? totalFreeMargin : lastValidValues.current.freeMargin;
  const displayMarginLevel = avgMarginLevel > 0 ? avgMarginLevel : lastValidValues.current.marginLevel;
  const displayCurrency = (totalBalance > 0 || totalEquity > 0) ? resolvedCurrency : lastValidValues.current.currency;
  
  const subscriberAccount = activeAccount || accounts[0];

  const fetchStats = useCallback(async (accountId, status, isCurrentlySynced) => {
    if (!accountId) return;
    if (!['CONNECTED', 'READY', 'SYNCING'].includes(status?.toUpperCase())) return;
    
    setIsStatsLoading(true);
    try {
      const historyData = await safeFetch(`/api/account/${accountId}/history?limit=100`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const historyOrders = Array.isArray(historyData) ? historyData : (historyData.historyOrders || []);
      setHistory(historyOrders);
      
      if (isCurrentlySynced) {
        try {
          const metaStatsData = await safeFetch(`/api/account/${accountId}/metastats`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          });
          if (metaStatsData && metaStatsData.trades) {
            setJournalTrades(metaStatsData.trades);
            setJournalMetrics(metaStatsData.metrics);
          }
        } catch (e: any) {}
      }
    } catch (e) {
    } finally {
      setIsStatsLoading(false);
    }
  }, [token, setHistory]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const manualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await safeFetch('/api/accounts?force=true', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      await fetchStats(subscriberAccount?.id, subscriberAccount?.connectionStatus, isSynced);
    } catch (err) {} 
    finally { setTimeout(() => setIsRefreshing(false), 2000); }
  };

  useEffect(() => {
    if (subscriberAccount?.id) {
      fetchStats(subscriberAccount.id, subscriberAccount.connectionStatus, isSynced);
    }
  }, [fetchStats, subscriberAccount?.id, subscriberAccount?.connectionStatus, isSynced]);

  const [timeRange, setTimeRange] = useState<'7D' | '30D' | '90D' | 'ALL'>('7D');

  const filteredHistory = useMemo(() => {
    if (!history || history.length === 0) return [];
    const now = new Date();
    const daysMultiplier = timeRange === '7D' ? 7 : timeRange === '30D' ? 30 : timeRange === '90D' ? 90 : 3650;
    const threshold = now.getTime() - (daysMultiplier * 24 * 60 * 60 * 1000);
    return history.filter(h => new Date(h.time).getTime() >= threshold);
  }, [history, timeRange]);

  const filteredMetrics = useMemo(() => {
    const validTrades = filteredHistory.filter(t => typeof t.profit === 'number');
    const totalTrades = validTrades.length;
    if (totalTrades === 0) return { trades: 0, wonTrades: 0, lostTrades: 0, winRate: 0, profit: 0, profitFactor: 0 };

    const winningTrades = validTrades.filter(t => t.profit > 0);
    const losingTrades = validTrades.filter(t => t.profit < 0);
    const wonTrades = winningTrades.length;
    const lostTrades = losingTrades.length;
    const profit = validTrades.reduce((sum, t) => sum + t.profit, 0);
    const winRate = (wonTrades / totalTrades) * 100;
    
    const grossProfit = winningTrades.reduce((sum, t) => sum + t.profit, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0)) || 1;
    const profitFactor = grossProfit / grossLoss;

    return { trades: totalTrades, wonTrades, lostTrades, winRate, profit, profitFactor };
  }, [filteredHistory]);

  const chartData = useMemo(() => {
    // If no balance and no history, show empty
    if (displayBalance <= 0 && filteredHistory.length === 0) return [];
    
    let cumulative = displayBalance - filteredMetrics.profit;
    
    // If no history, show a straight line representing the current balance
    if (filteredHistory.length === 0) {
        return [
          {
            date: 'Initiated',
            value: cumulative,
            currency: displayCurrency
          },
          {
            date: 'Now',
            value: displayBalance,
            currency: displayCurrency
          }
        ];
    }
    
    const data = filteredHistory.map(t => {
      cumulative += (t.profit || 0);
      const d = new Date(t.time);
      return {
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: cumulative,
        currency: displayCurrency
      };
    });
    return data;
  }, [filteredHistory, displayBalance, filteredMetrics.profit, displayCurrency]);

  // Strategy performance grouping
  const strategyData = useMemo(() => {
    const groups: Record<string, { win: number, total: number, pnl: number }> = {};
    filteredHistory.forEach(t => {
      const stratName = t.comment || (t.clientId ? t.clientId : (t.magic ? `Strategy Block: ${t.magic}` : (t.symbol ? `${t.symbol} Trade` : 'Manual Trade')));
      if (!groups[stratName]) groups[stratName] = { win: 0, total: 0, pnl: 0 };
      groups[stratName].total += 1;
      if (t.profit > 0) groups[stratName].win += 1;
      groups[stratName].pnl += (t.profit || 0);
    });
    return Object.keys(groups).map(name => ({
      name,
      winRate: (groups[name].win / groups[name].total) * 100,
      pnl: groups[name].pnl,
      trades: groups[name].total
    })).sort((a,b) => b.pnl - a.pnl);
  }, [filteredHistory]);

  const getPercentStr = (change?: number) => {
    if (!change) return "+0.00%";
    const sign = change > 0 ? "+" : "";
    return `${sign}${change.toFixed(2)}%`;
  };

  const initialBalance = displayBalance - filteredMetrics.profit;
  const balanceChange = initialBalance > 0 ? (filteredMetrics.profit / initialBalance) * 100 : 0;
  
  const pieData = [
    { name: 'Used', value: displayMargin > 0 ? displayMargin : 1 },
    { name: 'Free', value: displayFreeMargin > 0 ? displayFreeMargin : 1 },
  ];

  if (!hasActiveSubscription) {
    return (
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-5 h-5 text-amber-500" />
          <div>
            <h3 className="text-sm font-bold text-white">No active execution plan.</h3>
            <p className="text-xs text-slate-400">Unlock live terminal connection and execution capabilities.</p>
          </div>
        </div>
        <button onClick={() => window.location.href = '/pricing'} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg">ACTIVATE SYSTEM</button>
      </div>
    );
  }

  if (!accounts || accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="w-16 h-16 bg-[#0B0E14] border border-white/10 rounded-full flex items-center justify-center mb-6">
           <Zap className="w-6 h-6 text-slate-400 opacity-50" />
        </div>
        <h2 className="text-xl font-bold text-white tracking-widest uppercase mb-3">No Active Terminals</h2>
        <p className="text-sm text-slate-400 max-w-sm mb-6">You currently have no connected MetaTrader accounts. Add a cloud terminal to begin algorithmic execution.</p>
        <button onClick={() => window.document.getElementById('accounts-tab-btn')?.click()} className="px-6 py-3 bg-[var(--accent-color)] text-black text-xs font-bold rounded-lg uppercase tracking-widest hover:brightness-110 transition-all">CONFIGURE TERMINAL</button>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto pb-20 animate-in fade-in duration-500 text-slate-200">
      
      {/* TOP ROW METRICS - 3 columns even on mobile */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="bg-[#0B0E14] border border-white/5 rounded-xl p-2 sm:p-4 flex flex-col justify-between shadow-lg h-24 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 blur-3xl rounded-full opacity-10" style={{ backgroundColor: 'var(--accent-color)' }} />
          <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest relative z-10" style={{ color: 'var(--accent-color)' }}>Balance</span>
          <div className="flex flex-col relative z-10">
            <h4 className="text-[14px] sm:text-[22px] font-black text-white font-mono tracking-tighter leading-none truncate">{formatCurrency(displayBalance, displayCurrency)}</h4>
            <span className={`text-[10px] font-mono mt-1 ${balanceChange >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]'}`}>{getPercentStr(balanceChange)}</span>
          </div>
        </div>
        <div className="bg-[#0B0E14] border border-white/5 rounded-xl p-2 sm:p-4 flex flex-col justify-between shadow-lg h-24 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 blur-3xl rounded-full opacity-10" style={{ backgroundColor: 'var(--accent-color)' }} />
          <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest relative z-10" style={{ color: 'var(--accent-color)' }}>Equity</span>
          <div className="flex flex-col relative z-10">
            <h4 className="text-[14px] sm:text-[22px] font-black text-white font-mono tracking-tighter leading-none truncate">{formatCurrency(displayEquity, displayCurrency)}</h4>
            <span className={`text-[10px] font-mono mt-1 ${balanceChange >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]'}`}>{getPercentStr(balanceChange * 0.9)}</span>
          </div>
        </div>
        <div className="bg-[#0B0E14] border border-white/5 rounded-xl p-2 sm:p-4 flex flex-col justify-between shadow-lg h-24 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 blur-3xl rounded-full opacity-10" style={{ backgroundColor: 'var(--accent-color)' }} />
          <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest relative z-10" style={{ color: 'var(--accent-color)' }}>Margin</span>
          <div className="flex flex-col relative z-10">
            <h4 className="text-[14px] sm:text-[22px] font-black text-white font-mono tracking-tighter leading-none truncate">{formatCurrency(displayMargin, displayCurrency)}</h4>
            <span className="text-[10px] text-slate-500 font-mono mt-1">{displayBalance > 0 ? ((displayMargin/displayBalance)*100).toFixed(1) : '0.0'}%</span>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEFT COLUMN */}
        <div className="space-y-4">
          {/* ACCOUNT OVERVIEW */}
          <div className="bg-[#0B0E14] border border-white/5 rounded-[24px] p-5 shadow-lg relative flex flex-col h-full">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded shrink-0 bg-black/40 border border-white/10 flex items-center justify-center accent-glow" style={{ color: 'var(--accent-color)' }}>
                   <Activity className="w-4 h-4" style={{ color: 'var(--accent-color)' }} />
                </div>
                <h2 className="text-sm font-bold text-slate-300 uppercase tracking-widest">Account Overview</h2>
              </div>
              <Settings2 className="w-4 h-4 text-slate-500 hover:text-white cursor-pointer" />
            </div>
            
            <div className="flex flex-col sm:flex-row items-center justify-between gap-8 flex-1">
              <div className="relative w-48 h-48 sm:w-56 sm:h-56 shrink-0 aspect-square">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                <Pie
                  data={strategyData.length > 0 ? strategyData.map((s, i) => ({ value: Math.max(s.pnl, 0) + 1, name: s.name, fill: `rgba(var(--accent-color-rgb), ${1 - (i * 0.15)})` })) : [{value: 100, fill: 'var(--accent-color)'}]}
                  innerRadius="80%"
                  outerRadius="90%"
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                  isAnimationActive={true}
                >
                </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <svg style={{ height: 0, width: 0, position: 'absolute' }}>
                   <defs>
                     <linearGradient id="blueGrad" x1="0" y1="0" x2="1" y2="1">
                       <stop offset="0%" stopColor="var(--accent-color)" />
                       <stop offset="100%" stopColor="rgba(var(--accent-color-rgb), 0.3)" />
                     </linearGradient>
                   </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--accent-color)' }}>Equity</span>
                  <span className="text-xl font-bold text-white font-mono leading-tight">{formatCurrency(displayEquity, displayCurrency)}</span>
                  <span className={`text-sm font-mono mt-1 ${balanceChange >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]'}`}>{getPercentStr(balanceChange)}</span>
                </div>
              </div>
              
              <div className="flex-1 w-full space-y-4 pb-2">
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent-color)' }} />
                    <span className="text-xs text-slate-400">Balance</span>
                  </div>
                  <span className="text-sm font-bold text-white font-mono">{formatCurrency(displayBalance, displayCurrency)}</span>
                </div>
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent-color)' }} />
                    <span className="text-xs text-slate-400">Equity</span>
                  </div>
                  <span className="text-sm font-bold text-white font-mono">{formatCurrency(displayEquity, displayCurrency)}</span>
                </div>
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent-color)' }} />
                    <span className="text-xs text-slate-400">Margin Used</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-white font-mono pr-2">{formatCurrency(displayMargin, displayCurrency)}</span>
                    <span className="text-[10px] text-slate-500 font-mono">({displayBalance > 0 ? ((displayMargin/displayBalance)*100).toFixed(1) : '0.0'}%)</span>
                  </div>
                </div>
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent-color)' }} />
                    <span className="text-xs text-slate-400">Free Margin</span>
                  </div>
                  <span className="text-sm font-bold text-white font-mono">{formatCurrency(displayFreeMargin, displayCurrency)}</span>
                </div>
                <div className="flex justify-between items-center pb-1">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent-color)' }} />
                    <span className="text-xs text-slate-400">Margin Level</span>
                  </div>
                  <span className="text-sm font-bold text-white font-mono">{displayMarginLevel.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* THREE CARDS ROW - 3 columns even on mobile for compactness */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[#0B0E14] border border-white/5 rounded-xl p-3 sm:p-5 shadow-lg flex flex-col justify-between h-24 sm:h-[110px]">
              <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent-color)' }}>Total PNL</span>
              <div className="flex flex-col mt-2">
                <span className={`text-[14px] sm:text-[22px] tracking-tighter font-black font-mono truncate ${filteredMetrics.profit >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]'}`}>
                  {filteredMetrics.profit >= 0 ? '+' : ''}{formatCurrency(filteredMetrics.profit, displayCurrency)}
                </span>
                <span className={`text-[9px] sm:text-xs font-mono mt-1 ${filteredMetrics.profit >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]'}`}>{getPercentStr(balanceChange)}</span>
              </div>
            </div>
            <div className="bg-[#0B0E14] border border-white/5 rounded-xl p-3 sm:p-5 shadow-lg flex flex-col justify-between h-24 sm:h-[110px]">
              <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent-color)' }}>Win Rate</span>
              <div className="flex flex-col mt-2">
                <span className={`text-[14px] sm:text-[22px] tracking-tighter font-black font-mono ${filteredMetrics.winRate >= 50 ? 'text-[#00E676]' : 'text-[#FF1744]'}`}>{filteredMetrics.winRate.toFixed(1)}%</span>
                <span className="text-[9px] sm:text-xs text-slate-500 font-mono mt-1 truncate">{filteredMetrics.wonTrades}/{filteredMetrics.trades}</span>
              </div>
            </div>
            <div className="bg-[#0B0E14] border border-white/5 rounded-xl p-3 sm:p-5 shadow-lg flex flex-col justify-between h-24 sm:h-[110px]">
              <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent-color)' }}>P. Factor</span>
              <div className="flex flex-col mt-2">
                <span className={`text-[14px] sm:text-[22px] tracking-tighter font-black font-mono ${filteredMetrics.profitFactor > 1.0 ? 'text-[#00E676]' : 'text-[#FF1744]'}`}>{filteredMetrics.profitFactor.toFixed(2)}</span>
                <span className={`text-[9px] sm:text-xs font-mono mt-1 truncate ${filteredMetrics.profitFactor > 1.5 ? 'text-[#00E676]' : (filteredMetrics.profitFactor > 1.0 ? 'text-amber-500' : 'text-[#FF1744]')}`}>{filteredMetrics.profitFactor > 1.5 ? 'GOOD' : (filteredMetrics.profitFactor > 1.0 ? 'AVG' : 'POOR')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4">
          {/* TRADING JOURNEY */}
          <div className="bg-[#0B0E14] border border-white/5 rounded-[24px] p-5 shadow-lg">
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded shrink-0 bg-black/40 border border-white/10 flex items-center justify-center accent-glow" style={{ color: 'var(--accent-color)' }}>
                   <Activity className="w-4 h-4" style={{ color: 'var(--accent-color)' }} />
                </div>
                <h2 className="text-sm font-bold text-slate-300 uppercase tracking-widest">Trading Journey</h2>
              </div>
              <div className="flex bg-[#000] rounded-lg p-1 border border-white/5">
                {['7D', '30D', '90D', 'ALL'].map(range => (
                  <button 
                    key={range}
                    onClick={() => setTimeRange(range as any)}
                    className={`px-4 py-1.5 rounded-md text-[10px] font-bold transition-all ${timeRange === range ? 'text-white shadow accent-glow' : 'text-slate-500 hover:text-white'}`}
                    style={timeRange === range ? { backgroundColor: 'var(--accent-color)' } : {}}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={filteredMetrics.profit >= 0 ? '#00E676' : '#FF1744'} stopOpacity={0.4}/>
                      <stop offset="95%" stopColor={filteredMetrics.profit >= 0 ? '#00E676' : '#FF1744'} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" stroke="#334155" fontSize={10} tickLine={false} axisLine={false} tickMargin={10} minTickGap={20} />
                  <YAxis stroke="#334155" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `${val >= 1000 ? (val/1000).toFixed(0)+'K' : val}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="value" stroke={filteredMetrics.profit >= 0 ? '#00E676' : '#FF1744'} strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* STRATEGY PERFORMANCE */}
          <div className="bg-[#0B0E14] border border-white/5 rounded-[24px] p-5 shadow-lg flex-1">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                 <div className="w-8 h-8 rounded shrink-0 bg-black/40 border border-white/10 flex items-center justify-center accent-glow" style={{ color: 'var(--accent-color)' }}>
                     <Activity className="w-4 h-4" style={{ color: 'var(--accent-color)' }} />
                 </div>
                 <h2 className="text-sm font-bold text-slate-300 uppercase tracking-widest">Strategy Performance</h2>
              </div>
              <button className="text-[10px] font-bold uppercase tracking-widest hover:text-white transition-colors" style={{ color: 'var(--accent-color)' }}>View All</button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="pb-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono pl-2">Strategy</th>
                    <th className="pb-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono text-center">Win Rate</th>
                    <th className="pb-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono text-right">PNL</th>
                    <th className="pb-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono text-right pr-2">Trades</th>
                  </tr>
                </thead>
                <tbody>
                  {strategyData.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-xs text-slate-500 font-mono">No strategy data in timeframe</td>
                    </tr>
                  ) : (
                    strategyData.slice(0, 5).map((strat, i) => (
                      <tr key={strat.name} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                        <td className="py-4 text-sm text-slate-300 font-bold max-w-[150px] truncate pl-2">{strat.name}</td>
                        <td className="py-4 text-sm text-white font-mono text-center">{strat.winRate.toFixed(1)}%</td>
                        <td className={`py-4 text-sm font-mono text-right font-bold ${strat.pnl >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]'}`}>
                          {strat.pnl >= 0 ? '+' : ''}{formatCurrency(strat.pnl, displayCurrency)}
                        </td>
                        <td className="py-4 text-sm text-white font-mono text-right pr-2">{strat.trades}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default Dashboard;
