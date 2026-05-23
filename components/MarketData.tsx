import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { Activity, Clock, RefreshCw, TrendingUp, TrendingDown, AlertCircle, Play, X, Zap, Shield, Layers, History, Settings, Square, Workflow, Lock } from 'lucide-react';
import { TradingAccount } from '../types';
const CandlestickChart = lazy(() => import('./CandlestickChart'));
import { connectionManager, TradingPhase } from '../src/lib/ConnectionManager';
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
  onDeploy: () => Promise<void>;
  onUndeploy: () => Promise<void>;
  setActiveTab: (tab: string) => void;
  token?: string;
  isLoading: boolean;
}

const isSymbolMatch = (s1?: any, s2?: any): boolean => {
  if (!s1 || !s2) return false;
  const str1 = typeof s1 === 'string' ? s1 : String(s1);
  const str2 = typeof s2 === 'string' ? s2 : String(s2);
  const n1 = str1.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const n2 = str2.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return n1 === n2 || n1.startsWith(n2) || n2.startsWith(n1);
};

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
        onDeploy,
  onUndeploy,
  setActiveTab,
  token,
  isLoading
}) => {
  const candles = useStore(state => state.candles);
  const setCandles = useStore(state => state.setCandles);
  const addCandle = useStore(state => state.addCandle);
  const chartData = candles || [];
  const historyReady = chartData.length >= 100;
  
  const globalPositions = useStore(state => state.positions);
  const globalHistory = useStore(state => state.history);
  const setHistory = useStore(state => state.setHistory);
  const setPositions = useStore(state => state.setPositions);
  const currentUserEmail = useStore(state => state.currentUserEmail);
  
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
    
    // Seed instantly from email-isolated cache to prevent flicker/gap
    if (currentUserEmail) {
      try {
        const cached = localStorage.getItem(`positions:${currentUserEmail}:${selectedAccountId}`);
        if (cached) {
          setPositions(JSON.parse(cached));
        }
      } catch (e) {
        console.warn("Could not retrieve cached positions", e);
      }
    }
    
    // Fetch initial snapshot of positions
    safeFetch(`/api/account/${selectedAccountId}/positions`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(data => {
        if (Array.isArray(data)) {
          setPositions(data);
          if (currentUserEmail) {
            localStorage.setItem(`positions:${currentUserEmail}:${selectedAccountId}`, JSON.stringify(data));
          }
        }
      })
      .catch(err => console.error("Failed to fetch positions:", err));
  }, [selectedAccountId, currentUserEmail, token]);

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
    // Clear/load from cache of previous broker data to achieve instant chart loading
    let loadedFromCache = false;
    if (currentUserEmail && selectedAccountId && symbol && timeframe) {
      const cacheKey = `candles:${currentUserEmail}:${selectedAccountId}:${symbol}:${timeframe}`;
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCandles(parsed);
            loadedFromCache = true;
            console.log(`[CANDLES_CACHE] Instantly loaded ${parsed.length} cached candles from memory for ${symbol} (${timeframe})`);
          }
        }
      } catch (e) {
        console.warn("Failed to load cached candles", e);
      }
    }
    
    if (!loadedFromCache) {
      setCandles([]);
    }
    setLatestTick(null);
    setDeals([]);
  }, [selectedAccountId, symbol, timeframe, currentUserEmail]);

  useEffect(() => {
    if (!selectedAccountId || !symbol || !timeframe) return;
    
    const phaseCheck = setInterval(() => {
      // Allow initiation if we are at phase BROKER_CONNECTED or higher
      // Since BROKER_CONNECTED is phase 3, and STREAMING is phase 6.
      // Based on object keys:
      // INIT: 0
      // CONNECTING_META: 1
      // META_CONNECTED: 2
      // BROKER_CONNECTED: 3
      // ...
      
      if (connectionManager.currentPhase === TradingPhase.META_CONNECTED ||
          connectionManager.currentPhase === TradingPhase.BROKER_CONNECTED || 
          connectionManager.currentPhase === TradingPhase.ACCOUNT_SYNCING ||
          connectionManager.currentPhase === TradingPhase.ACCOUNT_READY ||
          connectionManager.currentPhase === TradingPhase.STREAMING) {
        
        console.log(`[DEBUG] Phase check passed (${connectionManager.currentPhase}), setting intent.`);
        connectionManager.setStreamIntent(selectedAccountId, symbol, timeframe);
        
        // Explicitly subscribe again just in case the intent alone isn't enough
        // This is a safety measure
        connectionManager.send(selectedAccountId, {
            type: 'STREAM_SUBSCRIBE',
            accountId: selectedAccountId,
            symbol,
            timeframe
        }, true);
        
        clearInterval(phaseCheck);
      }
    }, 1000);
    
    // 2. Subscribe to the global data tunnel
    const unsub = connectionManager.subscribe((data: any) => {
      console.log("[DEBUG_REC_DATA]", data.type, data.symbol); 
      if (data.type === 'HISTORY_SNAPSHOT' && isSymbolMatch(data.symbol, symbol)) {
          const validHistory = data.candles.filter((c: any) => c && c.time && c.open !== undefined && c.close !== undefined);
          setCandles(validHistory);
          addLog(`[CHART_SEEDED] ${validHistory.length} historical candles from snapshot.`);
          console.log("[CHART_SEEDED]", validHistory.length);
          
          if (currentUserEmail && selectedAccountId && symbol && timeframe) {
            const cacheKey = `candles:${currentUserEmail}:${selectedAccountId}:${symbol}:${timeframe}`;
            try {
              localStorage.setItem(cacheKey, JSON.stringify(validHistory));
            } catch (e) {
              console.warn("Failed to write snapshot cache", e);
            }
          }
      } else if (data.type === 'CANDLE' && isSymbolMatch(data.symbol, symbol)) {
        if (!data.candle || !data.candle.time) return;
        console.log("[DEBUG_REC_CANDLE]", data);
        const inc = data.candle;
        const tfM = getTimeframeMinutes(timeframe);
        const alignedIncomingTime = alignToTimeframe(inc.time, tfM);
        
        const alignedCandle = { ...inc, time: new Date(alignedIncomingTime).toISOString() };
        
        setCandles(prev => {
          const next = [...prev];
          const last = next[next.length - 1];

          if (last && last.time && new Date(last.time).getTime() === new Date(alignedCandle.time).getTime()) {
            next[next.length - 1] = alignedCandle;
          } else {
            next.push(alignedCandle);
            if (next.length > 300) next.shift();
          }

          if (currentUserEmail && selectedAccountId && symbol && timeframe) {
            const cacheKey = `candles:${currentUserEmail}:${selectedAccountId}:${symbol}:${timeframe}`;
            try {
              localStorage.setItem(cacheKey, JSON.stringify(next));
            } catch (e) {
              console.warn("Failed to write live candle update to cache", e);
            }
          }

          return next;
        });
        
      } else if (data.type === 'price:update' && isSymbolMatch(data.symbol, symbol)) {
        console.log("[DEBUG_REC_PRICE]", data);
        const bid = Number(data.bid);
        const ask = Number(data.ask);
        const price = bid || ask;
        
        setLatestTick({ bid, ask });
        console.log("[LIVE_TICK]", price);

        setCandles(prev => {
           if (prev.length === 0) return prev;
           const next = [...prev];
           const last = { ...next[next.length - 1] };
           last.close = price;
           last.high = Math.max(last.high, price);
           last.low = Math.min(last.low, price);
           next[next.length - 1] = last;

           if (currentUserEmail && selectedAccountId && symbol && timeframe) {
             const cacheKey = `candles:${currentUserEmail}:${selectedAccountId}:${symbol}:${timeframe}`;
             try {
               localStorage.setItem(cacheKey, JSON.stringify(next));
             } catch (e) {
               console.warn("Failed to write price update cache", e);
             }
           }

           return next;
        });
      }
    });

    return () => {
      clearInterval(phaseCheck);
      unsub();
    };
  }, [selectedAccountId, symbol, timeframe, addLog]);

  useEffect(() => {
    console.log("[MARKET_STATE]", candles.length);
  }, [candles]);

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
    if (!last) return null;
    return {
      time: last.time ? new Date(last.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-',
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
    <div className="space-y-4">
      {/* SYMBOL MISMATCH ALERT (Global Context Guard) */}
      {!isLoading && availableBrokerSymbols.length > 0 && symbol && !availableBrokerSymbols.includes(symbol) && (
        <div className="mx-2 bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl flex items-center gap-3 animate-pulse">
           <Zap className="w-4 h-4 text-amber-500" />
           <div className="flex-1">
             <p className="text-[10px] font-mono font-bold text-amber-200 uppercase tracking-tighter">Symbol Conflict Detected</p>
             <p className="text-[9px] font-mono text-amber-400/80 uppercase font-medium leading-relaxed">
               "{symbol}" is not recognized by your broker.
             </p>
           </div>
        </div>
      )}

      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-2 p-2">
        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-2 w-full justify-between sm:justify-start">
          <div className="flex flex-col gap-0.5 w-full sm:w-auto">
            <span className="text-[9px] font-mono font-black text-slate-500 uppercase tracking-widest ml-1">Terminal</span>
            <select 
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="bg-black/40 border border-white/10 text-white text-xs font-mono rounded-lg px-3 py-1.5 focus:border-white outline-none min-w-[150px] w-full sm:w-auto transition-colors appearance-none"
            >
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.login} ({acc.platform})</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-0.5 w-full sm:w-auto">
            <span className="text-[9px] font-mono font-black text-slate-500 uppercase tracking-widest ml-1">Asset</span>
            <div className="relative w-full sm:w-auto">
              <div className={`flex bg-black/40 border border-white/10 rounded-lg overflow-hidden focus-within:border-white group transition-colors ${isAlgoRunning ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <input 
                  type="text"
                  list="broker-symbols"
                  value={localSymbol}
                  disabled={isAlgoRunning}
                  onChange={(e) => setLocalSymbol(e.target.value)}
                  className={`bg-transparent text-white text-xs px-3 py-1.5 outline-none w-full sm:w-[120px] font-mono font-bold tracking-tight ${(availableBrokerSymbols.length > 0 && !availableBrokerSymbols.includes(localSymbol)) ? 'text-amber-400' : ''} ${isAlgoRunning ? 'cursor-not-allowed' : ''}`}
                  placeholder="XAUUSDm"
                />
                <datalist id="broker-symbols" className="bg-slate-900">
                  {availableBrokerSymbols.map(s => <option key={s} value={s} />)}
                </datalist>
                <div className="bg-white/5 px-2 flex items-center border-l border-white/10">
                  <Activity className={`w-3 h-3 ${availableBrokerSymbols.includes(symbol) ? 'text-emerald-500' : 'text-slate-600'}`} />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-0.5 w-full sm:w-auto">
            <span className="text-[9px] font-mono font-black text-slate-500 uppercase tracking-widest ml-1">Interval</span>
            <div className={`flex bg-black/40 rounded-lg p-0.5 border border-white/10 w-full sm:w-auto overflow-x-auto ${isAlgoRunning ? 'opacity-50 cursor-not-allowed' : ''} custom-scrollbar`}>
              {timeframes.map(tf => (
                <button
                  key={tf}
                  disabled={isAlgoRunning}
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1 text-[10px] font-mono font-bold rounded-md transition-all shrink-0 active:scale-95 ${
                    timeframe === tf 
                      ? 'text-white shadow-sm' 
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  } ${isAlgoRunning ? 'cursor-not-allowed' : ''}`}
                  style={timeframe === tf ? { backgroundColor: 'var(--accent-color)' } : {}}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
          
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="p-2 min-h-[400px] sm:min-h-[500px] flex flex-col relative w-full bg-black/20 border border-white/10 rounded-xl glowing-frame">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2 z-20">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-mono font-black text-white px-2 py-1 bg-black/40 rounded-md border border-white/10 uppercase">{symbol}</h3>
                <span className="px-2 py-1 bg-white/10 rounded-md text-[10px] font-mono font-bold border border-white/10" style={{ color: 'var(--accent-color)' }}>
                  {timeframe}
                </span>
                {isSubscribing && <RefreshCw className="w-3 h-3 animate-spin" style={{ color: 'var(--accent-color)' }} />}
              </div>
              <button
                onClick={() => setShowAnalysis(!showAnalysis)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-widest transition-all ${
                  showAnalysis 
                    ? 'bg-white/10 text-white border border-white/20' 
                    : 'bg-black/40 text-slate-500 border border-white/5 hover:text-white'
                }`}
                style={showAnalysis ? { borderColor: 'var(--accent-color)' } : {}}
              >
                <Zap className={`w-3 h-3 ${showAnalysis ? 'accent-glow' : ''}`} style={showAnalysis ? { color: 'var(--accent-color)' } : {}} />
                {showAnalysis ? 'Analysis ON' : 'Analysis OFF'}
              </button>
            </div>

          <div className="flex-1 w-full relative min-h-[500px]">
            {/* Background Symbol Text */}
            <div className="absolute inset-0 flex flex-col pt-4 pl-4 md:pt-10 md:pl-10 pointer-events-none opacity-[0.02] z-0 select-none overflow-hidden">
              <span className="text-6xl md:text-[10rem] font-black text-white leading-none tracking-tighter uppercase">{symbol}</span>
              <span className="text-3xl md:text-6xl font-black mt-[-10px] uppercase tracking-widest" style={{ color: 'var(--accent-color)' }}>{timeframe}</span>
            </div>
            
            <div className="w-full h-full min-h-[500px] relative">
              {(!candles || candles.length === 0) ? (
                <div className="flex items-center justify-center min-h-[500px] text-slate-500 font-mono text-xs">
                  Waiting for market data...
                </div>
              ) : (
                <Suspense fallback={<div className="h-[500px] flex items-center justify-center text-slate-500 font-mono text-xs">TRADING CHART LOADING...</div>}>
                  <CandlestickChart 
                    data={candles}
                    latestTick={latestTick} 
                    height={500} 
                    deals={deals} 
                    positions={globalPositions}
                    marketAnalysis={marketAnalysis}
                    showAnalysis={showAnalysis}
                    upColor={chartSettings.upColor}
                    downColor={chartSettings.downColor}
                    bgImageUrl={chartSettings.bgImageUrl}
                  />
                </Suspense>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 lg:mt-0 mt-6 lg:border-l border-white/5 lg:pl-6">
          {/* TRADING TERMINAL PANEL */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-mono font-black text-white/90 flex items-center gap-2 uppercase tracking-[0.2em]">
                <Workflow className="w-3.5 h-3.5" style={{ color: 'var(--accent-color)' }} />
                Engine
              </h3>
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-black/40 rounded border border-white/5">
                <div className={`w-1.5 h-1.5 rounded-full ${connectionStatus === 'READY' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                <span className="text-[9px] font-mono font-black text-slate-400 uppercase">{connectionStatus}</span>
              </div>
            </div>

            <div className="space-y-4">
              {/* Strategy Settings */}
              <div className="p-3 bg-black/40 rounded-xl border border-white/10 space-y-3 animate-in slide-in-from-top-4 duration-500 glowing-panel">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono font-black uppercase tracking-widest" style={{ color: 'var(--accent-color)' }}>Parameters</span>
                  <button onClick={() => setActiveTab('settings')} className="text-[8px] font-mono font-black text-slate-500 hover:text-white uppercase transition-colors shrink-0">Engine Setup</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[8px] font-mono font-bold text-slate-500 uppercase tracking-widest">Volume</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      value={lotSize} 
                      onChange={(e) => setLotSize(parseFloat(e.target.value))}
                      className="w-full bg-black/60 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] font-mono text-white outline-none focus:border-white transition-colors" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-mono font-bold text-slate-500 uppercase tracking-widest">Asset</label>
                    <input 
                      type="text" 
                      value={symbol} 
                      readOnly
                      className="w-full bg-black/20 border border-white/5 rounded-lg px-2 py-1.5 text-[10px] font-mono text-slate-400 outline-none" 
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 animate-in fade-in zoom-in duration-300">
                <button
                  onClick={onBuy}
                  disabled={(connectionStatus !== 'READY' && connectionStatus !== 'CONNECTED' && connectionStatus !== 'SYNCING') || tradeStatus === 'executing'}
                  className={`group relative flex flex-col items-center justify-center gap-1 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl transition-all ${(connectionStatus === 'READY' || connectionStatus === 'CONNECTED' || connectionStatus === 'SYNCING') ? 'hover:bg-emerald-500/20 active:scale-95' : 'opacity-40 grayscale'} overflow-hidden cursor-pointer`}
                >
                  <TrendingUp className="w-4 h-4 text-emerald-400 mb-1" />
                  <span className="text-xs font-mono font-black text-emerald-400 uppercase tracking-widest">BUY</span>
                </button>

                <button
                  onClick={onSell}
                  disabled={(connectionStatus !== 'READY' && connectionStatus !== 'CONNECTED' && connectionStatus !== 'SYNCING') || tradeStatus === 'executing'}
                  className={`group relative flex flex-col items-center justify-center gap-1 py-3 bg-rose-500/10 border border-rose-500/20 rounded-xl transition-all ${(connectionStatus === 'READY' || connectionStatus === 'CONNECTED' || connectionStatus === 'SYNCING') ? 'hover:bg-rose-500/20 active:scale-95' : 'opacity-40 grayscale'} overflow-hidden cursor-pointer`}
                >
                  <TrendingDown className="w-4 h-4 text-rose-400 mb-1" />
                  <span className="text-xs font-mono font-black text-rose-400 uppercase tracking-widest">SELL</span>
                </button>
              </div>

              {/* Main Execution Toggle */}
              <button
                onClick={onToggleAlgo}
                disabled={(connectionStatus !== 'READY' && connectionStatus !== 'CONNECTED' && connectionStatus !== 'SYNCING') || tradeStatus === 'executing'}
                className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl border transition-all active:scale-95 ${
                  isAlgoRunning 
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 hover:bg-rose-500/30' 
                    : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30'
                } ${((connectionStatus !== 'READY' && connectionStatus !== 'CONNECTED' && connectionStatus !== 'SYNCING') || tradeStatus === 'executing') ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
                style={isAlgoRunning ? { boxShadow: '0 0 15px rgba(244,63,94,0.15)' } : { boxShadow: '0 0 15px rgba(16,185,129,0.15)' }}
              >
                {isAlgoRunning ? (
                  <>
                    <Square className="w-4 h-4 fill-rose-500/50" />
                    <span className="text-[10px] font-mono font-black uppercase tracking-widest">
                      HALT ENGINE
                    </span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-emerald-500/50 ml-0.5" />
                    <span className="text-[10px] font-mono font-black uppercase tracking-widest">
                      START ENGINE
                    </span>
                  </>
                )}
              </button>

              {tradeStatus === 'executing' && (
                <div className="flex items-center justify-center gap-2 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg animate-pulse mt-2">
                  <RefreshCw className="w-3 h-3 text-amber-500 animate-spin" />
                  <span className="text-[9px] font-mono font-black text-amber-500 uppercase tracking-widest">Transmitting...</span>
                </div>
              )}
              {tradeStatus === 'success' && (
                <div className="flex items-center justify-center gap-2 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg mt-2">
                  <span className="text-[9px] font-mono font-black text-emerald-500 uppercase tracking-widest">✅ Broadcasted</span>
                </div>
              )}
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Layers className="w-3.5 h-3.5" style={{ color: 'var(--accent-color)' }} />
              <h4 className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-widest">Open Ops</h4>
            </div>
            <div className="space-y-2">
              {globalPositions.length === 0 ? (
                <p className="text-[10px] font-mono text-slate-600 text-center py-4 bg-black/20 rounded-lg">No active logic</p>
              ) : (
                globalPositions.map((pos: any, i: number) => {
                  const isBuy = pos.type === 'POSITION_TYPE_BUY' || pos.type?.toLowerCase() === 'buy';
                  return (
                  <div key={i} className="flex items-center justify-between p-2.5 bg-black/40 rounded-lg border border-white/5 glowing-panel">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] font-mono font-black text-white">{pos.symbol}</span>
                        <span className="text-[7px] font-mono font-black px-1 py-0.5 bg-white/5 text-slate-400 rounded uppercase border border-white/5">{pos.comment || 'SYS'}</span>
                      </div>
                      <p className={`text-[8px] font-mono font-black uppercase tracking-widest ${isBuy ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {isBuy ? 'BUY' : 'SELL'} {pos.volume}
                      </p>
                    </div>
                    <div className={`text-[10px] font-mono font-black ${pos.unrealizedProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {pos.unrealizedProfit >= 0 ? '+' : ''}{pos.unrealizedProfit ? pos.unrealizedProfit.toFixed(2) : '0.00'}
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <History className="w-3.5 h-3.5" style={{ color: 'var(--accent-color)' }} />
                <h4 className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-widest">Feed</h4>
              </div>
              {globalHistory.length > 0 && (
                <button 
                  onClick={() => setHistory([])}
                  className="text-[8px] font-mono font-black text-rose-500 hover:text-rose-400 uppercase tracking-widest transition-colors"
                >
                  Flush
                </button>
              )}
            </div>
            <div className="space-y-2">
              {globalHistory.length === 0 ? (
                <p className="text-[10px] font-mono text-slate-600 text-center py-4 bg-black/20 rounded-lg">Log empty</p>
              ) : (
                globalHistory.slice(0, 10).map((order: any, i: number) => {
                  if (!order) return null;
                  const isBuy = order.type?.toUpperCase().includes('BUY');
                  return (
                  <div key={i} className="flex items-center justify-between p-2.5 bg-black/40 rounded-lg border border-white/5 glowing-panel">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono font-black text-white">{order.symbol}</span>
                        <span className={`text-[7px] font-mono font-black px-1 py-0.5 rounded uppercase tracking-widest ${isBuy ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>{isBuy ? 'BUY' : 'SELL'}</span>
                      </div>
                      <p className="text-[8px] font-mono text-slate-500 uppercase">{order.time ? new Date(order.time).toLocaleTimeString() : '-'}</p>
                    </div>
                    {order.profit !== undefined && (
                      <div className={`text-[10px] font-mono font-black ${order.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {order.profit >= 0 ? '+' : ''}{order.profit?.toFixed(2) || '0.00'}
                      </div>
                    )}
                  </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketData;
