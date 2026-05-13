
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Wallet, Activity, Percent, ShieldCheck, ArrowUpRight, ArrowDownRight, TrendingUp, Loader2, BarChart3, History, Layers, RefreshCw, Square } from 'lucide-react';
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

import { connectionManager } from '../src/lib/ConnectionManager';
import { Play, X, Zap } from 'lucide-react';

const Dashboard: React.FC<DashboardProps> = ({ 
  accounts, 
  selectedAccountId,
  isLoading, 
  isAlgoTradeRunning, 
  syncedAccountIds, 
  selectedSymbol, 
  isTradingReady, 
  token,
  onBuy,
  onSell,
  onToggleAlgo,
  lotSize = 0.01,
  setLotSize,
  tradeStatus,
  hasActiveSubscription = true
}) => {
  const [stats, setStats] = useState<MetaStats | null>(null);
  const [journalTrades, setJournalTrades] = useState<any[]>([]);
  const [journalMetrics, setJournalMetrics] = useState<any>(null);
  const [journalError, setJournalError] = useState<string | null>(null);
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const positions = useStore(state => state.positions);
  const history = useStore(state => state.history);
  const setPositions = useStore(state => state.setPositions);
  const setHistory = useStore(state => state.setHistory);

  const [isSynced, setIsSynced] = useState(isTradingReady);

  useEffect(() => {
    if (isTradingReady) {
      setIsSynced(true);
    }
  }, [isTradingReady]);

  useEffect(() => {
    // Component unmounted state handled by global App.tsx subscription
  }, []);

  const lastValidValues = useRef<{ balance: number, equity: number, activeBalance: number, currency: string }>({ 
    balance: 0, 
    equity: 0, 
    activeBalance: 0, 
    currency: 'USD' 
  });

  // 1. DUAL-LAYER ARCHITECTURE
  const readyAccounts = useMemo(() => {
    return accounts.map(acc => ({
      ...acc,
      balance: acc.balance ?? 0,
      equity: acc.equity ?? acc.balance ?? 0,
      currency: acc.currency ?? 'USD'
    }));
  }, [accounts]);

  const activeAccount = useMemo(() => 
    readyAccounts.find(a => a.id === selectedAccountId) || readyAccounts[0]
  , [readyAccounts, selectedAccountId]);

  const totalBalance = useMemo(() => 
    readyAccounts.reduce((sum, acc) => sum + Number(acc.balance), 0)
  , [readyAccounts]);

  const totalEquity = useMemo(() => 
    readyAccounts.reduce((sum, acc) => sum + Number(acc.equity), 0)
  , [readyAccounts]);
  
  // 2. Persistent Currency Resolution
  const resolvedCurrency = useMemo(() => {
    const activeAcc = accounts.find(a => a.id === selectedAccountId);
    if (activeAcc?.currency) return activeAcc.currency;
    
    const anyCurrency = accounts.find(acc => acc.currency)?.currency;
    return anyCurrency || 'ZAR';
  }, [accounts, selectedAccountId]);

  // Persistent Display Logic: Only switch to "0.00" if we explicitly mean it
  const isCurrentlySyncing = isLoading && readyAccounts.length === 0;

  useEffect(() => {
    if (totalBalance > 0 || totalEquity > 0) {
      lastValidValues.current = {
        balance: totalBalance,
        equity: totalEquity,
        activeBalance: activeAccount?.balance || 0,
        currency: resolvedCurrency
      };
    }
  }, [totalBalance, totalEquity, activeAccount, resolvedCurrency]);

  // 3. INITIAL LOAD BUFFER
  const isInitialLoad = useRef(true);
  const [, forceUpdate] = useState({});

  useEffect(() => {
    if (readyAccounts.length > 0 && isInitialLoad.current) {
      isInitialLoad.current = false;
      forceUpdate({});
    }
  }, [readyAccounts]);

  const isStable = !isInitialLoad.current;

  const displayBalance = totalBalance > 0 ? totalBalance : lastValidValues.current.balance;
  const displayEquity = totalEquity > 0 ? totalEquity : lastValidValues.current.equity;
  const displayActiveBalance = (activeAccount?.balance || 0) > 0 ? (activeAccount?.balance || 0) : lastValidValues.current.activeBalance;
  const displayCurrency = (totalBalance > 0 || totalEquity > 0) ? resolvedCurrency : lastValidValues.current.currency;
  
  const connectedCount = useMemo(() => 
    accounts.filter(a => ['CONNECTED', 'READY'].includes(a.connectionStatus?.toUpperCase())).length
  , [accounts]);
  
  // Choose the active account for displaying stats/positions
  const subscriberAccount = activeAccount || accounts[0];

  const fetchStats = useCallback(async () => {
    if (!subscriberAccount) return;
    
    // We allow fetching if status is READY or SYNCING
    const status = subscriberAccount.connectionStatus?.toUpperCase();
    if (!['CONNECTED', 'READY', 'SYNCING'].includes(status)) {
      setJournalTrades([]);
      setJournalMetrics(null);
      return;
    }
    
    setIsStatsLoading(true);
    try {
      // Fetch History via SDK Synchronizer (Faster fallback)
      const historyData = await safeFetch(`/api/account/${subscriberAccount.id}/history?limit=100`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const historyOrders = Array.isArray(historyData) ? historyData : (historyData.historyOrders || []);
      setHistory(historyOrders);
      
      // Always try to fetch MetaStats if synced
      if (isSynced) {
        try {
          setJournalError(null);
          const metaStatsData = await safeFetch(`/api/account/${subscriberAccount.id}/metastats`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          });
          if (metaStatsData) {
            setJournalTrades(metaStatsData.trades || []);
            setJournalMetrics(metaStatsData.metrics || {});
            
            // If MetaStats is empty, but we have SDK history, don't show the error as strongly
            if (metaStatsData.status === 'synchronizing' || (metaStatsData.message && (!metaStatsData.trades || metaStatsData.trades.length === 0))) {
              if (historyOrders.length === 0) {
                setJournalError(metaStatsData.message || "Journal is synchronizing...");
              } else {
                setJournalError(null); // Clear error if we have SDK history to show
              }
            } else {
              setJournalError(null);
            }
          }
        } catch (e: any) {
          console.error("Failed to fetch metastats data:", e);
          // Only show error if we also have no SDK history
          if (historyOrders.length === 0) {
            setJournalError(e.message || "Failed to load journal metrics");
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch terminal data:", e);
    } finally {
      setIsStatsLoading(false);
    }
  }, [subscriberAccount, isSynced, token, setHistory]);

  const clearHistory = () => {
    setHistory([]);
  };

  useEffect(() => {
    if (subscriberAccount) {
      fetchStats();
    }
  }, [fetchStats, subscriberAccount]);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const stopRefreshing = () => setIsRefreshing(false);
  const manualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await safeFetch('/api/accounts?force=true', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      await fetchStats();
      // Logic for triggering global fetch should be handled by App state, but here we can just wait
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(stopRefreshing, 2000);
    }
  };

  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('week');

  const filteredJournalTrades = useMemo(() => {
    if (!journalTrades || journalTrades.length === 0) return [];
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const oneWeekAgo = now.getTime() - (7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = now.getTime() - (30 * 24 * 60 * 60 * 1000);

    return journalTrades.filter(t => {
      const tradeTime = t.closeTime || t.time;
      if (!tradeTime) return false;
      const tTime = new Date(tradeTime).getTime();
      if (timeRange === 'today') return tTime >= startOfToday;
      if (timeRange === 'week') return tTime >= oneWeekAgo;
      if (timeRange === 'month') return tTime >= oneMonthAgo;
      return true;
    });
  }, [journalTrades, timeRange]);

  const filteredHistory = useMemo(() => {
    if (!history || history.length === 0) return [];
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const oneWeekAgo = now.getTime() - (7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = now.getTime() - (30 * 24 * 60 * 60 * 1000);

    return history.filter(h => {
      const time = new Date(h.time).getTime();
      if (timeRange === 'today') return time >= startOfToday;
      if (timeRange === 'week') return time >= oneWeekAgo;
      if (timeRange === 'month') return time >= oneMonthAgo;
      return true;
    });
  }, [history, timeRange]);

  const filteredMetrics = useMemo(() => {
    const tradesSource = filteredJournalTrades.length > 0 ? filteredJournalTrades : filteredHistory;
    const validTrades = tradesSource.filter(t => (typeof t.profit === 'number' || typeof t.gain === 'number'));
    
    const totalTrades = validTrades.length;
    if (totalTrades === 0) return { trades: 0, wonTrades: 0, lostTrades: 0, wonTradesPercent: 0, profit: 0 };

    const wonTrades = validTrades.filter(t => ((typeof t.profit === 'number' ? t.profit : t.gain) || 0) > 0).length;
    const lostTrades = totalTrades - wonTrades;
    const profit = validTrades.reduce((sum, t) => sum + ((typeof t.profit === 'number' ? t.profit : t.gain) || 0), 0);
    const wonTradesPercent = (wonTrades / totalTrades) * 100;

    return {
      trades: totalTrades,
      wonTrades,
      lostTrades,
      wonTradesPercent,
      profit
    };
  }, [filteredJournalTrades, filteredHistory]);

  const tradesByDay = useMemo(() => {
    const tradesSource = filteredJournalTrades.length > 0 ? filteredJournalTrades : filteredHistory;
    if (tradesSource.length === 0) return [];
    
    const groups: Record<string, any[]> = {};
    tradesSource.forEach(t => {
      const tradeTime = t.closeTime || t.time;
      if (!tradeTime) return;
      const date = new Date(tradeTime);
      const isoKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
      if (!groups[isoKey]) groups[isoKey] = [];
      groups[isoKey].push(t);
    });

    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a)) // Sort YYYY-MM-DD descending
      .map(key => {
        const dayTrades = groups[key];
        const dateObj = new Date(key);
        const displayDate = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const won = dayTrades.filter(t => ((typeof t.profit === 'number' ? t.profit : t.gain) || 0) > 0).length;
        const lost = dayTrades.filter(t => ((typeof t.profit === 'number' ? t.profit : t.gain) || 0) < 0).length;
        const total = won + lost;
        const wonPercent = total > 0 ? Math.round((won / total) * 100) : 0;
        const lostPercent = total > 0 ? Math.round((lost / total) * 100) : 0;
        const totalProfit = dayTrades.reduce((sum, t) => sum + (typeof t.profit === 'number' ? t.profit : t.gain || 0), 0);
        return {
          date: displayDate,
          isoDate: key,
          trades: dayTrades,
          won,
          lost,
          total,
          wonPercent,
          lostPercent,
          totalProfit
        };
      });
  }, [filteredJournalTrades, filteredHistory]);

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full overflow-x-hidden">
      {!hasActiveSubscription && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <Zap className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">No active execution plan.</h3>
              <p className="text-xs text-slate-400">Unlock live terminal connection and execution capabilities.</p>
            </div>
          </div>
          <button 
            onClick={() => window.location.href = '/pricing'}
            className="w-full sm:w-auto px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg whitespace-nowrap transition-colors"
          >
            ACTIVATE SYSTEM
          </button>
        </div>
      )}
      
      <div className="flex items-center justify-between px-1">
        <div className="flex flex-col">
          <h2 className="text-base sm:text-lg font-black text-white tracking-tight uppercase flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-slate-400" />
            Core Analytics
          </h2>
          <p className="text-[10px] text-slate-500 font-mono tracking-widest uppercase mt-0.5">Terminal Synchronizer</p>
        </div>
        <button 
          onClick={manualRefresh}
          disabled={isRefreshing || isLoading}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/80 border border-white/5 rounded-lg text-[10px] font-mono text-slate-300 uppercase tracking-widest hover:bg-slate-800 transition-all disabled:opacity-50"
        >
          {isRefreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          <span className="hidden sm:inline">{isRefreshing ? 'SYNCING DATA' : 'POLL TERMINAL'}</span>
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <MetricCard 
          label="GROSS BALANCE" 
          value={isStable ? formatCurrency(displayBalance, displayCurrency) : "SYNCING"} 
          icon={Wallet} 
          color="blue" 
        />
        <MetricCard 
          label="ACTIVE EQUITY" 
          value={isStable ? formatCurrency(displayActiveBalance, displayCurrency) : "SYNCING"} 
          icon={Zap} 
          color="emerald" 
        />
        <MetricCard 
          label="GROSS EQUITY" 
          value={isStable ? formatCurrency(displayEquity, displayCurrency) : "SYNCING"} 
          icon={Layers} 
          color="indigo" 
        />
        <MetricCard 
          label="TERMINAL NODES" 
          value={`${connectedCount} / ${accounts.length}`} 
          icon={Activity} 
          color="amber" 
        />
      </div>

      {hasActiveSubscription && isStable && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
            <div className="flex flex-col">
              <h2 className="text-sm sm:text-base font-black text-white tracking-tight uppercase flex items-center gap-2">
                <History className="w-3.5 h-3.5 text-slate-400" />
                Execution Log
              </h2>
            </div>
            <div className="flex items-center bg-black/40 p-0.5 rounded-lg border border-white/10 w-full sm:w-auto">
              <button 
                onClick={() => setTimeRange('today')}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-[9px] font-mono font-bold uppercase tracking-widest transition-all ${timeRange === 'today' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'text-slate-500 hover:text-slate-300'}`}
              >
                TODAY
              </button>
              <button 
                onClick={() => setTimeRange('week')}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-[9px] font-mono font-bold uppercase tracking-widest transition-all ${timeRange === 'week' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'text-slate-500 hover:text-slate-300'}`}
              >
                7 DAYS
              </button>
              <button 
                onClick={() => setTimeRange('month')}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-[9px] font-mono font-bold uppercase tracking-widest transition-all ${timeRange === 'month' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'text-slate-500 hover:text-slate-300'}`}
              >
                30 DAYS
              </button>
            </div>
          </div>

          {isStatsLoading && filteredJournalTrades.length === 0 ? (
            <div className="bg-black/40 border border-white/10 p-6 rounded-xl shadow-lg text-center flex flex-col items-center justify-center">
              <Loader2 className="w-6 h-6 text-indigo-500 animate-spin mb-2" />
              <h3 className="text-xs font-black text-white uppercase tracking-tight">Syncing Operations</h3>
              <p className="text-[9px] uppercase font-mono tracking-widest text-slate-500 mt-1">Retrieving terminal chunks...</p>
            </div>
          ) : journalError && history.length === 0 ? (
            <div className="bg-black/40 border border-white/10 p-6 rounded-xl shadow-lg text-center">
              <History className="w-6 h-6 text-slate-700 mx-auto mb-2" />
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-tight">DATA UNAVAILABLE</h3>
              <p className="text-[9px] uppercase font-mono tracking-widest text-slate-600 mt-1">{journalError}</p>
            </div>
          ) : (
             <>
                {filteredMetrics.trades > 0 && (
            <div className={`grid grid-cols-2 md:grid-cols-4 gap-2 bg-black/60 border ${filteredMetrics.profit >= 0 ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-rose-500/20 bg-rose-500/5'} p-3 rounded-xl shadow-lg backdrop-blur-md mb-4`}>
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-500 font-mono uppercase tracking-widest">Op Count</span>
                <span className="text-sm font-black text-white font-mono">{filteredMetrics.trades || 0}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-500 font-mono uppercase tracking-widest">Hit Rate</span>
                <span className={`text-sm font-black font-mono ${filteredMetrics.wonTradesPercent >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {filteredMetrics.wonTradesPercent ? Math.round(filteredMetrics.wonTradesPercent) : 0}%
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-500 font-mono uppercase tracking-widest">W/L Ratio</span>
                <span className="text-sm font-black font-mono text-white">
                  <span className="text-emerald-400">{filteredMetrics.wonTrades || 0}</span>
                  <span className="text-slate-600 mx-1">/</span>
                  <span className="text-rose-400">{filteredMetrics.lostTrades || 0}</span>
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-500 font-mono uppercase tracking-widest">Net Realized</span>
                <span className={`text-sm font-black font-mono ${filteredMetrics.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {filteredMetrics.profit >= 0 ? '+' : ''}{formatCurrency(filteredMetrics.profit || 0, displayCurrency)}
                </span>
              </div>
            </div>
          )}

          {tradesByDay.length > 0 ? (
            <div className="space-y-4">
              {tradesByDay.map(day => (
              <div key={day.isoDate} className="bg-black/40 border border-white/5 p-3 sm:p-4 rounded-xl shadow-lg backdrop-blur-md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 pb-2 border-b border-white/5 gap-1">
                  <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-tight">{day.date}</h3>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">SESSION</span>
                      <span className={`text-sm font-mono font-black tracking-tight ${day.totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {day.totalProfit >= 0 ? '+' : ''}{formatCurrency(day.totalProfit, displayCurrency)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
                  {day.trades.map((trade: any, i: number) => {
                    const isBuy = trade.type?.toUpperCase().includes('BUY');
                    const isWin = ((typeof trade.profit === 'number' ? trade.profit : trade.gain) || 0) >= 0;
                    return (
                    <div key={trade._id || trade.id || `trade-${i}`} className="bg-slate-900/50 border border-white/5 p-2 rounded flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-black text-white tracking-widest truncate max-w-[60%]">{trade.symbol}</span>
                          <span className={`text-[8px] px-1 py-0.5 rounded font-mono font-bold uppercase tracking-widest ${isBuy ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                            {isBuy ? 'BUY' : 'SELL'}
                          </span>
                        </div>
                      <div className={`text-xs font-mono font-black tracking-tight mb-1 shrink-0 ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isWin ? '+' : ''}{formatCurrency(((typeof trade.profit === 'number' ? trade.profit : trade.gain) || 0), displayCurrency)}
                      </div>
                      <div className="flex justify-between items-center bg-black/30 p-1 rounded text-[8px] font-mono text-slate-500 uppercase tracking-widest mt-auto">
                        <span>{(trade.openTime || trade.time) ? new Date(trade.openTime || trade.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                        <span className="text-slate-700 mx-1">-</span>
                        <span>{(trade.closeTime || trade.time) ? new Date(trade.closeTime || trade.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredHistory.length > 0 ? (
                <div className="bg-black/40 border border-white/10 p-4 rounded-xl shadow-lg backdrop-blur-md">
                   <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 pb-2 border-b border-white/5 gap-2">
                      <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-tight">RAW TERMINAL FEED ({timeRange})</h3>
                      <span className="text-[8px] font-mono text-indigo-400 font-bold uppercase tracking-widest border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 rounded">LIVE LINK</span>
                   </div>
                   <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                      {filteredHistory.slice(0, 30).map((order: any, i: number) => {
                         const isBuy = order.type?.toUpperCase().includes('BUY');
                         const isWin = order.profit >= 0;
                         return (
                        <div key={order.id || `hist-${i}`} className="bg-slate-900/50 border border-white/5 p-2 rounded flex flex-col justify-between">
                          <div className="flex items-center justify-between mb-1">
                             <span className="text-[10px] font-black text-white tracking-widest truncate max-w-[60%]">{order.symbol}</span>
                             <span className={`text-[8px] px-1 py-0.5 rounded font-mono font-bold uppercase tracking-widest ${isBuy ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                               {isBuy ? 'BUY' : 'SELL'}
                             </span>
                          </div>
                          <div className="flex justify-between items-end mb-1">
                             <div>
                                <p className="text-[8px] text-slate-600 font-mono uppercase tracking-widest">VOL</p>
                                <p className="text-[10px] font-mono font-black text-slate-300">{order.volume}</p>
                             </div>
                             {order.profit !== undefined && (
                                <div className={`text-xs font-mono font-black ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {isWin ? '+' : ''}{formatCurrency(order.profit, displayCurrency)}
                                </div>
                             )}
                          </div>
                          <div className="text-[8px] font-mono text-slate-500 uppercase tracking-widest text-right mt-auto pt-1 border-t border-white/5">
                             {new Date(order.time).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </div>
                        </div>
                        );
                      })}
                   </div>
                </div>
              ) : (
                <div className="bg-black/40 border border-white/5 p-8 rounded-xl shadow-lg text-center">
                  <Square className="w-8 h-8 text-slate-800 mx-auto mb-3" />
                  <h3 className="text-sm font-black text-slate-500 uppercase tracking-tight">NO TERMINAL DATA</h3>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-slate-600 mt-2">Time range: {timeRange}</p>
                </div>
              )}
            </div>
          )}
          </>
          )}
        </div>
      )}
    </div>
  );
};

const MetricCard: React.FC<{ label: string, value: string, icon: any, color: string }> = ({ label, value, icon: Icon, color }) => {
  const colors: Record<string, string> = {
    blue: 'text-blue-400 bg-blue-400/10 border-blue-500/20',
    indigo: 'text-indigo-400 bg-indigo-400/10 border-indigo-500/20',
    emerald: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20',
    amber: 'text-amber-400 bg-amber-400/10 border-amber-500/20',
  };
  return (
    <div className="bg-black/40 border border-white/10 p-4 sm:p-5 rounded-xl shadow-lg backdrop-blur-md flex flex-row sm:flex-col items-center sm:items-start justify-between sm:justify-start gap-3 sm:gap-0">
      <div className={`p-2.5 sm:p-3 rounded-lg border w-fit sm:mb-4 shrink-0 ${colors[color]}`}>
        <Icon className="w-4 h-4 sm:w-5 h-5" />
      </div>
      <div className="flex-1 text-right sm:text-left">
        <p className="text-[9px] sm:text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</p>
        <h4 className="text-lg sm:text-xl font-mono font-black text-white tracking-tighter truncate">{value}</h4>
      </div>
    </div>
  );
};

export default Dashboard;
