import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Activity, Clock, RefreshCw, TrendingUp, TrendingDown, AlertCircle, Play, X, Zap, Shield, Layers, History, Settings, Square, Workflow, Lock } from 'lucide-react';
import { TradingAccount } from '../types';
import CandlestickChart from './CandlestickChart';
import { connectionManager } from '../src/lib/ConnectionManager';
import { safeFetch } from '../src/lib/utils';
import { useStore } from '../src/store';

interface MarketDataProps {
  accounts: TradingAccount[];
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
  symbol: string;
  setSymbol: (s: string) => void;
  timeframe: string;
  setTimeframe: (t: string) => void;
  addLog: (msg: string) => void;
  availableBrokerSymbols: string[];
  lotSize: number;
  setLotSize: (val: number) => void;
  onBuy: () => Promise<void>;
  onSell: () => Promise<void>;
  onToggleAlgo: () => Promise<void>;
  isAlgoRunning: boolean;
  tradeStatus: 'idle' | 'executing' | 'success' | 'error';
  connectionStatus: string;
  executionMode: 'EA' | 'STRATEGY';
  eaStatus?: { deployed: boolean; status: string };
  onSwitchMode: (mode: 'EA' | 'STRATEGY') => void;
  onDeploy: () => Promise<void>;
  onUndeploy: () => Promise<void>;
  setActiveTab: (tab: string) => void;
  token?: string;
}

const getTimeframeMinutes = (tf: string): number => {
  const match = tf.match(/(\d+)([mhd])/);
  if (!match) return 1;
  const num = parseInt(match[1]);
  const unit = match[2];
  switch(unit) {
    case 'm': return num;
    case 'h': return num * 60;
    case 'd': return num * 1440;
    default: return 1;
  }
};

const alignToTimeframe = (timestamp: string | number, timeframeMinutes: number) => {
  const t = new Date(timestamp).getTime();
  const ms = timeframeMinutes * 60 * 1000;
  return Math.floor(t / ms) * ms;
};

const getCandleKey = (brokerTime: string, timeframeMin: number) => {
  const t = new Date(brokerTime).getTime();
  const tf = timeframeMin * 60 * 1000;
  return Math.floor(t / tf) * tf;
};

const MarketData: React.FC<MarketDataProps> = ({ 
  accounts, 
  selectedAccountId,
  setSelectedAccountId,
  symbol,
  setSymbol,
  timeframe,
  setTimeframe,
  addLog,
  availableBrokerSymbols,
  lotSize,
  setLotSize,
  onBuy,
  onSell,
  onToggleAlgo,
  isAlgoRunning,
  tradeStatus,
  connectionStatus,
  executionMode,
  eaStatus,
  onSwitchMode,
  onDeploy,
  onUndeploy,
  setActiveTab,
  token
}) => {
  const candles = useStore(state => state.candles);
  const setCandles = useStore(state => state.setCandles);
  const addCandle = useStore(state => state.addCandle);
  const chartData = candles || [];
  
  const globalPositions = useStore(state => state.positions);
  const globalHistory = useStore(state => state.history);
  const setHistory = useStore(state => state.setHistory);
  const setPositions = useStore(state => state.setPositions);
  
  const [latestTick, setLatestTick] = useState<any>(null);
  const [deals, setDeals] = useState<any[]>([]);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isSymbolsLoading, setIsSymbolsLoading] = useState(false);
  
  const chartSettings = useStore(state => state.chartSettings);
  const marketAnalysis = useStore(state => state.marketAnalysis);
  const [showAnalysis, setShowAnalysis] = useState(true);
  
  const systemStatus = connectionStatus; // Use prop from App.tsx instead of internal WS-bound state

  const selectedAccount = useMemo(() => accounts.find(a => a.id === selectedAccountId), [accounts, selectedAccountId]);

  useEffect(() => {
    if (!selectedAccountId) return;
    
    // Fetch initial snapshot of positions
    safeFetch(`/api/account/${selectedAccountId}/positions`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(data => {
        if (Array.isArray(data)) {
          setPositions(data);
        }
      })
      .catch(err => console.error("Failed to fetch positions:", err));
  }, [selectedAccountId]);

  useEffect(() => {
    // Clear intent on unmount
    return () => {
      connectionManager.clearStreamIntent(selectedAccountId);
    };
  }, [selectedAccountId]);

  useEffect(() => {
    // Sync logic removed in favor of direct prop usage
  }, []);

  useEffect(() => {
    if (systemStatus === 'CONNECTED') {
        addLog(`BROKER: System reconnected. Synchronizing SDK snapshots...`);
    }
  }, [systemStatus, addLog]);

  // Synchronize internal symbols state with global available list
  useEffect(() => {
    if (availableBrokerSymbols.length > 0) {
      addLog(`DATA: ${availableBrokerSymbols.length} synced symbols available for charting.`);
    }
  }, [availableBrokerSymbols, addLog]);

  const accountsRef = useRef(accounts);
  const addLogRef = useRef(addLog);
  const activeStreamRef = useRef<string>('');

  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);

  useEffect(() => {
    addLogRef.current = addLog;
  }, [addLog]);

  useEffect(() => {
    if (!selectedAccountId || !symbol || !timeframe) return;
    
    // 1. Assert desired state to central authority
    connectionManager.setStreamIntent(selectedAccountId, symbol, timeframe);

    let isMounted = true;
    
    // 2. Subscribe to the global data tunnel
    const unsub = connectionManager.subscribe((data: any) => {
      if (!isMounted) return;
      
      if (data.type === 'HISTORY_SNAPSHOT' && data.symbol === symbol) {
          const validHistory = data.candles.filter((c: any) => c.open !== undefined && c.close !== undefined);
          setCandles(validHistory);
          addLog(`STREAM_ENGINE: Hydrated ${validHistory.length} historical candles from snapshot.`);
      } else if (data.type === 'CANDLE' && data.symbol === symbol) {
        const inc = data.candle;
        const tfM = getTimeframeMinutes(timeframe);
        const alignedIncomingTime = alignToTimeframe(inc.time, tfM);
        
        const alignedCandle = { ...inc, time: new Date(alignedIncomingTime).toISOString() };
        addCandle(alignedCandle);
        
      } else if (data.type === 'price:update' && data.symbol === symbol) {
        const bid = Number(data.bid);
        setLatestTick({ bid, ask: Number(data.ask) });

        // Update the current candle dynamically
        setCandles(useStore.getState().candles.map((c, i, arr) => {
          if (i === arr.length - 1) {
             return {
               ...c,
               close: bid,
               high: Math.max(c.high, bid),
               low: Math.min(c.low, bid),
             };
          }
          return c;
        }));
      } else if (data.type === 'POSITIONS_SNAPSHOT' && data.accountId === selectedAccountId) {
        setPositions(data.data || []);
      } else if (data.type === 'POSITION_UPDATE' && data.accountId === selectedAccountId) {
        const current = useStore.getState().positions;
        const index = current.findIndex(p => p.id === data.data.id);
        const next = [...current];
        if (index >= 0) {
          next[index] = data.data;
        } else {
          next.push(data.data);
        }
        setPositions(next);
      } else if (data.type === 'POSITION_REMOVED' && data.accountId === selectedAccountId) {
        const current = useStore.getState().positions;
        setPositions(current.filter(p => p.id !== data.data.id));
      } else if (data.type === 'HISTORY_ORDER_ADDED' && data.accountId === selectedAccountId) {
        // Initial fetch handled by App.tsx syncing to globalHistory usually, 
        // but here we can update a local history state if we want, or just let globalHistory handle it.
        // The current MarketData UI uses globalHistory (line 91).
        // Let's update globalHistory via store if we want, or just fetch again.
        useStore.getState().setHistory([data.data, ...useStore.getState().history].slice(0, 50));
      } else if (data.type === 'trade:update' && data.symbol === symbol) {
        const tfM = getTimeframeMinutes(timeframe);
        if (data.updateType === 'DEAL') {
          setDeals(prev => {
            const alignedTime = getCandleKey(data.time, tfM);
            const dealObj = { ...data, type: data.tradeType, time: alignedTime };
            const arr = [...prev, dealObj];
            // Deduplicate deals 
            return arr.filter((d, i, self) => 
               i === self.findIndex(t => t.time === d.time && t.volume === d.volume && t.price === d.price)
            ).slice(-100);
          });
        } else if (data.updateType === 'POSITION') {
          const current = useStore.getState().positions;
          const posObj = { 
            ...data, 
            type: data.tradeType, 
            openPrice: data.price,
            stopLoss: data.stopLoss,
            takeProfit: data.takeProfit,
            magicNumber: data.magicNumber || data.magic // Support both MetaApi variants
          };
          const map = new Map(current.map(p => [p.positionId, p]));
          map.set(data.positionId, posObj);
          setPositions(Array.from(map.values()));
        }
      }
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, [selectedAccountId, symbol, timeframe, addLog]);

  const [localSymbol, setLocalSymbol] = useState(symbol);

  useEffect(() => {
    setLocalSymbol(symbol);
  }, [symbol]);

  useEffect(() => {
    if (localSymbol === symbol) return;
    
    // VALIDATION: Only propagate to global state if symbol is officially supported by broker
    // This prevents the SDK from attempting to subscribe to partial strings like "XAU" while typing "XAUUSDm"
    if (!availableBrokerSymbols.includes(localSymbol)) return;

    const timer = setTimeout(() => {
      setSymbol(localSymbol);
      addLog(`DATA: Switching analysis context to ${localSymbol}...`);
    }, 500);
    return () => clearTimeout(timer);
  }, [localSymbol, symbol, setSymbol, availableBrokerSymbols, addLog]);

  const displayData = useMemo(() => {
    if (chartData.length === 0) return null;
    const last = chartData[chartData.length - 1];
    return {
      time: new Date(last.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      open: last.open,
      high: last.high,
      low: last.low,
      close: last.close,
      spread: last.spread
    };
  }, [chartData]);

  const timeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

  // Helper to determine spread in points from tick data based on typical broker formatting if tick spread isn't explicitly available
  const getTickSpread = (bid?: number, ask?: number) => {
    if (bid === undefined || ask === undefined) return '-';
    // Dynamically calculate the multiplier based on the asset class (approximated by price level)
    // For Forex (e.g. 1.0500), 1 point = 0.00001 (mutiplier 100000)
    // For Gold/Crypto, often multiplied by 100 or 1000. We'll use the user's specific request logic:
    // "spread: (tick.ask - tick.bid) * 10000" but adapted generically based on decimals
    const getDecimals = (n: number) => {
        const str = n.toString();
        if (str.includes('.')) return str.split('.')[1].length;
        return 0;
    };
    const decimals = Math.max(getDecimals(bid), getDecimals(ask));
    const pointMultiplier = Math.pow(10, decimals);
    
    return ((ask - bid) * pointMultiplier).toFixed(0);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-2">
        <div className="flex flex-wrap items-center gap-3 w-full justify-between sm:justify-start">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Account</span>
            <select 
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none min-w-[150px]"
            >
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.login} ({acc.platform})</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Symbol</span>
            <div className="relative">
              <div className={`flex bg-slate-800 border border-slate-700 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 group ${isAlgoRunning ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <input 
                  type="text"
                  list="broker-symbols"
                  value={localSymbol}
                  disabled={isAlgoRunning}
                  onChange={(e) => setLocalSymbol(e.target.value)}
                  className={`bg-transparent text-white text-sm px-4 py-2 outline-none w-[120px] font-bold tracking-tight ${(availableBrokerSymbols.length > 0 && !availableBrokerSymbols.includes(localSymbol)) ? 'text-amber-400' : ''} ${isAlgoRunning ? 'cursor-not-allowed' : ''}`}
                  placeholder="XAUUSDm"
                />
                <datalist id="broker-symbols" className="bg-slate-900">
                  {availableBrokerSymbols.map(s => <option key={s} value={s} />)}
                </datalist>
                <div className="bg-slate-700/50 px-2 flex items-center border-l border-slate-700">
                  <Activity className={`w-3 h-3 ${availableBrokerSymbols.includes(symbol) ? 'text-emerald-500' : 'text-slate-500'}`} />
                </div>
              </div>
              {isAlgoRunning && (
                <div className="absolute -bottom-4 left-1 flex items-center gap-1 text-[8px] font-black text-rose-500 uppercase tracking-widest animate-pulse">
                  <Lock className="w-2 h-2" /> Locked during active strategy
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Interval</span>
            <div className={`flex bg-slate-800 rounded-xl p-1 border border-slate-700 ${isAlgoRunning ? 'opacity-50 cursor-not-allowed' : ''}`}>
              {timeframes.map(tf => (
                <button
                  key={tf}
                  disabled={isAlgoRunning}
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                    timeframe === tf 
                      ? 'bg-indigo-500 text-white shadow-md' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  } ${isAlgoRunning ? 'cursor-not-allowed' : ''}`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
        <div className="lg:col-span-2 space-y-8">
          <div className="p-2 min-h-[500px] flex flex-col relative w-full">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-white">{symbol}</h3>
                <span className="px-2 py-1 bg-slate-800 rounded text-xs font-medium text-slate-300 border border-slate-700">
                  {timeframe}
                </span>
                {isSubscribing && <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin" />}
              </div>
              <button
                onClick={() => setShowAnalysis(!showAnalysis)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  showAnalysis 
                    ? 'bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]' 
                    : 'bg-slate-800 text-slate-400 border border-white/5 hover:text-white'
                }`}
              >
                <Zap className={`w-3.5 h-3.5 ${showAnalysis ? 'fill-white' : ''}`} />
                {showAnalysis ? 'Analysis ON' : 'Show Analysis'}
              </button>
            </div>

          <div className="flex-1 w-full relative min-h-[450px] lg:min-h-[550px]">
            {/* Background Symbol Text */}
            <div className="absolute inset-0 flex flex-col pt-4 pl-4 md:pt-10 md:pl-10 pointer-events-none opacity-[0.03] z-0 select-none overflow-hidden">
              <span className="text-7xl md:text-[12rem] font-black text-white leading-none tracking-tighter uppercase">{symbol}</span>
              <span className="text-4xl md:text-8xl font-black text-indigo-400 mt-[-10px] md:mt-[-30px] uppercase tracking-widest">{timeframe}</span>
            </div>
            {(!chartData) ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-indigo-400 z-10">
                <RefreshCw className="w-10 h-10 animate-spin mb-4" />
                <p>Initializing Chart...</p>
              </div>
            ) : chartData.length > 0 ? (
              <div className="absolute inset-0 z-10">
                <CandlestickChart 
                  data={chartData} 
                  latestTick={latestTick} 
                  height={500} 
                  deals={deals} 
                  positions={globalPositions}
                  executionMode={executionMode}
                  marketAnalysis={marketAnalysis}
                  showAnalysis={showAnalysis}
                  upColor={chartSettings.upColor}
                  downColor={chartSettings.downColor}
                  bgImageUrl={chartSettings.bgImageUrl}
                />
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                <Activity className="w-12 h-12 mb-4 opacity-20" />
                <p>Waiting for market data stream...</p>
                <p className="text-xs mt-2 opacity-60">Ensure the selected terminal is SYNCED</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-6 lg:mt-0 mt-8">
          {/* TRADING TERMINAL PANEL */}
          <div className="p-2 mb-10">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-sm font-black text-white/90 flex items-center gap-2 uppercase tracking-[0.2em]">
                <Workflow className="w-4 h-4 text-indigo-400" />
                Strategy Engine
              </h3>
              <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded-lg border border-white/5">
                <div className={`w-1.5 h-1.5 rounded-full ${connectionStatus === 'READY' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                <span className="text-[9px] font-black text-slate-400 uppercase">{connectionStatus}</span>
              </div>
            </div>

            <div className="space-y-6">
              {/* Strategy Settings */}
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-4 animate-in slide-in-from-top-4 duration-500">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Execution Engine</span>
                  <button onClick={() => setActiveTab('settings')} className="text-[9px] font-black text-slate-500 hover:text-white uppercase">Engine Specs</button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Lot Size</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      value={lotSize} 
                      onChange={(e) => setLotSize(parseFloat(e.target.value))}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-indigo-500/50" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Asset</label>
                    <input 
                      type="text" 
                      value={symbol} 
                      readOnly
                      className="w-full bg-black/20 border border-white/5 rounded-lg px-3 py-1.5 text-xs text-slate-400 outline-none" 
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 animate-in fade-in zoom-in duration-300">
                <button
                  onClick={onBuy}
                  disabled={(connectionStatus !== 'READY' && connectionStatus !== 'SYNCING') || tradeStatus === 'executing'}
                  className={`group relative flex flex-col items-center justify-center gap-1 py-2.5 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl transition-all ${(connectionStatus === 'READY' || connectionStatus === 'SYNCING') ? 'hover:bg-emerald-600/10 active:scale-95' : 'opacity-40 grayscale'} overflow-hidden cursor-pointer`}
                >
                  <div className="absolute top-0 left-0 w-full h-0.5 bg-emerald-500/30" />
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span className="text-base font-black text-white">FORCE BUY</span>
                </button>

                <button
                  onClick={onSell}
                  disabled={(connectionStatus !== 'READY' && connectionStatus !== 'SYNCING') || tradeStatus === 'executing'}
                  className={`group relative flex flex-col items-center justify-center gap-1 py-2.5 bg-rose-500/5 border border-rose-500/10 rounded-2xl transition-all ${(connectionStatus === 'READY' || connectionStatus === 'SYNCING') ? 'hover:bg-rose-600/10 active:scale-95' : 'opacity-40 grayscale'} overflow-hidden cursor-pointer`}
                >
                  <div className="absolute top-0 left-0 w-full h-0.5 bg-rose-500/30" />
                  <TrendingDown className="w-4 h-4 text-rose-400" />
                  <span className="text-base font-black text-white">FORCE SELL</span>
                </button>
              </div>

              {/* Main Execution Toggle (Green Triangle / Red Stop) */}
              <button
                onClick={onToggleAlgo}
                disabled={(connectionStatus !== 'READY' && connectionStatus !== 'SYNCING') || tradeStatus === 'executing'}
                className={`w-full flex items-center justify-center gap-3 py-5 rounded-2xl border transition-all ${
                  isAlgoRunning 
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-500 hover:bg-rose-500/20 shadow-[0_0_20px_rgba(244,63,94,0.1)]' 
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]'
                } ${((connectionStatus !== 'READY' && connectionStatus !== 'SYNCING') || tradeStatus === 'executing') ? 'opacity-40 grayscale cursor-not-allowed' : 'active:scale-95'}`}
              >
                {isAlgoRunning ? (
                  <>
                    <Square className="w-5 h-5 fill-rose-500/50" />
                    <span className="text-sm font-black uppercase tracking-widest">
                      STOP
                    </span>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-emerald-400/50 ml-1" />
                    <span className="text-sm font-black uppercase tracking-widest">
                      START
                    </span>
                  </>
                )}
              </button>

              <div className="grid grid-cols-1 gap-2 mt-4">
                <button 
                  onClick={() => setActiveTab('accounts')}
                  className="flex items-center justify-center gap-2 py-3 bg-white/5 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-white hover:bg-white/10 transition-all border border-transparent"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Terminal Console
                </button>
              </div>

              {tradeStatus === 'executing' && (
                <div className="flex items-center justify-center gap-2 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl animate-pulse mt-4">
                  <RefreshCw className="w-3 h-3 text-amber-500 animate-spin" />
                  <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Transmitting Execution...</span>
                </div>
              )}
              {tradeStatus === 'success' && (
                <div className="flex items-center justify-center gap-2 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl mt-4">
                  <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">✅ Order Executed</span>
                </div>
              )}
            </div>
          </div>

          <div className="p-2">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="w-4 h-4 text-indigo-400" />
              <h4 className="text-sm font-black text-white tracking-widest">Open Positions</h4>
            </div>
            <div className="space-y-3">
              {globalPositions.length === 0 ? (
                <p className="text-sm text-slate-600 text-center py-8">No active positions</p>
              ) : (
                globalPositions.map((pos: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-white">{pos.symbol}</p>
                        <span className="text-[8px] font-black px-1 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded uppercase">{pos.comment || 'Engine'}</span>
                      </div>
                      <p className={`text-[10px] font-black uppercase ${pos.type === 'POSITION_TYPE_BUY' ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {pos.type ? pos.type.replace('POSITION_TYPE_', '') : 'UNKNOWN'} {pos.volume}
                      </p>
                    </div>
                    <div className={`text-sm font-mono ${pos.unrealizedProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {pos.unrealizedProfit >= 0 ? '+' : ''}{pos.unrealizedProfit ? pos.unrealizedProfit.toFixed(2) : '0.00'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="p-2 mt-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-400" />
                <h4 className="text-sm font-black text-white tracking-widest">Recent History</h4>
              </div>
              {globalHistory.length > 0 && (
                <button 
                  onClick={() => setHistory([])}
                  className="text-[10px] font-black text-rose-500 hover:text-rose-400 uppercase tracking-widest transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="space-y-3">
              {globalHistory.length === 0 ? (
                <p className="text-sm text-slate-600 text-center py-8">No recent history</p>
              ) : (
                globalHistory.map((order: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                    <div>
                      <p className="text-sm font-bold text-white">{order.symbol}</p>
                      <p className="text-[10px] text-slate-500">{new Date(order.time).toLocaleTimeString()}</p>
                    </div>
                    <div className={`text-sm font-mono ${order.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {order.profit >= 0 ? '+' : ''}{order.profit?.toFixed(2) || '0.00'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketData;
