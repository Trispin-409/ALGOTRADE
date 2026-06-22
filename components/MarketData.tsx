import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { 
  Activity, 
  Clock, 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle, 
  Play, 
  X, 
  Zap, 
  Shield, 
  Layers, 
  History, 
  Settings, 
  Square, 
  Workflow, 
  Lock, 
  Sliders, 
  ChevronDown, 
  Minus, 
  Plus, 
  XCircle 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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
  const chartData = candles || [];
  const historyReady = chartData.length > 0;
  
  const globalPositions = useStore(state => state.positions);
  const globalHistory = useStore(state => state.history);
  const setHistory = useStore(state => state.setHistory);
  const setPositions = useStore(state => state.setPositions);
  const currentUserEmail = useStore(state => state.currentUserEmail);
  const strategySettings = useStore(state => state.strategySettings);
  const setStrategySettings = useStore(state => state.setStrategySettings);

  const [latestTick, setLatestTick] = useState<any>(null);
  const [deals, setDeals] = useState<any[]>([]);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [isTimeframeOpen, setIsTimeframeOpen] = useState(false);
  const [isAssetOpen, setIsAssetOpen] = useState(false);
  const [assetSearchQuery, setAssetSearchQuery] = useState('');

  const chartSettings = useStore(state => state.chartSettings);
  const marketAnalysis = useStore(state => state.marketAnalysis);
  const activeSetup = useStore(state => state.activeSetup);
  const [showAnalysis, setShowAnalysis] = useState(true);

  const [lotSizeInput, setLotSizeInput] = useState<string>(String(lotSize));

  useEffect(() => {
    setLotSizeInput(String(lotSize));
  }, [lotSize]);
  
  const systemStatus = connectionStatus;
  const selectedAccount = useMemo(() => accounts.find(a => a.id === selectedAccountId), [accounts, selectedAccountId]);

  useEffect(() => {
    if (!selectedAccountId) return;
    
    // Seed instantly from cache
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
    
    // Fetch fresh active positions
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
      .catch(err => {
        if (err?.message?.includes('Failed to fetch')) return;
        console.error("Failed to fetch positions:", err);
      });
  }, [selectedAccountId, currentUserEmail, token]);

  useEffect(() => {
    return () => {
      connectionManager.clearStreamIntent(selectedAccountId);
    };
  }, [selectedAccountId]);

  useEffect(() => {
    if (systemStatus === 'CONNECTED') {
        addLog(`BROKER: System reconnected. Synchronizing SDK snapshots...`);
    }
  }, [systemStatus, addLog]);

  useEffect(() => {
    if (availableBrokerSymbols.length > 0) {
      addLog(`DATA: ${availableBrokerSymbols.length} synced symbols available for charting.`);
    }
  }, [availableBrokerSymbols, addLog]);

  const activeStreamRef = useRef<string>('');

  useEffect(() => {
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
            console.log(`[CANDLES_CACHE] Instantly loaded ${parsed.length} cached candles`);
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
      if (connectionManager.currentPhase === TradingPhase.META_CONNECTED ||
          connectionManager.currentPhase === TradingPhase.BROKER_CONNECTED || 
          connectionManager.currentPhase === TradingPhase.ACCOUNT_SYNCING ||
          connectionManager.currentPhase === TradingPhase.ACCOUNT_READY ||
          connectionManager.currentPhase === TradingPhase.STREAMING) {
        
        connectionManager.setStreamIntent(selectedAccountId, symbol, timeframe);
        connectionManager.send(selectedAccountId, {
            type: 'STREAM_SUBSCRIBE',
            accountId: selectedAccountId,
            symbol,
            timeframe
        }, true);
        
        clearInterval(phaseCheck);
      }
    }, 1000);
    
    const unsub = connectionManager.subscribe((data: any) => {
      if (data.type === 'HISTORY_SNAPSHOT' && isSymbolMatch(data.symbol, symbol)) {
          const validHistory = data.candles.filter((c: any) => c && c.time && c.open !== undefined && c.close !== undefined);
          if (validHistory.length > 0) {
              setCandles(validHistory);
              if (currentUserEmail && selectedAccountId && symbol && timeframe) {
                const cacheKey = `candles:${currentUserEmail}:${selectedAccountId}:${symbol}:${timeframe}`;
                try {
                  localStorage.setItem(cacheKey, JSON.stringify(validHistory));
                } catch (e) {
                  console.warn("Failed to write snapshot cache", e);
                }
              }
          }
      } else if (data.type === 'CANDLE' && isSymbolMatch(data.symbol, symbol)) {
        if (!data.candle || !data.candle.time) return;
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
        const bid = Number(data.bid);
        const ask = Number(data.ask);
        const price = bid || ask;
        
        setLatestTick({ bid, ask });

        setCandles(prev => {
           if (prev.length === 0) {
              const now = new Date();
              const tfM = getTimeframeMinutes(timeframe);
              const alignedIncomingTime = alignToTimeframe(now.toISOString(), tfM);
              return [{ time: new Date(alignedIncomingTime).toISOString(), open: price, high: price, low: price, close: price, tickVolume: 1 }];
           }
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
  }, [selectedAccountId, symbol, timeframe]);

  const [localSymbol, setLocalSymbol] = useState(symbol);

  useEffect(() => {
    setLocalSymbol(symbol);
  }, [symbol]);

  useEffect(() => {
    if (localSymbol === symbol) return;
    if (!availableBrokerSymbols.includes(localSymbol)) return;

    const timer = setTimeout(() => {
      setSymbol(localSymbol);
      addLog(`DATA: Switching analysis context to ${localSymbol}...`);
    }, 500);
    return () => clearTimeout(timer);
  }, [localSymbol, symbol, setSymbol, availableBrokerSymbols, addLog]);

  // Handle manual lots adjustment
  const handleVolumeDecrement = () => {
    const next = Math.max(0.01, Number((lotSize - 0.01).toFixed(2)));
    setLotSize(next);
  };

  const handleVolumeIncrement = () => {
    const next = Math.min(10.0, Number((lotSize + 0.01).toFixed(2)));
    setLotSize(next);
  };

  // Live prices indicators for buy & sell
  const liveBidPrice = useMemo(() => {
    if (latestTick?.bid) return latestTick.bid.toFixed(2);
    if (chartData.length > 0) return chartData[chartData.length - 1].close.toFixed(2);
    return '----.--';
  }, [latestTick, chartData]);

  const liveAskPrice = useMemo(() => {
    if (latestTick?.ask) return latestTick.ask.toFixed(2);
    if (chartData.length > 0) return (chartData[chartData.length - 1].close + 0.15).toFixed(2); // estimated ask
    return '----.--';
  }, [latestTick, chartData]);

  const timeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

  // Filtered symbols based on Search Query
  const filteredSymbols = useMemo(() => {
    const query = assetSearchQuery.toUpperCase().trim();
    if (!query) return availableBrokerSymbols.slice(0, 50);
    return availableBrokerSymbols.filter(s => s.toUpperCase().includes(query)).slice(0, 50);
  }, [availableBrokerSymbols, assetSearchQuery]);

  return (
    <div className="flex flex-col h-full w-full bg-black text-slate-100 overflow-hidden font-sans space-y-2 select-none relative pb-2 sm:pb-0">
      
      {/* SYMBOL MISMATCH ALERT (Global Context Guard) */}
      {!isLoading && availableBrokerSymbols.length > 0 && symbol && !availableBrokerSymbols.includes(symbol) && (
        <div className="mx-2 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-xl flex items-center gap-3 animate-pulse shrink-0">
           <Zap className="w-3.5 h-3.5 text-amber-500" />
           <div className="flex-1">
             <p className="text-[9px] font-mono font-black text-amber-200 uppercase tracking-tighter">Symbol Conflict Detected</p>
             <p className="text-[9px] font-mono text-amber-400/80 uppercase font-medium leading-relaxed">
               "{symbol}" is not recognized by your broker.
             </p>
           </div>
        </div>
      )}

      {/* TOP CONTROL BAR - Single horizontal row */}
      <div className="flex items-center justify-between gap-1.5 px-2 py-1 bg-neutral-900/40 rounded-2xl border border-white/5 shrink-0">
        
        {/* Asset dropdown selector widget */}
        <div className="relative">
          <button 
            type="button"
            onClick={() => setIsAssetOpen(!isAssetOpen)}
            className="flex items-center justify-between gap-1.5 px-3 py-2 bg-black/60 hover:bg-black/80 text-xs text-white font-mono font-black border border-white/10 rounded-xl transition-all cursor-pointer select-none max-w-[130px] sm:max-w-none text-left"
          >
            <span className="truncate">{symbol || 'SELECT ASSET'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-[#face6f] shrink-0" />
          </button>

          {isAssetOpen && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => { setIsAssetOpen(false); setAssetSearchQuery(''); }} 
              />
              <div className="absolute left-0 mt-1.5 w-60 bg-[#070b13] border border-[#face6f]/20 rounded-2xl shadow-2xl z-50 p-2 text-left animate-in fade-in slide-in-from-top-1">
                <input 
                  type="text"
                  value={assetSearchQuery}
                  onChange={(e) => setAssetSearchQuery(e.target.value)}
                  placeholder="Filter instruments..."
                  className="w-full bg-black text-xs font-mono text-white border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-[#face6f]/50 mb-2"
                  autoFocus
                />
                <div className="max-h-56 overflow-y-auto scrollbar-thin custom-scrollbar space-y-0.5">
                  {filteredSymbols.length === 0 ? (
                    <div className="text-[10px] text-slate-500 font-mono p-3 text-center uppercase tracking-wide">No assets matched</div>
                  ) : (
                    filteredSymbols.map(sym => (
                      <button
                        key={sym}
                        type="button"
                        onClick={() => {
                          setSymbol(sym);
                          setIsAssetOpen(false);
                          setAssetSearchQuery('');
                        }}
                        className={`w-full text-left font-mono text-xs font-bold px-3 py-2 rounded-xl transition-colors truncate block ${
                          symbol === sym 
                            ? 'bg-[#face6f]/10 text-[#face6f]' 
                            : 'text-slate-400 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        {sym}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Timeframe dropdown selector widget */}
        <div className="relative">
          <button 
            type="button"
            onClick={() => setIsTimeframeOpen(!isTimeframeOpen)}
            className="flex items-center justify-between gap-1.5 px-3 py-2 bg-black/60 hover:bg-black/80 text-xs text-white font-mono font-black border border-white/10 rounded-xl transition-all cursor-pointer select-none"
          >
            <span>{timeframe ? timeframe.toUpperCase() : '15M'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-[#face6f] shrink-0" />
          </button>

          {isTimeframeOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsTimeframeOpen(false)} />
              <div className="absolute left-0 mt-1.5 w-24 bg-[#070b13] border border-[#face6f]/20 rounded-2xl shadow-2xl z-50 p-1 text-left animate-in fade-in slide-in-from-top-1">
                {timeframes.map(tf => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => {
                      setTimeframe(tf);
                      setIsTimeframeOpen(false);
                    }}
                    className={`w-full text-left font-mono text-xs font-bold px-3 py-2 rounded-xl transition-colors block ${
                      timeframe === tf 
                        ? 'bg-[#face6f]/10 text-[#face6f]' 
                        : 'text-slate-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {tf.toUpperCase()}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Start Engine / Stop Engine dynamic executor */}
        <button
          type="button"
          onClick={onToggleAlgo}
          disabled={(connectionStatus !== 'READY' && connectionStatus !== 'CONNECTED' && connectionStatus !== 'SYNCING') || tradeStatus === 'executing'}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 sm:px-4 rounded-xl border text-xs font-mono font-black tracking-wider transition-all cursor-pointer active:scale-95 text-center ${
            isAlgoRunning 
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20 shadow-md shadow-rose-500/5' 
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 shadow-md shadow-emerald-500/5'
          } ${((connectionStatus !== 'READY' && connectionStatus !== 'CONNECTED' && connectionStatus !== 'SYNCING') || tradeStatus === 'executing') ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
        >
          {isAlgoRunning ? (
            <>
              <Square className="w-3 h-3 fill-rose-400" />
              <span className="truncate text-[10px] sm:text-xs">STOP ENGINE</span>
            </>
          ) : (
            <>
              <Play className="w-3 h-3 fill-emerald-400 text-emerald-400 ml-0.5" />
              <span className="truncate text-[10px] sm:text-xs">START ENGINE</span>
            </>
          )}
        </button>

        {/* Global Settings button */}
        <button 
          type="button"
          onClick={() => setShowSettingsDrawer(true)}
          className="p-2 bg-black/60 hover:bg-black/80 text-[#face6f] border border-white/10 rounded-xl hover:border-[#face6f]/40 transition-all cursor-pointer select-none active:scale-95 shrink-0"
        >
          <Settings className="w-4 h-4 animate-spin-slow" />
        </button>

      </div>

      {/* BUY / SELL EXECUTION BAR - Positioned snug above chart */}
      <div className="flex items-stretch gap-2.5 px-1.5 py-1 bg-neutral-950/25 rounded-2xl shrink-0">
        
        {/* SELL Trade controller */}
        <button
          type="button"
          onClick={onSell}
          disabled={(connectionStatus !== 'READY' && connectionStatus !== 'CONNECTED' && connectionStatus !== 'SYNCING') || tradeStatus === 'executing'}
          className={`flex-1 flex flex-col items-center justify-center py-1.5 px-3 rounded-xl bg-rose-950/10 border border-rose-500/15 hover:bg-rose-950/20 active:scale-95 transition-all ${
            ((connectionStatus !== 'READY' && connectionStatus !== 'CONNECTED' && connectionStatus !== 'SYNCING') || tradeStatus === 'executing') ? 'opacity-40 grayscale cursor-not-allowed' : 'cursor-pointer'
          }`}
        >
          <span className="text-[8px] font-mono font-black text-rose-500 uppercase tracking-widest mb-0.5 leading-none">SELL</span>
          <div className="flex items-center gap-1">
            <span className="text-xs sm:text-sm font-mono font-black text-white leading-none">{liveBidPrice}</span>
            <TrendingDown className="w-3 h-3 text-rose-400 shrink-0" />
          </div>
        </button>

        {/* VOLUME CONTROL ADJUSTMENT CAPSULE */}
        <div className="flex-1 flex flex-col items-center justify-center bg-black/60 border border-white/5 rounded-xl py-1 px-2 font-mono text-center relative">
          <span className="text-[7px] text-slate-500 block uppercase font-black tracking-widest mb-0.5 leading-none">VOLUME</span>
          <div className="flex items-center justify-between w-full">
            <button 
              type="button"
              onClick={handleVolumeDecrement}
              className="p-1 hover:bg-white/5 text-slate-400 hover:text-white rounded-lg active:scale-95 transition-all cursor-pointer"
            >
              <Minus className="w-3 h-3" />
            </button>
            <input 
              id="terminal-volume-input"
              type="text"
              inputMode="decimal"
              value={lotSizeInput}
              onChange={(e) => {
                const text = e.target.value;
                if (/^[0-9]*\.?[0-9]*$/.test(text)) {
                  setLotSizeInput(text);
                  const val = parseFloat(text);
                  if (!isNaN(val) && val >= 0.001 && val <= 100.0) {
                    setLotSize(val);
                  }
                }
              }}
              onBlur={() => {
                const val = parseFloat(lotSizeInput);
                if (isNaN(val) || val < 0.01) {
                  setLotSize(0.01);
                  setLotSizeInput("0.01");
                } else if (val > 10.0) {
                  setLotSize(10.0);
                  setLotSizeInput("10.00");
                } else {
                  const rounded = Number(val.toFixed(2));
                  setLotSize(rounded);
                  setLotSizeInput(rounded.toString());
                }
              }}
              className="w-14 bg-transparent text-xs sm:text-sm font-black text-white text-center outline-none border-0 p-0 focus:ring-0 focus:outline-none placeholder-slate-500"
              style={{ color: 'var(--accent-color)' }}
            />
            <button 
              type="button"
              onClick={handleVolumeIncrement}
              className="p-1 hover:bg-white/5 text-slate-400 hover:text-white rounded-lg active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* BUY Trade controller */}
        <button
          type="button"
          onClick={onBuy}
          disabled={(connectionStatus !== 'READY' && connectionStatus !== 'CONNECTED' && connectionStatus !== 'SYNCING') || tradeStatus === 'executing'}
          className={`flex-1 flex flex-col items-center justify-center py-1.5 px-3 rounded-xl bg-emerald-950/10 border border-emerald-500/15 hover:bg-emerald-950/20 active:scale-95 transition-all ${
            ((connectionStatus !== 'READY' && connectionStatus !== 'CONNECTED' && connectionStatus !== 'SYNCING') || tradeStatus === 'executing') ? 'opacity-40 grayscale cursor-not-allowed' : 'cursor-pointer'
          }`}
        >
          <span className="text-[8px] font-mono font-black text-emerald-500 uppercase tracking-widest mb-0.5 leading-none">BUY</span>
          <div className="flex items-center gap-1">
            <span className="text-xs sm:text-sm font-mono font-black text-white leading-none">{liveAskPrice}</span>
            <TrendingUp className="w-3 h-3 text-emerald-400 shrink-0" />
          </div>
        </button>

      </div>

      {/* COMPACT ORDER FEEDBACK TOAST OVERLAY */}
      {tradeStatus === 'executing' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex items-center justify-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl animate-pulse shadow-xl backdrop-blur-md">
          <RefreshCw className="w-3.5 h-3.5 text-amber-500 animate-spin" />
          <span className="text-[9px] font-mono font-black text-amber-400 uppercase tracking-widest leading-none">TRANSMITTING SECURE Payload...</span>
        </div>
      )}
      {tradeStatus === 'success' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl shadow-xl backdrop-blur-md animate-fade-in">
          <span className="text-[9px] font-mono font-black text-emerald-400 uppercase tracking-widest leading-none">🛰️ ORDER BROADCAST SUCCESSFUL</span>
        </div>
      )}

      {/* FULL SCREEN CHART COMPONENT - Takes remaining available height */}
      <div className="flex-1 w-full bg-[#050608]/40 border border-white/5 rounded-3xl relative min-h-0 min-w-0 overflow-hidden shadow-2xl glowing-frame">
        
        {/* Absolute dynamic background asset indicator */}
        <div className="absolute top-4 left-4 pointer-events-none opacity-5 z-0 select-none font-mono">
          <span className="text-5xl font-black text-white leading-none uppercase">{symbol}</span>
          <span className="text-xs font-bold block uppercase tracking-widest mt-1 text-[#face6f]">{timeframe} INTERVAL</span>
        </div>

        <div className="absolute inset-0 w-full h-full p-2 flex items-center justify-center z-10">
          {(!candles || candles.length === 0) ? (
            <div className="w-full">
              {!selectedAccount ? (
                <div className="flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <AlertCircle className="w-8 h-8 text-amber-500/80 animate-pulse" />
                  <p className="font-mono text-xs text-slate-300 uppercase tracking-widest font-bold">No Active Terminal Selected</p>
                  <p className="text-[11px] text-slate-500 max-w-sm">Please select an active trading terminal inside Settings configuration above.</p>
                </div>
              ) : selectedAccount.state !== 'DEPLOYED' ? (
                <div className="flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <Settings className="w-8 h-8 text-slate-500 animate-spin" style={{ animationDuration: '4s' }} />
                  <p className="font-mono text-xs text-slate-300 uppercase tracking-widest font-bold">Terminal Off-line</p>
                  <p className="text-[11px] text-slate-500 max-w-sm">The terminal <strong>{selectedAccount.name}</strong> is offline. Open Settings and deploy the cloud terminal.</p>
                </div>
              ) : selectedAccount.connectionStatus?.toUpperCase() === 'DISCONNECTED_FROM_BROKER' ? (
                <div className="flex flex-col items-center justify-center text-center p-5 space-y-3 bg-rose-500/5 rounded-2xl border border-rose-500/10 max-w-md mx-4">
                  <Lock className="w-7 h-7 text-rose-400 accent-glow" />
                  <p className="font-mono text-xs text-rose-300 uppercase tracking-widest font-black">Broker Connection Blocked</p>
                  <p className="text-[10px] text-slate-400 leading-relaxed max-w-xs">
                    Terminal is online, but your MetaTrader broker has rejected these login credentials. Please verify your account details inside Settings setup.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <RefreshCw className="w-6 h-6 text-[#face6f] animate-spin" />
                  <p className="font-mono text-xs text-slate-400 uppercase tracking-widest font-bold">Synchronizing {symbol} workspace</p>
                  <p className="text-[10px] text-slate-500 max-w-xs leading-relaxed">
                    Establishing connection and building live candles. This may take up to 45 seconds on first bootstrap cycle.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <Suspense fallback={<div className="flex w-full h-full items-center justify-center text-slate-500 font-mono text-xs">TRADING TERMINAL LOADING...</div>}>
              <CandlestickChart 
                data={candles}
                latestTick={latestTick} 
                deals={deals} 
                positions={globalPositions}
                marketAnalysis={marketAnalysis}
                showAnalysis={showAnalysis}
                upColor={chartSettings.upColor}
                downColor={chartSettings.downColor}
                bgImageUrl={chartSettings.bgImageUrl}
                activeSetup={activeSetup}
                lotSize={lotSize}
                setLotSize={setLotSize}
              />
            </Suspense>
          )}
        </div>
      </div>

      {/* ALGOTRADE SLIDE-UP CONFIGURATION SETTINGS DRAWER */}
      <AnimatePresence>
        {showSettingsDrawer && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/85 backdrop-blur-md">
            
            {/* Backdrop click away guard */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-transparent"
              onClick={() => setShowSettingsDrawer(false)}
            />

            {/* Slider Drawer element container */}
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="w-full max-w-lg bg-[#070b13] border-t border-[#face6f]/30 rounded-t-[40px] shadow-2xl relative flex flex-col font-sans select-none max-h-[85vh] overflow-hidden"
            >
              {/* LED Spot Strip branding */}
              <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 text-[10px] font-mono font-black py-2.5 px-6 flex items-center justify-between tracking-wider">
                <span className="flex items-center gap-1.5 uppercase font-bold">
                  <Workflow className="w-3.5 h-3.5 animate-pulse" />
                  Advisor System Core Node Panel
                </span>
                <span className="bg-slate-950 text-amber-400 font-bold px-2 py-0.5 rounded text-[9px] tracking-widest">
                  SETTINGS
                </span>
              </div>

              {/* Slider content scrolling panel */}
              <div className="p-6 overflow-y-auto space-y-5 flex-1 min-h-0 custom-scrollbar text-left pb-12">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-black text-white uppercase tracking-tight">Terminal Settings</h3>
                    <p className="text-[10px] font-mono text-slate-400">Configure parameters, risk boundaries, and cloud deployments</p>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setShowSettingsDrawer(false)}
                    className="p-1.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all cursor-pointer text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Account Terminal Selector */}
                <div className="space-y-1.5 bg-black/40 p-4 rounded-2xl border border-white/5">
                  <label className="text-[9px] font-mono font-black text-slate-500 uppercase tracking-widest">Active Terminal Connection</label>
                  <select 
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="w-full bg-black/80 border border-white/10 text-white text-xs font-mono rounded-xl px-3 py-2.5 outline-none focus:border-[#face6f]/40 transition-colors"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.login} ({acc.platform?.toUpperCase()}) — {acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Volume & Lot allocation setting */}
                <div className="space-y-2 bg-black/40 p-4 rounded-2xl border border-white/5">
                  <span className="text-[9px] font-mono font-black text-[#face6f] uppercase tracking-widest block">Volume Settings</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono font-bold text-slate-500 uppercase">Lot Size Allocation</label>
                      <input 
                        type="text" 
                        inputMode="decimal"
                        value={lotSizeInput} 
                        onChange={(e) => {
                          const text = e.target.value;
                          if (/^[0-9]*\.?[0-9]*$/.test(text)) {
                            setLotSizeInput(text);
                            const val = parseFloat(text);
                            if (!isNaN(val) && val >= 0.001 && val <= 100.0) {
                              setLotSize(val);
                            }
                          }
                        }}
                        onBlur={() => {
                          const val = parseFloat(lotSizeInput);
                          if (isNaN(val) || val < 0.01) {
                            setLotSize(0.01);
                            setLotSizeInput("0.01");
                          } else if (val > 10.0) {
                            setLotSize(10.0);
                            setLotSizeInput("10.00");
                          } else {
                            const rounded = Number(val.toFixed(2));
                            setLotSize(rounded);
                            setLotSizeInput(rounded.toString());
                          }
                        }}
                        className="w-full bg-black border border-white/10 text-xs font-mono text-white rounded-xl px-3 py-2 outline-none focus:border-[#face6f]/40" 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono font-bold text-slate-500 uppercase">Underlying Symbol</label>
                      <input 
                        type="text" 
                        value={symbol} 
                        readOnly
                        className="w-full bg-black/40 border border-white/5 text-xs font-mono text-slate-400 rounded-xl px-3 py-2 outline-none" 
                      />
                    </div>
                  </div>
                </div>

                {/* Risk Management Setting */}
                <div className="space-y-2 bg-black/40 p-4 rounded-2xl border border-white/5">
                  <span className="text-[9px] font-mono font-black text-[#face6f] uppercase tracking-widest block">Risk Management</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono font-bold text-slate-500 uppercase">Max Trades Limit</label>
                      <input 
                        type="number"
                        value={strategySettings.maxTrades ?? 1}
                        onChange={(e) => setStrategySettings({ maxTrades: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="w-full bg-black border border-white/10 text-xs font-mono text-white rounded-xl px-3 py-2 outline-none focus:border-[#face6f]/40"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono font-bold text-slate-500 uppercase">Broker Comment</label>
                      <input 
                        type="text"
                        value="ALGOTRADE"
                        className="w-full bg-[#070b13] border border-white/10 text-xs font-mono text-slate-400 rounded-xl px-3 py-2 outline-none cursor-not-allowed opacity-50"
                        readOnly
                      />
                    </div>
                  </div>
                </div>

                {/* Active Cloud AI & Analysis Overlay Checkboxes */}
                <div className="space-y-2 bg-black/40 p-4 rounded-2xl border border-white/5">
                  <span className="text-[9px] font-mono font-black text-[#face6f] uppercase tracking-widest block">AI & Analysis Settings</span>
                  <div className="flex items-center justify-between py-1 border-b border-white/5">
                    <span className="text-xs font-bold text-slate-300">Model Candlestick overlay assist</span>
                    <button
                      type="button"
                      onClick={() => setShowAnalysis(!showAnalysis)}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-mono font-black uppercase tracking-wide transition-all ${
                        showAnalysis 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : 'bg-white/5 text-slate-500 border border-white/5'
                      }`}
                    >
                      {showAnalysis ? 'ENABLED ON CHART' : 'DISABLED'}
                    </button>
                  </div>
                </div>



                {/* Dismiss Actions link */}
                <button
                  type="button"
                  onClick={() => setShowSettingsDrawer(false)}
                  className="w-full py-3 px-4 rounded-xl font-mono text-xs font-black text-slate-400 hover:text-white uppercase transition-colors text-center border border-white/10 hover:border-white/20 select-none cursor-pointer"
                >
                  SAVE & CLOSE PANEL
                </button>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default MarketData;
