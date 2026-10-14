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
import CandlestickChart from './CandlestickChart';
import { connectionManager, TradingPhase } from '../src/lib/ConnectionManager';
import { safeFetch } from '../src/lib/utils';
import { useStore } from '../src/store';
import { scanChartStructure, scanChartWithAI, candleCache, tokenBudget, calculateAccountLotSize } from '../src/lib/chartScanner';
import { MarketAnalysisEngine } from '../src/lib/MarketAnalysisEngine';

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
  const [isExecutingManual, setIsExecutingManual] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const [lotSizeInput, setLotSizeInput] = useState<string>(String(lotSize));

  useEffect(() => {
    setLotSizeInput(String(lotSize));
  }, [lotSize]);
  
  const systemStatus = connectionStatus;
  const selectedAccount = useMemo(() => accounts.find(a => a.id === selectedAccountId), [accounts, selectedAccountId]);

  // Real Vertex AI Market Structure & Signal Scan Trigger
  const lastManualScanTimeRef = useRef(0);
  const triggerVertexAIScan = async () => {
    const now = Date.now();
    if (now - lastManualScanTimeRef.current < 15000) {
      addLog(`[AI SCANNER] Rate pacing active: Please wait ${Math.ceil((15000 - (now - lastManualScanTimeRef.current)) / 1000)}s before next scan.`);
      return;
    }
    if (!candles || candles.length < 5 || isScanning) return;
    lastManualScanTimeRef.current = now;
    setIsScanning(true);
    addLog(`[VERTEX AI] Scanning live ${symbol} (${timeframe}) chart structure, patterns & news catalysts...`);

    const accountContext = {
      equity: selectedAccount?.equity || selectedAccount?.balance || 1000,
      balance: selectedAccount?.balance || 1000,
      currency: selectedAccount?.currency || 'USD',
      preferredLotSize: Number(lotSizeInput) || lotSize,
      maxTrades: strategySettings?.maxTrades || 1
    };

    const newsContext = {
      sentiment: useStore.getState().newsImpact?.bias || 'NEUTRAL',
      score: useStore.getState().newsImpact?.score || 50,
      headlines: useStore.getState().newsImpact?.title ? [useStore.getState().newsImpact.title] : []
    };

    try {
      const scannedSetup = await scanChartWithAI(candles, symbol, timeframe, accountContext, newsContext, token);
      if (scannedSetup) {
        useStore.getState().setActiveSetup({
          symbol: scannedSetup.symbol,
          strategyName: scannedSetup.strategyName,
          direction: scannedSetup.direction,
          entry: scannedSetup.entry,
          stopLoss: scannedSetup.stopLoss,
          takeProfit: scannedSetup.takeProfit,
          confidence: scannedSetup.confidence,
          sessionName: scannedSetup.activeSession,
          pdh: scannedSetup.pdh,
          pdl: scannedSetup.pdl,
          prev4hHigh: scannedSetup.prev4hHigh,
          prev4hLow: scannedSetup.prev4hLow,
          fibLevels: scannedSetup.fibLevels,
          goldenPocket: scannedSetup.goldenPocket,
          targetLiquidity: scannedSetup.targetLiquidity,
          targetLiquidityType: scannedSetup.targetLiquidityType,
          detectedPatterns: scannedSetup.detectedPatterns,
          primaryPattern: scannedSetup.primaryPattern,
          newsAlignment: scannedSetup.newsAlignment,
          riskRewardRatio: scannedSetup.riskRewardRatio,
          recommendedLotSize: scannedSetup.recommendedLotSize,
          lotSize: scannedSetup.recommendedLotSize || Number(lotSizeInput) || lotSize || 0.01,
          isPendingConfirm: false
        });
        addLog(`[VERTEX AI] Setup generated: ${scannedSetup.direction} via ${scannedSetup.strategyName} (${scannedSetup.confidence}% Conviction). Chart markings updated in real-time.`);

        // If Engine is RUNNING, auto-execute high-confidence setup following rules and maxTrades
        if (isAlgoRunning && scannedSetup.direction !== 'WAIT' && scannedSetup.confidence >= 75) {
          const currentPos = globalPositions.filter((p: any) => p.symbol === symbol);
          const maxTrades = strategySettings?.maxTrades || 1;
          if (currentPos.length < maxTrades && selectedAccountId && token) {
            const endpoint = scannedSetup.direction === 'BUY' ? '/api/trade/buy' : '/api/trade/sell';
            safeFetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                accountId: selectedAccountId,
                symbol: scannedSetup.symbol,
                lotSize: scannedSetup.recommendedLotSize || Number(lotSizeInput) || lotSize || 0.01,
                stopLoss: Number(Number(scannedSetup.stopLoss).toFixed(5)),
                takeProfit: Number(Number(scannedSetup.takeProfit).toFixed(5)),
                comment: `AI: ${scannedSetup.strategyName}`
              })
            }).then(res => {
              if (res?.success) {
                addLog(`[ENGINE AUTO-EXECUTE] ${scannedSetup.direction} order placed on ${symbol} via ${scannedSetup.strategyName} (Confidence: ${scannedSetup.confidence}%).`);
              }
            }).catch(err => console.warn('[ENGINE AUTO-EXECUTE ERROR]', err));
          }
        }
      }
    } catch (err: any) {
      addLog(`[VERTEX AI] Scan error: ${err.message}`);
    } finally {
      setIsScanning(false);
    }
  };

  // CONTINUOUS ENGINE AUTOMATION (Auto-Scans & Auto-Executes when Start Engine is Active)
  const isEngineExecutingRef = useRef(false);
  const lastEngineScanTimeRef = useRef(0);
  const lastEngineTradeTimeRef = useRef(0);

  useEffect(() => {
    if (!isAlgoRunning || !selectedAccountId || !symbol || !candles || candles.length < 5) return;

    const runEngineCycle = async () => {
      const now = Date.now();
      // Pacing: ensure minimum 25s between automatic AI analysis runs to avoid quota exhaustion
      if (now - lastEngineScanTimeRef.current < 25000 || isEngineExecutingRef.current) return;
      isEngineExecutingRef.current = true;
      lastEngineScanTimeRef.current = now;

      try {
        const accountContext = {
          equity: selectedAccount?.equity || selectedAccount?.balance || 1000,
          balance: selectedAccount?.balance || 1000,
          freeMargin: selectedAccount?.freeMargin || 1000,
          currency: selectedAccount?.currency || 'USD',
          preferredLotSize: Number(lotSizeInput) || lotSize || 0.01,
          openPositionsCount: globalPositions.length,
          maxTradesLimit: strategySettings?.maxTrades || 1
        };

        const newsContext = {
          sentiment: useStore.getState().newsImpact?.bias || 'NEUTRAL',
          score: useStore.getState().newsImpact?.score || 50,
          headlines: useStore.getState().newsImpact?.title ? [useStore.getState().newsImpact.title] : []
        };

        // 1. Locally compute the structured snapshot
        MarketAnalysisEngine.processRawMarketData(
          symbol,
          candles,
          accountContext,
          newsContext,
          symbol.includes('XAU') ? 2 : 5
        );

        // 2. Query AI Model-Agnostic Engine
        const scannedSetup = await scanChartWithAI(candles, symbol, timeframe, accountContext, newsContext, token);
        if (scannedSetup && scannedSetup.direction !== 'WAIT' && scannedSetup.confidence >= 75) {
          useStore.getState().setActiveSetup({
            ...scannedSetup,
            isPendingConfirm: false
          });

          // Check position limits and trade cooldown (60s)
          const currentPos = globalPositions.filter((p: any) => p.symbol === symbol);
          const maxTrades = strategySettings?.maxTrades || 1;
          const hasTradeCooldown = Date.now() - lastEngineTradeTimeRef.current < 60000;

          if (currentPos.length < maxTrades && !hasTradeCooldown && selectedAccountId && token) {
            lastEngineTradeTimeRef.current = Date.now();
            const endpoint = scannedSetup.direction === 'BUY' ? '/api/trade/buy' : '/api/trade/sell';
            const res = await safeFetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                accountId: selectedAccountId,
                symbol: scannedSetup.symbol,
                lotSize: scannedSetup.recommendedLotSize || Number(lotSizeInput) || lotSize || 0.01,
                stopLoss: Number(Number(scannedSetup.stopLoss).toFixed(5)),
                takeProfit: Number(Number(scannedSetup.takeProfit).toFixed(5)),
                comment: `AI:${scannedSetup.strategyName.slice(0, 20)}`
              })
            });

            if (res?.success) {
              addLog(`[ENGINE AUTONOMOUS EXECUTE] ${scannedSetup.direction} order placed on ${symbol} via ${scannedSetup.strategyName} (Confidence: ${scannedSetup.confidence}%).`);
            } else if (res?.error) {
              addLog(`[ENGINE EXECUTE NOTICE] ${res.error}`);
            }
          }
        }
      } catch (err: any) {
        console.warn("[ENGINE_CYCLE_ERROR]", err);
      } finally {
        isEngineExecutingRef.current = false;
      }
    };

    // Run engine cycle with initial 3s delay
    const initialTimer = setTimeout(runEngineCycle, 3000);

    // Auto-poll interval while Engine is running (every 30s)
    const engineInterval = setInterval(runEngineCycle, 30000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(engineInterval);
    };
  }, [isAlgoRunning, selectedAccountId, symbol, timeframe, selectedAccount, lotSize, lotSizeInput, strategySettings?.maxTrades, globalPositions.length, token]);


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

  const sanitizeCandles = (arr: any[]): any[] => {
    if (!Array.isArray(arr) || arr.length === 0) return [];
    const valid = arr.filter(c => c && c.time && typeof c.close === 'number' && !isNaN(c.close) && c.close > 0)
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    if (valid.length <= 1) return valid;

    let startIndex = 0;
    for (let i = valid.length - 1; i >= 1; i--) {
      const cur = valid[i];
      const prev = valid[i - 1];
      const curTime = new Date(cur.time).getTime();
      const prevTime = new Date(prev.time).getTime();
      const gapHours = (curTime - prevTime) / (1000 * 3600);
      const priceChangeRatio = Math.abs(cur.close - prev.close) / prev.close;

      // Strip disconnected historical epochs (gap > 96 hours or price jump > 2.5%)
      if (gapHours > 96 || priceChangeRatio > 0.025) {
        startIndex = i;
        break;
      }
    }

    return valid.slice(startIndex);
  };

  useEffect(() => {
    let loadedFromCache = false;
    if (currentUserEmail && selectedAccountId && symbol && timeframe) {
      const cacheKey = `candles:${currentUserEmail}:${selectedAccountId}:${symbol}:${timeframe}`;
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const clean = sanitizeCandles(parsed);
            if (clean.length > 0) {
              setCandles(clean);
              loadedFromCache = true;
              console.log(`[CANDLES_CACHE] Instantly loaded ${clean.length} sanitized cached candles`);
            }
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

  // LIVE STREAMING, REST HYDRATION & TICK FALLBACK ENGINE
  useEffect(() => {
    if (!selectedAccountId || !symbol || !timeframe) return;

    // 1. Instant REST Hydration from server/cache
    safeFetch(`/api/account/${encodeURIComponent(selectedAccountId)}/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(res => {
      if (res?.success && Array.isArray(res.candles) && res.candles.length > 0) {
        const clean = sanitizeCandles(res.candles);
        if (clean.length > 0) {
          setCandles(clean);
          if (currentUserEmail) {
            localStorage.setItem(`candles:${currentUserEmail}:${selectedAccountId}:${symbol}:${timeframe}`, JSON.stringify(clean));
          }
        }
      }
    }).catch(e => console.warn("[REST_CANDLES] Hydration warning:", e));

    // 2. Continuous real-time tick polling fallback (every 2.5s) to guarantee chart moves live
    const quotePollInterval = setInterval(() => {
      safeFetch(`/api/account/${encodeURIComponent(selectedAccountId)}/quote?symbol=${encodeURIComponent(symbol)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(res => {
        if (res?.success && typeof res.bid === 'number' && res.bid > 0) {
          const bid = Number(res.bid);
          const ask = Number(res.ask) || (bid + (symbol.includes('XAU') ? 0.25 : 0.00015));
          setLatestTick({ bid, ask });
          
          setCandles(prev => {
            if (prev.length === 0) return prev;
            const next = [...prev];
            const last = { ...next[next.length - 1] };
            last.close = bid;
            last.high = Math.max(last.high, bid);
            last.low = Math.min(last.low, bid);
            next[next.length - 1] = last;
            return sanitizeCandles(next);
          });
        }
      }).catch(() => {});
    }, 2500);

    // 3. WebSocket Real-Time Stream Subscription
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
          const validHistory = sanitizeCandles(data.candles || []);
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

          const cleanNext = sanitizeCandles(next);

          if (currentUserEmail && selectedAccountId && symbol && timeframe) {
            const cacheKey = `candles:${currentUserEmail}:${selectedAccountId}:${symbol}:${timeframe}`;
            try {
              localStorage.setItem(cacheKey, JSON.stringify(cleanNext));
            } catch (e) {
              console.warn("Failed to write live candle update to cache", e);
            }
          }
          return cleanNext;
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

           const cleanNext = sanitizeCandles(next);

           if (currentUserEmail && selectedAccountId && symbol && timeframe) {
             const cacheKey = `candles:${currentUserEmail}:${selectedAccountId}:${symbol}:${timeframe}`;
             try {
               localStorage.setItem(cacheKey, JSON.stringify(cleanNext));
             } catch (e) {
               console.warn("Failed to write price update cache", e);
             }
           }
           return cleanNext;
        });
      }
    });

    return () => {
      clearInterval(phaseCheck);
      clearInterval(quotePollInterval);
      unsub();
    };
  }, [selectedAccountId, symbol, timeframe, token, currentUserEmail]);

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
    const next = Math.max(0.01, Number(((lotSize || 0.01) - 0.01).toFixed(2)));
    setLotSize(next);
  };

  const handleVolumeIncrement = () => {
    const next = Math.min(10.0, Number(((lotSize || 0.01) + 0.01).toFixed(2)));
    setLotSize(next);
  };

  // Live prices indicators for buy & sell
  const liveBidPrice = useMemo(() => {
    if (latestTick?.bid) return Number(latestTick.bid).toFixed(2);
    if (chartData.length > 0 && chartData[chartData.length - 1]?.close !== undefined) return Number(chartData[chartData.length - 1].close).toFixed(2);
    return '----.--';
  }, [latestTick, chartData]);

  const liveAskPrice = useMemo(() => {
    if (latestTick?.ask) return Number(latestTick.ask).toFixed(2);
    if (chartData.length > 0 && chartData[chartData.length - 1]?.close !== undefined) return Number(chartData[chartData.length - 1].close + 0.15).toFixed(2); // estimated ask
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

        {/* Real Vertex AI Market Structure & Strategy Scan Button */}
        <button
          type="button"
          onClick={triggerVertexAIScan}
          disabled={isScanning || !candles || candles.length === 0}
          className={`flex items-center gap-1.5 py-2 px-3 sm:px-4 rounded-xl border text-xs font-mono font-black tracking-wider transition-all cursor-pointer active:scale-95 text-center ${
            isScanning
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 animate-pulse'
              : 'bg-[#face6f]/10 border-[#face6f]/30 text-[#face6f] hover:bg-[#face6f]/20 shadow-md shadow-[#face6f]/5'
          }`}
          title="Scan live chart structure and generate real Vertex AI trade signals"
        >
          <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isScanning ? 'animate-spin text-amber-400' : 'text-[#face6f]'}`} />
          <span className="truncate text-[10px] sm:text-xs">{isScanning ? 'SCANNING...' : 'SCAN (VERTEX AI)'}</span>
        </button>

        {/* Start Engine / Stop Engine dynamic executor */}
        <button
          type="button"
          onClick={async () => {
            await onToggleAlgo();
            if (!isAlgoRunning) {
              triggerVertexAIScan();
            }
          }}
          disabled={(connectionStatus !== 'READY' && connectionStatus !== 'CONNECTED' && connectionStatus !== 'SYNCING') || tradeStatus === 'executing'}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 sm:px-4 rounded-xl border text-xs font-mono font-black tracking-wider transition-all cursor-pointer active:scale-95 text-center ${
            isAlgoRunning 
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20 shadow-md shadow-rose-500/5' 
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 shadow-md shadow-emerald-500/5'
          } ${((connectionStatus !== 'READY' && connectionStatus !== 'CONNECTED' && connectionStatus !== 'SYNCING') || tradeStatus === 'executing') ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
        >
          {isAlgoRunning ? (
            <>
              {globalPositions.length > 0 ? (
                <>
                  <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                  <span className="truncate text-[10px] sm:text-xs">ENGINE LOCKED ({globalPositions.length} ACTIVE)</span>
                </>
              ) : (
                <>
                  <Square className="w-3 h-3 fill-rose-400 shrink-0" />
                  <span className="truncate text-[10px] sm:text-xs">STOP ENGINE</span>
                </>
              )}
            </>
          ) : (
            <>
              <Play className="w-3 h-3 fill-emerald-400 text-emerald-400 ml-0.5 shrink-0" />
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

        {/* TRADES CONTROL ADJUSTMENT CAPSULE */}
        <div className="flex-1 flex flex-col items-center justify-center bg-black/60 border border-white/5 rounded-xl py-1 px-2 font-mono text-center relative">
          <span className="text-[7px] text-slate-500 block uppercase font-black tracking-widest mb-0.5 leading-none">TRADES</span>
          <div className="flex items-center justify-between w-full">
            <button 
              type="button"
              onClick={() => setStrategySettings({ maxTrades: Math.max(1, (strategySettings.maxTrades || 1) - 1) })}
              className="p-1 hover:bg-white/5 text-slate-400 hover:text-white rounded-lg active:scale-95 transition-all cursor-pointer select-none"
            >
              <Minus className="w-3 h-3" />
            </button>
            <input 
              type="text"
              inputMode="numeric"
              value={strategySettings.maxTrades ?? 1}
              onChange={(e) => {
                const text = e.target.value;
                if (/^[0-9]*$/.test(text)) {
                  const val = parseInt(text);
                  setStrategySettings({ maxTrades: isNaN(val) ? 1 : Math.max(1, val) });
                }
              }}
              onBlur={() => {
                const val = strategySettings.maxTrades;
                if (!val || val < 1) {
                  setStrategySettings({ maxTrades: 1 });
                }
              }}
              className="w-10 bg-transparent text-xs sm:text-sm font-black text-white text-center outline-none border-0 p-0 focus:ring-0 focus:outline-none"
              style={{ color: 'var(--accent-color)' }}
            />
            <button 
              type="button"
              onClick={() => setStrategySettings({ maxTrades: (strategySettings.maxTrades || 1) + 1 })}
              className="p-1 hover:bg-white/5 text-slate-400 hover:text-white rounded-lg active:scale-95 transition-all cursor-pointer select-none"
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
        
        {/* TradingView-Style prominent SHOW ANALYSIS toggle */}
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
          <button 
            type="button"
            onClick={() => setShowAnalysis(!showAnalysis)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[9px] font-black uppercase tracking-widest border transition-all duration-300 pointer-events-auto backdrop-blur-md cursor-pointer ${
              showAnalysis 
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-bold shadow-lg shadow-emerald-500/5' 
                : 'bg-slate-900/60 border-white/5 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${showAnalysis ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
            SHOW ANALYSIS: {showAnalysis ? 'ON' : 'OFF'}
          </button>
        </div>

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
                  <span className="text-[9px] font-mono font-black text-[#face6f] uppercase tracking-widest block">AI-Calculated Volume & Instrument</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono font-bold text-slate-500 uppercase font-black">AI Lot Size Allocation (Auto)</label>
                      <div className="w-full bg-black/40 border border-white/5 text-xs font-mono text-emerald-400 rounded-xl px-3 py-2 font-black select-none">
                        {lotSize && !isNaN(Number(lotSize)) ? Number(lotSize).toFixed(2) : "Calculating..."} Lots
                      </div>
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
