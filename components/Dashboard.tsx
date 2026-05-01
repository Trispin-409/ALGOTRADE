
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
  tradeStatus
}) => {
  const [stats, setStats] = useState<MetaStats | null>(null);
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const positions = useStore(state => state.positions);
  const history = useStore(state => state.history);
  const setPositions = useStore(state => state.setPositions);
  const setHistory = useStore(state => state.setHistory);

  const [isSynced, setIsSynced] = useState(tradeStatus === 'READY');

  useEffect(() => {
    if (tradeStatus === 'READY') {
      setIsSynced(true);
    }
  }, [tradeStatus]);

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
    accounts.filter(a => a.connectionStatus === 'CONNECTED' || a.connectionStatus === 'connected').length
  , [accounts]);
  
  // Choose the first connected account for displaying stats/positions
  const subscriberAccount = accounts.find(a => a.connectionStatus === 'CONNECTED' || a.connectionStatus === 'connected') || accounts[0];

  const fetchStats = useCallback(async () => {
    if (!subscriberAccount || (subscriberAccount.connectionStatus !== 'CONNECTED' && subscriberAccount.connectionStatus !== 'connected')) {
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
      setTimeout(() => setIsRefreshing(false), 2000);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full overflow-x-hidden">
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
