
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Wallet, Activity, Percent, ShieldCheck, ArrowUpRight, ArrowDownRight, TrendingUp, Loader2, BarChart3, History, Layers, RefreshCw } from 'lucide-react';
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
  
  // Choose the first connected account for displaying stats/positions
  const subscriberAccount = accounts.find(a => ['CONNECTED', 'READY'].includes(a.connectionStatus?.toUpperCase())) || accounts[0];

  const fetchStats = useCallback(async () => {
    if (!subscriberAccount || !['CONNECTED', 'READY'].includes(subscriberAccount.connectionStatus?.toUpperCase())) {
      setPositions([]);
      setHistory([]);
      return;
    }
    
    setIsStatsLoading(true);
    try {
      if (isSynced) {
        // Fetch History via SDK Synchronizer
        const historyData = await safeFetch(`/api/account/${subscriberAccount.id}/history?limit=20`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        setHistory(Array.isArray(historyData) ? historyData : (historyData.historyOrders || []));
        
        try {
          setJournalError(null);
          const metaStatsData = await safeFetch(`/api/account/${subscriberAccount.id}/metastats`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          });
          if (metaStatsData) {
            setJournalTrades(metaStatsData.trades || []);
            setJournalMetrics(metaStatsData.metrics || {});
            if (metaStatsData.message && (!metaStatsData.trades || metaStatsData.trades.length === 0)) {
              setJournalError(metaStatsData.message);
            } else {
              setJournalError(null);
            }
          }
        } catch (e: any) {
          console.error("Failed to fetch metastats data:", e);
          if (e.message) setJournalError(e.message);
        }
      }
    } catch (e) {
      console.error("Failed to fetch terminal data:", e);
    } finally {
      setIsStatsLoading(false);
    }
  }, [subscriberAccount, isSynced, token]);

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
      // Logic for triggering global fetch should be handled by App state, but here we can just wait
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(stopRefreshing, 2000);
    }
  };

  const tradesByDay = useMemo(() => {
    if (!journalTrades || journalTrades.length === 0) return [];
    // Filter closed trades only
    const closed = journalTrades.filter(t => t.closeTime);
    
    const groups: Record<string, any[]> = {};
    closed.forEach(t => {
      const dateKey = new Date(t.closeTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(t);
    });
    
    return Object.keys(groups)
      // Sort by actual date
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
      .map(key => {
        const dayTrades = groups[key];
        const won = dayTrades.filter(t => ((typeof t.profit === 'number' ? t.profit : t.gain) || 0) > 0).length;
        const lost = dayTrades.filter(t => ((typeof t.profit === 'number' ? t.profit : t.gain) || 0) < 0).length;
        const total = won + lost;
        const wonPercent = total > 0 ? Math.round((won / total) * 100) : 0;
        const lostPercent = total > 0 ? Math.round((lost / total) * 100) : 0;
        const totalProfit = dayTrades.reduce((sum, t) => sum + (typeof t.profit === 'number' ? t.profit : t.gain || 0), 0);
        return {
          date: key,
          trades: dayTrades,
          won,
          lost,
          total,
          wonPercent,
          lostPercent,
          totalProfit
        };
      });
  }, [journalTrades]);

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full overflow-x-hidden">
      {!hasActiveSubscription && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500/20 rounded-full">
              <Zap className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">No active plan. Please subscribe to start trading.</h3>
              <p className="text-sm text-slate-400">Unlock MetaApi connections and live execution.</p>
            </div>
          </div>
          <button 
            onClick={() => window.location.href = '/pricing'}
            className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl whitespace-nowrap transition-colors shadow-lg"
          >
            View Plans
          </button>
        </div>
      )}
      
      <div className="flex items-center justify-between px-2">
        <div className="flex flex-col">
          <h2 className="text-lg sm:text-x font-black text-white tracking-tight uppercase italic flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-500" />
            Intelligence Metrics
          </h2>
          <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mt-0.5">Real-time Terminal Monitoring</p>
        </div>
        <button 
          onClick={manualRefresh}
          disabled={isRefreshing || isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800/80 border border-white/5 rounded-xl text-[10px] font-black text-slate-300 uppercase tracking-widest hover:bg-slate-700 transition-all disabled:opacity-50 shadow-lg backdrop-blur-sm"
        >
          {isRefreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          {isRefreshing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <MetricCard 
          label="Global Balance" 
          value={isStable ? formatCurrency(displayBalance, displayCurrency) : "Syncing..."} 
          icon={Wallet} 
          color="blue" 
        />
        <MetricCard 
          label="Live Balance" 
          value={isStable ? formatCurrency(displayActiveBalance, displayCurrency) : "Syncing..."} 
          icon={Zap} 
          color="emerald" 
        />
        <MetricCard 
          label="Equity" 
          value={isStable ? formatCurrency(displayEquity, displayCurrency) : "Syncing..."} 
          icon={Layers} 
          color="indigo" 
        />
        <MetricCard 
          label="Terminals" 
          value={`${connectedCount} / ${accounts.length}`} 
          icon={Activity} 
          color="amber" 
        />
      </div>

      {hasActiveSubscription && isStable && (
        <div className="mt-8 space-y-6">
          <div className="flex flex-col">
            <h2 className="text-lg sm:text-xl font-black text-white tracking-tight uppercase italic flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-500" />
              Trade Journal
            </h2>
            <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mt-0.5">Historical Analysis & Metrics</p>
          </div>

          {journalError ? (
            <div className="bg-slate-900/40 border border-rose-500/20 p-8 rounded-[24px] shadow-lg text-center">
              <History className="w-10 h-10 text-rose-500/50 mx-auto mb-3" />
              <h3 className="text-lg font-black text-rose-400 uppercase tracking-tight">Journal Unavailable</h3>
              <p className="text-xs text-rose-500/70 font-bold mt-1 px-4">{journalError}</p>
            </div>
          ) : (
             <>
                {journalMetrics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-900/60 border border-indigo-500/20 p-4 rounded-2xl shadow-lg backdrop-blur-md mb-6">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Total Trades</span>
                <span className="text-xl font-black text-white">{journalMetrics.trades || 0}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Win Rate</span>
                <span className="text-xl font-black text-emerald-400">{journalMetrics.wonTradesPercent ? Math.round(journalMetrics.wonTradesPercent) : 0}%</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Won / Lost</span>
                <span className="text-xl font-black text-white">
                  <span className="text-emerald-400">{journalMetrics.wonTrades || 0}</span>
                  <span className="text-slate-600 mx-2">/</span>
                  <span className="text-rose-400">{journalMetrics.lostTrades || 0}</span>
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Net Profit</span>
                <span className={`text-xl font-black ${(journalMetrics.profit ?? journalMetrics.gain) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {(journalMetrics.profit ?? journalMetrics.gain) >= 0 ? '+' : ''}{formatCurrency((journalMetrics.profit ?? journalMetrics.gain) || 0, displayCurrency)}
                </span>
              </div>
            </div>
          )}

          {tradesByDay.length > 0 ? (
            <div className="space-y-6">
              {tradesByDay.map(day => (
              <div key={day.date} className="bg-slate-900/40 border border-white/5 p-6 rounded-[24px] shadow-lg backdrop-blur-md">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 pb-4 border-b border-white/5">
                  <h3 className="text-lg font-black text-white uppercase tracking-tight">{day.date}</h3>
                  <div className="flex items-center gap-4 mt-2 sm:mt-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Profit</span>
                      <span className={`font-black tracking-tight ${day.totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {day.totalProfit >= 0 ? '+' : ''}{formatCurrency(day.totalProfit, displayCurrency)}
                      </span>
                    </div>
                    <div className="w-1 h-1 rounded-full bg-slate-700"></div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span className="text-xs font-bold text-emerald-400">{day.won} Won ({day.wonPercent}%)</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                        <span className="text-xs font-bold text-rose-400">{day.lost} Lost ({day.lostPercent}%)</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {day.trades.map((trade: any) => (
                    <div key={trade._id} className="bg-slate-800/40 border border-white/5 p-4 rounded-xl hover:bg-slate-800 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-black text-white">{trade.symbol}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest ${trade.type?.includes('BUY') || trade.type?.toLowerCase() === 'buy' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                            {trade.type ? trade.type.replace('POSITION_TYPE_', '').replace('ORDER_TYPE_', '') : 'TRADE'}
                          </span>
                        </div>
                      <div className={`text-base font-black tracking-tight mb-3 ${((typeof trade.profit === 'number' ? trade.profit : trade.gain) || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {((typeof trade.profit === 'number' ? trade.profit : trade.gain) || 0) >= 0 ? '+' : ''}{formatCurrency(((typeof trade.profit === 'number' ? trade.profit : trade.gain) || 0), displayCurrency)}
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                          <span>Open</span>
                          <span>{new Date(trade.openTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                          <span>Close</span>
                          <span>{new Date(trade.closeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            </div>
          ) : (
            <div className="bg-slate-900/40 border border-white/5 p-8 rounded-[24px] shadow-lg text-center">
              <History className="w-10 h-10 text-slate-700 mx-auto mb-3" />
              <h3 className="text-lg font-black text-slate-400 uppercase tracking-tight">No Recent Trades</h3>
              <p className="text-xs text-slate-500 font-bold mt-1">There are no closed trades in the past 90 days.</p>
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
    blue: 'text-blue-400 bg-blue-400/10',
    indigo: 'text-indigo-400 bg-indigo-400/10',
    emerald: 'text-emerald-400 bg-emerald-400/10',
    amber: 'text-amber-400 bg-amber-400/10',
  };
  return (
    <div className="bg-slate-900/40 border border-white/5 p-6 sm:p-8 rounded-[30px] sm:rounded-[40px] shadow-2xl backdrop-blur-md flex flex-row sm:flex-col items-center sm:items-start justify-between sm:justify-start gap-4 sm:gap-0">
      <div className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl w-fit sm:mb-6 shrink-0 ${colors[color]}`}>
        <Icon className="w-5 h-5 sm:w-6 h-6" />
      </div>
      <div className="flex-1 text-right sm:text-left">
        <p className="text-[10px] sm:text-xs font-black text-slate-500 uppercase tracking-widest mb-1">{label}</p>
        <h4 className="text-xl sm:text-2xl font-black text-white tracking-tighter truncate">{value}</h4>
      </div>
    </div>
  );
};

export default Dashboard;
