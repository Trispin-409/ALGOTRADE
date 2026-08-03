
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Shield, 
  RefreshCw,
  AlertCircle,
  Plus,
  Loader2,
  CheckCircle2,
  Lock as LockIcon,
  Cloud,
  Terminal,
  Menu,
  Cpu,
  X,
  Play,
  Moon,
  MoonStar,
  Sun,
  Settings,
  Bell,
  BellOff,
  Activity,
  TrendingUp,
  Users,
  Download,
  Folder
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PlatformType, TradingAccount } from './types';
import Dashboard from './components/Dashboard';
import CommandCenter, { AGENTS_CONFIG } from './components/CommandCenter';
import Sidebar from './components/Sidebar';
import AccountConfig from './components/AccountConfig';
import News from './components/News';
import RiskManagement from './components/RiskManagement';
import ChatradeAI from './components/ChatradeAI';
  // Remove ea-deployer state

import SystemMonitor from './components/SystemMonitor';
import { EvidencePackageViewer } from './src/components/EvidencePackageViewer';
import { ExpertLogPanel } from './components/ExpertLogPanel';
import MarketData from './components/MarketData';
import OpenPositionsView from './components/OpenPositionsView';
import ChartSettings from './components/ChartSettings';
import { ErrorBoundary } from './components/ErrorBoundary';
import VertexCostAuditor from './components/VertexCostAuditor';
import { connectionManager, TradingPhase } from './src/lib/ConnectionManager';
import { safeFetch } from './src/lib/utils';
import { supabase } from './src/lib/supabase';
import { LoginForm } from './src/components/Auth/LoginForm';
import { ResetPasswordForm } from './src/components/Auth/ResetPasswordForm';
import { FullScreenLoader } from './src/components/Auth/FullScreenLoader';
import { useStore, calculateTradingSession } from './src/store';
import { PricingPage } from './src/components/PricingPage';
import { AdminDashboard } from './components/AdminDashboard';
import { useNewsNotificationMonitor } from './src/hooks/useNewsNotificationMonitor';
import { NotificationCenter } from './src/components/NotificationCenter';
import { NewsPushToast } from './src/components/NewsPushToast';

// No explicit SDK_URL needed for same-origin SDK proxy

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [bootData, setBootData] = useState<any>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [loadingBootstrap, setLoadingBootstrap] = useState(false);
  const [isEvidenceViewerOpen, setIsEvidenceViewerOpen] = useState(false);


  // Refs to track in-flight operations to prevent concurrent/overlapping duplicate requests
  const pendingModifiesRef = useRef<Set<string>>(new Set());
  const pendingClosesRef = useRef<Set<string>>(new Set());
  const pendingRescuesRef = useRef<Set<string>>(new Set());
  const rescuedPositionsRef = useRef<Set<string>>(new Set());

  // Zustand State
  const setConnectionStatus = useStore(state => state.setConnectionStatus);
  const updateAccount = useStore(state => state.updateAccount);
  const connectionStatus = useStore(state => state.connectionStatus);
  const globalHistory = useStore(state => state.history);
  const chartSettings = useStore(state => state.chartSettings);
  const tokenMetrics = useStore(state => state.tokenMetrics);

  // Sync accent color CSS variables
  useEffect(() => {
    if (chartSettings.accentColor) {
      document.documentElement.style.setProperty('--accent-color', chartSettings.accentColor);
      
      // Convert hex to RGB for opacity usage
      const hex = chartSettings.accentColor.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        document.documentElement.style.setProperty('--accent-color-rgb', `${r}, ${g}, ${b}`);
      }
    }
  }, [chartSettings.accentColor]);

  // Sync theme class to document element
  useEffect(() => {
    const currentTheme = chartSettings.theme || 'dark';
    if (currentTheme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  }, [chartSettings.theme]);

  // Compute theme based on streak
  const streakThemeClasses = React.useMemo(() => {
    if (!globalHistory || globalHistory.length === 0) return 'shadow-[inset_0_0_100px_rgba(0,0,0,0.5)]';
    let winStreak = 0;
    let loseStreak = 0;
    for (const t of globalHistory) {
      if (t.profit > 0) {
        if (loseStreak > 0) break;
        winStreak++;
      } else if (t.profit < 0) {
        if (winStreak > 0) break;
        loseStreak++;
      }
    }
    if (winStreak >= 3) return 'shadow-[inset_0_0_150px_rgba(16,185,129,0.15)] bg-emerald-900/5';
    if (loseStreak >= 3) return 'shadow-[inset_0_0_150px_rgba(244,63,94,0.15)] bg-rose-900/5';
    return 'shadow-[inset_0_0_100px_rgba(0,0,0,0.5)]';
  }, [globalHistory]);

  const authReadyRef = useRef(false);

  useEffect(() => {
    if (authReadyRef.current) return;
    authReadyRef.current = true;

    supabase.auth.getSession().then(({ data, error }: any) => {
      if (error) {
        console.warn("[AUTH] Initial getSession error:", error.message);
        if (error.message?.toLowerCase().includes('refresh token') || error.message?.toLowerCase().includes('invalid')) {
          supabase.auth.signOut().catch(() => {});
          try { localStorage.clear(); } catch(e) {}
        }
        setSession(null);
      } else {
        setSession(data?.session || null);
      }
      setLoadingAuth(false);
    }).catch((err: any) => {
      console.warn("[AUTH] getSession exception:", err);
      setSession(null);
      setLoadingAuth(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setLoadingAuth(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    useStore.getState().setCurrentUserEmail(session?.user?.email || null);
  }, [session]);

  useEffect(() => {
    if (!session || (bootData && !window.location.search.includes('activated=true'))) return;
    setLoadingBootstrap(true);

    const url = "/api/user/bootstrap" + (window.location.search.includes('activated=true') ? `?t=${Date.now()}` : '');

    safeFetch(url, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    })
    .then(data => {
      setBootData(data);
      if (data.execution_modes) {
        setExecutionModes(data.execution_modes);
      }
      if (data.chart_settings) {
        console.log("[PREFS] Overriding chart settings from database load", data.chart_settings);
        useStore.getState().setChartSettings(data.chart_settings);
      }
      if (data.strategy_settings) {
        console.log("[PREFS] Overriding strategy settings from database load", data.strategy_settings);
        useStore.getState().setStrategySettings(data.strategy_settings);
      }
      if (data.token_metrics) {
        console.log("[PREFS] Overriding token metrics from database load");
        useStore.getState().setTokenMetrics(() => data.token_metrics);
      }
      if (window.location.search.includes('activated=true')) {
        window.history.replaceState({}, '', '/');
      }
    })
    .catch(err => {
      addLog(`FATAL: Failed to retrieve system configuration: ${err.message}`);
      setBootError(err.message);
    })
    .finally(() => {
      setLoadingBootstrap(false);
    });
  }, [session, bootData]);

  // Global State
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'chatrade');

  // Redirection guard for Starter plan users who should not have access to Chatrade AI (owner bypassed)
  useEffect(() => {
    if (bootData) {
      const email = session?.user?.email || 'trispinblackops@gmail.com';
      const plan = bootData.subscription_plan || 'Starter';
      const isOwner = email.toLowerCase() === 'trispinblackops@gmail.com';
      const isStarter = plan.toLowerCase() === 'starter';
      const hasChatradeAccess = isOwner || !isStarter;

      if (!hasChatradeAccess && activeTab === 'chatrade') {
        setActiveTab('dashboard');
      }
    }
  }, [bootData, session, activeTab]);

  const { setAgentStatus, addAgentLog, addActivity } = useStore();

  useEffect(() => {
    const getMultiTimeframeAnalysis = (currentTf: string, currentTrend: 'Bullish' | 'Bearish') => {
      const isBull = currentTrend === 'Bullish';
      const analysis: { [tf: string]: { trend: string; structure: string; momentum: string; bias: string } } = {};

      const tfOrder = ['W1', 'D1', 'H4', 'H1', 'M15', 'M5', 'M1'];
      const baseTf = currentTf.toUpperCase().replace('M', '');
      const currentIndex = tfOrder.findIndex(t => t.toUpperCase().includes(baseTf) || baseTf.includes(t.toUpperCase()));
      const baseIndex = currentIndex >= 0 ? currentIndex : 3;

      tfOrder.forEach((tf, index) => {
        let trend = isBull ? 'Bullish' : 'Bearish';
        let structure = isBull ? 'BOS' : 'CHoCH';
        let momentum = 'Medium';
        let bias = isBull ? 'Buy' : 'Sell';

        if (index < 2) {
          if (baseIndex >= 3) {
            trend = isBull ? 'Strong Bullish' : 'Strong Bearish';
            structure = 'Support Block';
            momentum = 'High';
          } else {
            trend = isBull ? 'Bullish' : 'Bearish';
            structure = isBull ? 'Order Block' : 'Breaker Block';
            momentum = 'High';
          }
        } else if (index >= 2 && index <= 3) {
          if (index === baseIndex) {
            trend = isBull ? 'Bullish' : 'Bearish';
            structure = isBull ? 'Demand Zone' : 'Supply Zone';
            momentum = 'High';
          } else if (index < baseIndex) {
            trend = isBull ? 'Bullish' : 'Bearish';
            structure = isBull ? 'BOS' : 'CHoCH';
            momentum = 'Medium';
          } else {
            trend = isBull ? 'Strong Bullish' : 'Strong Bearish';
            structure = isBull ? 'Order Block' : 'Mitigation Block';
            momentum = 'High';
          }
        } else {
          if (index === baseIndex) {
            trend = isBull ? 'Bullish' : 'Bearish';
            structure = isBull ? 'Demand Block' : 'Supply Block';
            momentum = 'High';
          } else if (index > baseIndex) {
            trend = isBull ? 'Strong Bullish' : 'Strong Bearish';
            structure = 'Liquidity Sweep';
            momentum = 'High';
          } else {
            trend = isBull ? 'Bullish' : 'Bearish';
            structure = 'Order Block';
            momentum = 'Medium';
          }
        }

        analysis[tf] = { trend, structure, momentum, bias };
      });

      return analysis;
    };

    const interval = setInterval(() => {
      const curAccountId = selectedAccountIdRef.current;
      const curSession = sessionRef.current;

      // 1. Live Vertex AI Dynamic Trailing Stop & Profit Protection Engine (+1% / +2% Auto-Lock)
      if (curAccountId && curSession) {
        const currentPositions = useStore.getState().positions || [];
        const accountInfo = useStore.getState().account;
        const accountEquity = Math.max(10, Number(accountInfo?.equity || accountInfo?.balance || 1000));

        currentPositions.forEach(async (pos: any) => {
          const posIdStr = String(pos.id);
          if (pendingModifiesRef.current.has(posIdStr)) return;

          const currentPrice = Number(pos.currentPrice || pos.closePrice);
          
          // Dynamically compute symbol metrics (pip size and digits precision)
          const getSymbolMetrics = (symbol: string, price: number) => {
            const sym = symbol.toUpperCase();
            let pSize = 0.0001;
            let digs = 5;

            if (sym.includes('JPY')) {
              pSize = 0.01;
              digs = 3;
            } else if (sym.includes('XAU') || sym.includes('GOLD')) {
              pSize = 0.1;
              digs = 2;
            } else if (sym.includes('XAG') || sym.includes('SILVER')) {
              pSize = 0.01;
              digs = 3;
            } else if (sym.includes('BTC') || sym.includes('BTCUSD')) {
              pSize = 1.0;
              digs = 2;
            } else if (sym.includes('ETH')) {
              pSize = 0.1;
              digs = 2;
            } else if (
              sym.includes('US30') || sym.includes('WS30') ||
              sym.includes('NAS100') || sym.includes('USTEC') || sym.includes('NDX') ||
              sym.includes('SPX') || sym.includes('US500') ||
              sym.includes('DAX') || sym.includes('DE30') || sym.includes('GER30')
            ) {
              pSize = 1.0;
              digs = 2;
            } else {
              if (price > 20000) {
                pSize = 1.0;
                digs = 2;
              } else if (price > 1000) {
                pSize = 0.1;
                digs = 2;
              } else if (price > 50) {
                pSize = 0.01;
                digs = 3;
              }
            }
            return { pipSize: pSize, digits: digs };
          };

          const { pipSize, digits } = getSymbolMetrics(pos.symbol, currentPrice);
          const currentProfitDollars = Number(pos.profit || 0);
          const entryPrice = Number(pos.openPrice);
          const isBuy = pos.type === 'BUY' || pos.type === 'buy' || pos.type === 0 || pos.type === 'POSITION_TYPE_BUY';
          const currentPipsProfit = isBuy ? (currentPrice - entryPrice) : (entryPrice - currentPrice);

          // Profit percentage relative to account equity
          const profitPercent = (currentProfitDollars / accountEquity) * 100;
          const currentSL = Number(pos.stopLoss);

          let targetSL = 0;
          let shouldModify = false;

          // Condition 1: Profit >= +2.0% -> Lock in at least +1.0% profit using trailing stop
          if (profitPercent >= 2.0 || currentPipsProfit >= 20 * pipSize) {
            const trailingOffset = Math.max(10 * pipSize, currentPipsProfit * 0.5);
            targetSL = isBuy ? (currentPrice - trailingOffset) : (currentPrice + trailingOffset);
            
            // Ensure targetSL protects at least 1% profit buffer above entry
            const dollarValuePerPip = Math.max(0.1, Number(pos.volume) * 10);
            const onePercentPips = ((accountEquity * 0.01) / dollarValuePerPip) * pipSize;
            const lockPrice = isBuy ? (entryPrice + onePercentPips) : (entryPrice - onePercentPips);
            targetSL = isBuy ? Math.max(lockPrice, targetSL) : Math.min(lockPrice, targetSL);
            
            shouldModify = !currentSL || (isBuy ? (targetSL > currentSL + 0.1 * pipSize) : (targetSL < currentSL - 0.1 * pipSize));
          } 
          // Condition 2: Profit >= +1.0% -> Secure at Break-Even / +1% profit protection
          else if (profitPercent >= 1.0 || currentPipsProfit >= 10 * pipSize) {
            const breakEvenPrice = entryPrice;
            const targetTrailingSL = isBuy ? (currentPrice - 8 * pipSize) : (currentPrice + 8 * pipSize);
            targetSL = isBuy ? Math.max(breakEvenPrice, targetTrailingSL) : Math.min(breakEvenPrice, targetTrailingSL);
            
            shouldModify = !currentSL || (isBuy ? (targetSL > currentSL + 0.1 * pipSize) : (targetSL < currentSL - 0.1 * pipSize));
          }

          if (shouldModify && targetSL > 0) {
            const formattedSL = Number(targetSL.toFixed(digits));
            console.log(`[VERTEX AI TRAIL ENGINE] Modifying SL for pos #${pos.id} (${pos.symbol}) to ${formattedSL} (Profit: +${profitPercent.toFixed(2)}%)`);
            try {
              pendingModifiesRef.current.add(posIdStr);
              const res = await safeFetch('/api/trade/modify', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${curSession.access_token}`
                },
                body: JSON.stringify({
                  accountId: curAccountId,
                  positionId: pos.id,
                  stopLoss: formattedSL
                })
              });
              if (res?.success) {
                const logMsg = `[${new Date().toLocaleTimeString()}] Vertex AI Trailing Stop: SL for ${pos.symbol} (#${pos.id}) secured at ${formattedSL} (+${profitPercent.toFixed(2)}% profit protected)`;
                addActivity(logMsg);
              }
            } catch (e) {
              console.error("Modify SL error:", e);
            } finally {
              pendingModifiesRef.current.delete(posIdStr);
            }
          }
        });
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [bootData, session]);

  useEffect(() => {
    // Only real data is used. The simulated interval has been removed.
  }, []);

  const [adminSubTab, setAdminSubTab] = useState<'keys' | 'users' | 'logs'>('keys');
  const [accounts, setAccounts] = useState<TradingAccount[]>(() => {
    try {
      const cached = localStorage.getItem('accounts_cache');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthValid, setIsAuthValid] = useState<boolean | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(() => {
    return localStorage.getItem('desktop_sidebar_open') !== 'false';
  });
  const [openPositions, setOpenPositions] = useState<number>(0);
  const isAlgoTradeRunning = useStore(state => state.isAutoTrade);
  const setIsAlgoTradeRunning = (val: boolean) => useStore.getState().setIsAutoTrade(val);
  const storePositions = useStore(state => state.positions);
  const [selectedAccountId, setSelectedAccountId] = useState(() => {
    const val = localStorage.getItem('selectedAccountId');
    if (val && val.length > 200) {
      localStorage.removeItem('selectedAccountId');
      return '';
    }
    return val || '';
  });

  const accountsRef = useRef(accounts);
  const selectedAccountIdRef = useRef(selectedAccountId);
  const sessionRef = useRef(session);
  const trendDivergenceWarningRef = useRef<boolean>(false);
  useEffect(() => {
    accountsRef.current = accounts;
    selectedAccountIdRef.current = selectedAccountId;
    sessionRef.current = session;
  }, [accounts, selectedAccountId, session]);

  // Session-Based Account Balance Cache Service
  useEffect(() => {
    if (!selectedAccountId) return;
    const activeAcc = accounts.find(a => a.id === selectedAccountId);
    if (!activeAcc) return;

    const currentBalance = Number(activeAcc.balance);
    const currentEquity = Number(activeAcc.equity);
    if (isNaN(currentBalance) || currentBalance <= 0) return;

    let cache: { 
      [accountId: string]: { 
        originalBalance: number; 
        timestamp: number;
        lastPositionsCount?: number;
        lastPositionIds?: string[];
        lastBalance?: number;
        lastEquity?: number;
        lastFloatingPnL?: number;
        realizedLossToday?: number;
        unrealizedLoss?: number;
      } 
    } = {};

    try {
      const saved = localStorage.getItem('chatrade_account_balances_cache');
      if (saved) {
        cache = JSON.parse(saved);
      }
    } catch (e) {
      console.error("[BALANCE CACHE] Failed to parse cached balances:", e);
    }

    const currentPositions = storePositions || [];
    const hasPositions = currentPositions.length > 0;
    const currentPositionIds = currentPositions.map((p: any) => p.id.toString()).sort();
    const currentFloatingPnL = currentPositions.reduce((sum: number, p: any) => sum + Number(p.profit || 0), 0);

    let cachedData = cache[selectedAccountId];

    if (!hasPositions) {
      // No active positions: update baseline balance to current balance so it is ready for next trade initiation
      if (!cachedData || cachedData.originalBalance !== currentBalance) {
        cachedData = {
          originalBalance: currentBalance,
          timestamp: Date.now(),
          lastPositionsCount: 0,
          lastPositionIds: [],
          lastBalance: currentBalance,
          lastEquity: currentEquity,
          lastFloatingPnL: 0,
          realizedLossToday: 0,
          unrealizedLoss: 0
        };
        cache[selectedAccountId] = cachedData;
        localStorage.setItem('chatrade_account_balances_cache', JSON.stringify(cache));
        console.log(`[BALANCE CACHE] Reset/Updated baseline balance for account ${selectedAccountId} to $${currentBalance} (no active positions)`);
      }
    } else {
      // Active positions exist: freeze the originalBalance from before the trades if it exists, otherwise seed it now
      if (!cachedData) {
        cachedData = {
          originalBalance: currentBalance,
          timestamp: Date.now(),
          lastPositionsCount: currentPositions.length,
          lastPositionIds: currentPositionIds,
          lastBalance: currentBalance,
          lastEquity: currentEquity,
          lastFloatingPnL: currentFloatingPnL,
          realizedLossToday: 0,
          unrealizedLoss: currentBalance - currentEquity
        };
        cache[selectedAccountId] = cachedData;
        localStorage.setItem('chatrade_account_balances_cache', JSON.stringify(cache));
        console.log(`[BALANCE CACHE] Seeded frozen baseline balance for account ${selectedAccountId} to $${currentBalance} (trades active)`);
      }
    }

    // Perform Deep Comparison of before vs after trade events
    const prevPositionIds = cachedData.lastPositionIds || [];
    const prevBalance = cachedData.lastBalance !== undefined ? cachedData.lastBalance : currentBalance;
    const prevEquity = cachedData.lastEquity !== undefined ? cachedData.lastEquity : currentEquity;
    const prevFloatingPnL = cachedData.lastFloatingPnL !== undefined ? cachedData.lastFloatingPnL : 0;

    // Check if a trade event occurred (open, close, or position IDs changed)
    const positionIdsChanged = JSON.stringify(prevPositionIds) !== JSON.stringify(currentPositionIds);
    if (positionIdsChanged) {
      const addedIds = currentPositionIds.filter(id => !prevPositionIds.includes(id));
      const removedIds = prevPositionIds.filter(id => !currentPositionIds.includes(id));
      
      console.log(`[TRADE EVENT] Detected position structure change on account ${selectedAccountId}:`, {
        event: addedIds.length > 0 && removedIds.length > 0 ? "REPLACE" : addedIds.length > 0 ? "OPEN" : "CLOSE",
        addedPositions: addedIds,
        removedPositions: removedIds,
        before: {
          balance: prevBalance,
          equity: prevEquity,
          floatingPnL: prevFloatingPnL,
          positionsCount: prevPositionIds.length
        },
        after: {
          balance: currentBalance,
          equity: currentEquity,
          floatingPnL: currentFloatingPnL,
          positionsCount: currentPositions.length
        },
        balanceDelta: currentBalance - prevBalance,
        equityDelta: currentEquity - prevEquity,
        floatingPnLDelta: currentFloatingPnL - prevFloatingPnL
      });

      const balanceDelta = currentBalance - prevBalance;
      if (Math.abs(balanceDelta) > 0.01) {
        const deltaStr = balanceDelta > 0 ? `+$${balanceDelta.toFixed(2)}` : `-$${Math.abs(balanceDelta).toFixed(2)}`;
        addActivity(`[${new Date().toLocaleTimeString()}] Trade event balance change: ${deltaStr} (realized). New balance: $${currentBalance.toFixed(2)}.`);
      }
    }

    // Always compute realizedLossToday against the snapshot baseline balance captured when trade was first initiated
    const originalBalance = cachedData.originalBalance;
    const realizedLossToday = originalBalance - currentBalance; 
    const unrealizedLoss = currentBalance - currentEquity;

    // Update current tick data in cache
    cachedData.lastPositionsCount = currentPositions.length;
    cachedData.lastPositionIds = currentPositionIds;
    cachedData.lastBalance = currentBalance;
    cachedData.lastEquity = currentEquity;
    cachedData.lastFloatingPnL = currentFloatingPnL;
    cachedData.realizedLossToday = realizedLossToday;
    cachedData.unrealizedLoss = unrealizedLoss;

    cache[selectedAccountId] = cachedData;
    localStorage.setItem('chatrade_account_balances_cache', JSON.stringify(cache));
  }, [selectedAccountId, accounts, storePositions]);

  const [tradingStatus, setTradingStatus] = useState<string>('INIT');
  const [availableBrokerSymbols, setAvailableBrokerSymbols] = useState<string[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState(() => {
    const val = localStorage.getItem('selectedSymbol');
    if (val && val.length > 50) {
      localStorage.removeItem('selectedSymbol');
      return 'XAUUSDm';
    }
    return val || 'XAUUSDm';
  });

  // Sync selectedSymbol with store strategy settings
  useEffect(() => {
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
      Notification.requestPermission();
    }
    const currentStoreSymbol = useStore.getState().strategySettings.symbol;
    if (selectedSymbol && selectedSymbol !== currentStoreSymbol) {
      useStore.getState().setStrategySettings({ symbol: selectedSymbol });
    }
  }, [selectedSymbol]);

  // SMART PROACTIVE SYMBOL NORMALIZATION ENGINE (Exness vs Standard Broker)
  useEffect(() => {
    if (!selectedAccountId || accounts.length === 0 || !selectedSymbol) return;
    const activeAcc = accounts.find(a => a.id === selectedAccountId);
    if (!activeAcc) return;

    const serverName = activeAcc.server || '';
    const isExness = serverName.toLowerCase().includes('exness');
    const normSelected = selectedSymbol.toUpperCase();
    const cleanBase = normSelected.replace(/[M\.#+\.\$]/g, ''); // Extract base like XAUUSD

    if (!isExness) {
      // Strip Exness suffixes (m, .m, _m, .x) if present on a non-Exness server
      if (selectedSymbol.endsWith('m') || selectedSymbol.endsWith('.m') || selectedSymbol.endsWith('_m') || selectedSymbol.endsWith('.x')) {
        const matchBase = cleanBase === 'XAUUSD' || cleanBase === 'GOLD' ? 'XAUUSD' : cleanBase;
        console.log(`[PROACTIVE-FIX] Non-Exness server detected (${serverName}). Stripping suffix: ${selectedSymbol} -> ${matchBase}`);
        setSelectedSymbol(matchBase);
        localStorage.setItem('selectedSymbol', matchBase);
      }
    } else {
      // Exness server detected. Ensure we use the 'm' suffix
      if (selectedSymbol === 'XAUUSD' || selectedSymbol === 'GOLD') {
        console.log(`[PROACTIVE-FIX] Exness server detected (${serverName}). Adding 'm' suffix: ${selectedSymbol} -> XAUUSDm`);
        setSelectedSymbol('XAUUSDm');
        localStorage.setItem('selectedSymbol', 'XAUUSDm');
      }
    }
  }, [selectedAccountId, accounts, selectedSymbol]);
  const [selectedTimeframe, setSelectedTimeframe] = useState(() => localStorage.getItem('selectedTimeframe') || '1m');

  // Sync selectedTimeframe with store strategy settings
  useEffect(() => {
    const currentStoreTimeframe = useStore.getState().strategySettings.timeframe;
    if (selectedTimeframe && selectedTimeframe !== currentStoreTimeframe) {
      useStore.getState().setStrategySettings({ timeframe: selectedTimeframe });
    }
  }, [selectedTimeframe]);

  // Real-Time UTC trading session synchronization engine
  useEffect(() => {
    const updateSession = () => {
      const details = calculateTradingSession();
      const sessionString = `${details.currentSession} | ${details.killZone !== "None" ? details.killZone : "Standard Liquidity"} | AMD: ${details.amdPhase}`;
      const store = useStore.getState();
      if (store.marketSession !== sessionString) {
        store.setMarketSession(sessionString);
      }
    };
    updateSession();
    const interval = setInterval(updateSession, 1000);
    return () => clearInterval(interval);
  }, []);

  const [isDNDActive, setIsDNDActive] = useState(() => localStorage.getItem('isDNDActive') === 'true');
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);
  const [isFabPanelOpen, setIsFabPanelOpen] = useState(false);
  const unreadPushCount = useStore(state => state.unreadPushCount);

  const {
    notificationPermission,
    requestPermission,
    activeToastAlert,
    dismissToast,
    triggerTestNotification,
  } = useNewsNotificationMonitor(selectedSymbol || 'XAUUSDm', isDNDActive);
  const [syncedAccountIds, setSyncedAccountIds] = useState<Set<string>>(new Set());
  const [eaStatuses, setEaStatuses] = useState<Record<string, { deployed: boolean; status: string }>>({});
  const lastPriceRef = useRef<Map<string, any>>(new Map()); // symbol -> price data
  const retryMapRef = useRef<Map<string, { attempts: number, nextAttemptTime: number }>>(new Map());
  const isConnectingRef = useRef<boolean>(false);
  const [sdkStatus, setSdkStatus] = useState<'CONNECTED' | 'RECONNECTING' | 'DEGRADED' | 'OFFLINE' | 'BOOTING' | 'SYNCING'>('CONNECTED');
  const [executionModes, setExecutionModes] = useState<Record<string, 'EA' | 'STRATEGY'>>({});

  // Enforcement: Ensure active account is in STRATEGY mode for this session
  useEffect(() => {
    if (selectedAccountId && executionModes[selectedAccountId] !== 'STRATEGY') {
      setExecutionModes(prev => ({ ...prev, [selectedAccountId]: 'STRATEGY' }));
      connectionManager.switchMode(selectedAccountId, 'STRATEGY');
    }
  }, [selectedAccountId, executionModes]);

  // EA Status Polling (Orchestration Plane) with Backoff on 429 Rate Limits
  useEffect(() => {
    if (!selectedAccountId || !session) return;
    
    let timerId: any = null;
    let currentDelay = 15000;
    const minDelay = 15000;
    const maxDelay = 60000;
    let isActive = true;

    const fetchStatus = async () => {
      if (!selectedAccountId || !isActive) return;
      try {
        const url = `/api/account/${encodeURIComponent(selectedAccountId)}/status`;
        const data = await safeFetch(url);
        if (data && isActive) {
           setEaStatuses(prev => ({ ...prev, [selectedAccountId]: data }));
           // Sync engineState and engineSession
           if (data.engineState) {
              useStore.getState().setEngineState(data.engineState);
           }
           if (data.engineSession) {
              useStore.getState().setEngineSession(data.engineSession);
           }
           // Sync algo running state with terminal state if in EA mode
           if (executionModes[selectedAccountId] === 'EA') {
              setIsAlgoTradeRunning(data.status === 'ACTIVE' || data.status === 'RUNNING' || data.algoRunning === true);
           } else {
              setIsAlgoTradeRunning(data.engineState === 'RUNNING');
           }
           // Reset backoff delay on successful fetch
           currentDelay = minDelay;
        }
      } catch (err: any) {
        if (!isActive) return;
        const errMsg = err.message || '';
        const isRateLimit = errMsg.includes('429') || errMsg.toLowerCase().includes('rate exceeded') || errMsg.toLowerCase().includes('too many requests');
        const isNetworkError = errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError');

        if (isRateLimit) {
          // Double the delay on rate limit, up to maxDelay
          currentDelay = Math.min(maxDelay, currentDelay * 2);
          addLog?.(`HEALTH: Status poll rate limited. Backing off to ${currentDelay / 1000}s.`);
          console.warn(`[POLL] Status poll rate limited. Backing off to ${currentDelay / 1000}s:`, err);
        } else if (!isNetworkError) {
          addLog?.(`HEALTH: Status poll for ${selectedAccountId} failed: ${err.message}`);
          console.warn(`[POLL] Status warning:`, err); // Log as warning to keep console status clean
        }
      } finally {
        if (isActive && selectedAccountId && session) {
          timerId = setTimeout(fetchStatus, currentDelay);
        }
      }
    };
    
    fetchStatus();
    
    return () => {
      isActive = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [selectedAccountId, session, executionModes]);

  const addLog = useCallback((msg: string) => {
    // DND Filter: Suppress non-critical messages
    if (isDNDActive && (
      msg.startsWith('STREAM:') || 
      msg.startsWith('HEALTH:') || 
      msg.startsWith('BROKER:') || 
      msg.startsWith('RPC:') ||
      msg.startsWith('STRATEGY:') ||
      msg.startsWith('DATA:')
    ) && !msg.includes('ERROR') && !msg.includes('FATAL')) {
      return;
    }
    
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 199)]);
  }, [isDNDActive]);

  const handleAccountSelect = useCallback((id: string) => {
    // 1. BLOCK: Hard dependency on bootData AND session
    if (!bootData || !session) {
       console.warn(`[LIFECYCLE] Configuration or Session not yet available. Deferred boot for ${id}.`);
       return;
    }

    // 2. RESOLVE: The WebSocket connection must go to our own server, not MetaApi domain
    const serverUrl = window.location.origin;
    
    useStore.getState().setHistory([]); // Purge history on account switch
    
    // Smooth Transition Cache: load cached positions of selected account instantly to prevent flickering
    const cachedPositionsKey = `positions:${session?.user?.email}:${id}`;
    let seeded = false;
    try {
      const cached = localStorage.getItem(cachedPositionsKey);
      if (cached) {
        useStore.getState().setPositions(JSON.parse(cached));
        seeded = true;
      }
    } catch(e) {}
    if (!seeded) {
      useStore.getState().setPositions([]); // Purge positions early if no cache
    }

    setSelectedAccountId(id);
    localStorage.setItem('selectedAccountId', id);
    
    const fetchAlgoStatus = async () => {
       try {
         const data = await safeFetch(`/api/account/${encodeURIComponent(id)}/status`, {
           headers: { Authorization: `Bearer ${session.access_token}` }
         });
         
         if (data && data.algoRunning !== undefined) {
           setIsAlgoTradeRunning(data.algoRunning);
         }

         if (data.state !== 'DEPLOYED' || data.connectionStatus !== 'CONNECTED') {
           console.warn(`[LIFECYCLE] Account ${id} is not fully active (${data.state}, ${data.connectionStatus}). Booting websocket connection anyway to stream initialization states...`);
         }
         
         try {
           // 3. EXECUTE: Single entry point to connection manager
           connectionManager.bootOnce(id, serverUrl, session.access_token);
         } catch (err: any) {
           addLog(`FATAL: ${err.message}`);
           setTradingStatus('CONFIG_ERROR');
         }
       } catch (e) {
         console.warn("[LIFECYCLE] Failed to sync algo status", e);
       }
    };
    fetchAlgoStatus();
  }, [bootData, addLog, session]);

  // Helper to determine if trading is ready
  const isTradingReady = useCallback((status: string) => {
    return status === 'READY' || status === 'SYNCING';
  }, []);

  // Unified Bootstrapper: Only fire once we have BOTH an ID and bootData
  useEffect(() => {
    if (!bootData || !session) return;
    
    const savedId = localStorage.getItem('selectedAccountId');
    if (savedId && accounts.some(a => a.id === savedId)) {
       handleAccountSelect(savedId);
    } else if (accounts.length > 0) {
       handleAccountSelect(accounts[0].id);
    }
  }, [bootData, handleAccountSelect, accounts.length, session]);

  useEffect(() => {
    if (!selectedAccountId) return;
    const unsubStatus = connectionManager.subscribeStatus(selectedAccountId, (status: boolean) => {
      // WS status is now secondary to actual SDK status from backend
    });

    const unsubPhase = connectionManager.subscribePhase((phase) => {
      setTradingStatus(phase);
      if (phase === TradingPhase.ACCOUNT_READY || phase === TradingPhase.STREAMING) {
          setConnectionStatus('READY');
          setSdkStatus('CONNECTED');
      } else if (phase === TradingPhase.ACCOUNT_SYNCING) {
          setConnectionStatus('SYNCING');
          setSdkStatus('SYNCING');
      } else if (phase === TradingPhase.CONNECTING_META || phase === TradingPhase.META_CONNECTED) {
          setConnectionStatus('CONNECTING');
          setSdkStatus('BOOTING');
      } else if (phase === TradingPhase.INIT) {
          setConnectionStatus('OFFLINE');
      } else {
          setConnectionStatus('INIT');
      }
    });

    const unsubData = connectionManager.subscribe((data: any) => {
      if (data.type === 'status:update') {
          if (data.accountId === selectedAccountId) {
              setSdkStatus(data.status === 'SYNCHRONIZED' ? 'CONNECTED' : data.status);
          }
          setAccounts(prev => prev.map(acc => {
            if (acc.id === data.accountId) {
              const newStatus = (data.status === 'SYNCHRONIZED' || data.status === 'READY') ? 'CONNECTED' : data.status;
              return { ...acc, connectionStatus: newStatus };
            }
            return acc;
          }));
      }
      if (data.type === 'ERROR') {
          addLog(`SYSTEM: ${data.message}`);
      }
      if (data.type === 'EXECUTION_MODE_UPDATE') {
        setExecutionModes(prev => ({ ...prev, [data.accountId]: data.mode }));
      }
      if (data.type === 'ACCOUNT_READY') {
        if (data.accountId) {
          connectionManager.setAccountSyncComplete(data.accountId);
          
          setAccounts(prev => prev.map(acc => 
            acc.id === data.accountId ? { ...acc, connectionStatus: 'CONNECTED', ready: true } : acc
          ));

          // TRIGGER: Re-fetch account status immediately upon sync completion
          verifyAndFetch();
        }
      } else if (data.type === 'ACCOUNT_CONNECTING') {
        // ... handled by phase subscription
      }

      if (data.type === 'account:update') {
        const { accountId, balance, equity, margin, freeMargin, marginLevel, currency } = data;
        console.log(`[WS] Account Update for ${accountId}:`, { balance, equity, margin, freeMargin, marginLevel, currency });
        
        // ZUSTAND SOURCE OF TRUTH Update
        if (accountId === selectedAccountId) {
            const updatePayload: any = {};
            if (balance !== null && balance !== undefined) updatePayload.balance = Number(balance);
            if (equity !== null && equity !== undefined) updatePayload.equity = Number(equity);
            if (margin !== null && margin !== undefined) updatePayload.margin = Number(margin);
            if (freeMargin !== null && freeMargin !== undefined) updatePayload.freeMargin = Number(freeMargin);
            if (marginLevel !== null && marginLevel !== undefined) updatePayload.marginLevel = Number(marginLevel);
            if (currency) updatePayload.currency = currency;
            
            if (Object.keys(updatePayload).length > 0) {
              updateAccount(updatePayload);
            }
        }
        
        setAccounts(prev => {
          const updated = prev.map(acc => {
            if (acc.id === accountId) {
              const isNowReady = acc.ready || (balance !== undefined && Number(balance) > 0 && (currency !== undefined || acc.currency));
              return {
                ...acc,
                // STATE-PRESERVING MERGE: Strict validation to prevent field nullification or reset to 0
                balance: (balance !== undefined && balance !== null) ? Number(balance) : acc.balance,
                equity: (equity !== undefined && equity !== null) ? Number(equity) : acc.equity,
                margin: (margin !== undefined && margin !== null) ? Number(margin) : acc.margin,
                freeMargin: (freeMargin !== undefined && freeMargin !== null) ? Number(freeMargin) : acc.freeMargin,
                marginLevel: (marginLevel !== undefined && marginLevel !== null) ? Number(marginLevel) : acc.marginLevel,
                currency: currency !== undefined ? currency : acc.currency,
                connectionStatus: isNowReady ? 'CONNECTED' : acc.connectionStatus,
                ready: Boolean(isNowReady)
              };
            }
            return acc;
          });
          return updated;
        });
      }

      if (data.type === 'TRADING_JOURNAL') {
        const payloadStr = Object.keys(data.metadata || {}).length > 0 ? JSON.stringify(data.metadata) : '';
        addLog(`[STRATEGY][${data.level}] ${data.message} ${payloadStr}`);
        
        // Push notification for signals or major alerts
        if (data.level === 'SIGNAL' || data.level === 'ALERT') {
          // Play a native beep sound
          try {
             const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
             const oscillator = audioContext.createOscillator();
             const gainNode = audioContext.createGain();
             oscillator.connect(gainNode);
             gainNode.connect(audioContext.destination);
             oscillator.type = 'sine';
             oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
             oscillator.frequency.exponentialRampToValueAtTime(1760, audioContext.currentTime + 0.1);
             gainNode.gain.setValueAtTime(0, audioContext.currentTime);
             gainNode.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 0.05);
             gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
             oscillator.start(audioContext.currentTime);
             oscillator.stop(audioContext.currentTime + 0.3);
          } catch(e) { console.error("Audio play failed", e); }

          if ("Notification" in window && Notification.permission === "granted") {
            let bodyText = payloadStr;
            if (data.metadata && data.metadata.confidence) {
                bodyText = `Confidence: ${data.metadata.confidence}%\nConfluences: ${(data.metadata.confluences || []).join(', ')}`;
            }
            new Notification(`🔥 STRATEGY ${data.level}: ${data.message}`, {
              body: bodyText,
              icon: '/icon-192.png'
            });
          }
        }
      }

      const store = useStore.getState();
      const currentEmail = session?.user?.email;
      const activeAccount = selectedAccountId;
      
      if (data.type === 'POSITIONS_SNAPSHOT') {
        const nextPositions = data.data || [];
        store.setPositions(nextPositions);
        const targetAccount = data.accountId || activeAccount;
        if (currentEmail && targetAccount) {
          localStorage.setItem(`positions:${currentEmail}:${targetAccount}`, JSON.stringify(nextPositions));
        }
      } else if (data.type === 'POSITION_UPDATE') {
        const p = store.positions;
        const exists = p.findIndex(pos => pos.id === data.data.id);
        let nextPositions = [];
        if (exists !== -1) {
          const np = [...p];
          np[exists] = data.data;
          nextPositions = np;
        } else {
          nextPositions = [...p, data.data];
        }
        store.setPositions(nextPositions);
        const targetAccount = data.accountId || activeAccount;
        if (currentEmail && targetAccount) {
          localStorage.setItem(`positions:${currentEmail}:${targetAccount}`, JSON.stringify(nextPositions));
        }
      } else if (data.type === 'POSITION_REMOVED') {
        const nextPositions = store.positions.filter(p => p.id !== data.data.id);
        store.setPositions(nextPositions);
        const targetAccount = data.accountId || activeAccount;
        if (currentEmail && targetAccount) {
          localStorage.setItem(`positions:${currentEmail}:${targetAccount}`, JSON.stringify(nextPositions));
        }
      } else if (data.type === 'HISTORY_ORDER_ADDED') {
        store.setHistory([data.data, ...store.history].slice(0, 20));
      } else if (data.type === 'MARKET_ANALYSIS_UPDATE') {
        const normSelected = selectedSymbol?.toUpperCase().replace(/[^A-Z0-9]/g, '') || '';
        const normReceived = data.symbol?.toUpperCase().replace(/[^A-Z0-9]/g, '') || '';
        const isMatch = normSelected === normReceived || normSelected.startsWith(normReceived) || normReceived.startsWith(normSelected);
        if (data.accountId === selectedAccountId && isMatch) {
          store.setMarketAnalysis(data.analysis);
        }
      }
    });
    
    return () => {
      unsubStatus();
      unsubPhase();
      unsubData();
    };
  }, [selectedAccountId, updateAccount]);

  useEffect(() => {
    if (accounts.length > 0) {
      console.log("[STATE] Active Terminals Updated:", accounts.map(a => `${a.login}: ${a.balance} ${a.currency}`));
      localStorage.setItem('accounts_cache', JSON.stringify(accounts));
    }
  }, [accounts]);

  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);


  // Handle Available Symbols fetch
  useEffect(() => {
    if (!selectedAccountId || !session) return;

    const fetchBrokerSymbols = async (retries = 5) => {
      try {
        const brokerSymbols = await safeFetch(`/api/account/${selectedAccountId}/symbols`, {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        setAvailableBrokerSymbols(brokerSymbols);
        
        // AUTO-NORMALIZATION: If current symbol is invalid for new broker, fix it
        if (brokerSymbols.length > 0 && selectedSymbol) {
          const normSelected = selectedSymbol.toUpperCase();
          const cleanBase = normSelected.replace(/[M\.#+\.\$]/g, ''); // Extract base like XAUUSD
          
          if (!brokerSymbols.includes(selectedSymbol)) {
             // Look for fuzzy match
             const match = brokerSymbols.find((s: string) => {
                const su = s.toUpperCase();
                return su.includes(cleanBase) && su.length <= cleanBase.length + 4;
             });
             
             if (match) {
                console.log(`[AUTO-FIX] Switching symbol ${selectedSymbol} -> ${match} for new broker context`);
                setSelectedSymbol(match);
             } else {
                setSelectedSymbol(brokerSymbols[0]);
             }
          }
        }
      } catch (err: any) {
        if (retries > 0) {
          console.warn(`[RETRY] Retrying fetchBrokerSymbols in 10s. ${retries} attempts left.`);
          setTimeout(() => fetchBrokerSymbols(retries - 1), 10000);
        } else {
          addLog(`DATA ERROR: Failed to fetch symbols after retries: ${err.message}`);
        }
      }
    };

    fetchBrokerSymbols();
  }, [selectedAccountId, session]); // Removed addLog to reduce frequency, added selectedSymbol check logic

  useEffect(() => {
    localStorage.setItem('selectedSymbol', selectedSymbol);
  }, [selectedSymbol]);

  useEffect(() => {
    localStorage.setItem('selectedTimeframe', selectedTimeframe);
  }, [selectedTimeframe]);

  useEffect(() => {
    localStorage.setItem('isDNDActive', isDNDActive.toString());
  }, [isDNDActive]);

  // Sync execution settings to backend
  const strategySettings = useStore(state => state.strategySettings);
  const activeSetup = useStore(state => state.activeSetup);

  // Dynamic AI Lot Size Calculation
  useEffect(() => {
    const balance = useStore.getState().account?.balance || 10000;
    const riskPercentage = strategySettings.riskConfig?.riskPercentage || 1.0;
    const maxRiskCapital = balance * (riskPercentage / 100);
    const slPips = 35;
    const isGold = selectedSymbol?.toLowerCase().includes('xau') || selectedSymbol?.toLowerCase().includes('gold');
    const pipValuePerStandardLot = isGold ? 10 : 10;
    let calculatedLotSize = maxRiskCapital / (slPips * pipValuePerStandardLot);
    if (calculatedLotSize < 0.01) calculatedLotSize = 0.01;
    if (calculatedLotSize > 5.0) calculatedLotSize = 5.0;
    const roundedLotSize = Number(calculatedLotSize.toFixed(2));
    
    if (strategySettings.lotSize !== roundedLotSize) {
      useStore.getState().setStrategySettings({ lotSize: roundedLotSize });
    }
  }, [selectedSymbol, strategySettings.riskConfig?.riskPercentage, useStore.getState().account?.balance]);
  useEffect(() => {
    if (!selectedAccountId || !session) return;
    
    const syncSettings = async () => {
      try {
        await safeFetch(`/api/account/${selectedAccountId}/strategy-settings`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}` 
          },
          body: JSON.stringify(strategySettings)
        });
        console.log("[SYNC] Strategy settings synced to server");
      } catch (err) {
        console.warn("[SYNC] Could not sync strategy settings", err);
      }
    };

    syncSettings();
  }, [strategySettings, selectedAccountId, session]);

  // Sync preferences and chart layout settings to database (Supabase metadata)
  useEffect(() => {
    if (!session) return;

    const syncPrefs = async () => {
      try {
        await safeFetch('/api/user/preferences', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ chartSettings, strategySettings, tokenMetrics })
        });
        console.log("[SYNC] User preferences synced to database successfully");
      } catch (err) {
        console.warn("[SYNC] Could not sync preferences to database", err);
      }
    };

    // Keep save frequency performance-optimal with debouncing
    const timer = setTimeout(syncPrefs, 2000);
    return () => clearTimeout(timer);
  }, [chartSettings, strategySettings, tokenMetrics, session]);


  const handleToggleAlgo = async () => {
    if (!selectedAccountId || !session) return;
    const newState = !isAlgoTradeRunning;

    const activeSetup = useStore.getState().activeSetup;
    const strategySettings = useStore.getState().strategySettings;
    const activeSymbol = activeSetup?.symbol || strategySettings?.symbol || selectedSymbol;
    const activeTimeframe = activeSetup?.timeframe || strategySettings?.timeframe || selectedTimeframe;

    // 1. VALIDATION: Check symbol before starting
    if (newState) {
       if (!activeSymbol || !availableBrokerSymbols.includes(activeSymbol)) {
          const msg = `AI ERROR: Cannot start strategy on invalid symbol "${activeSymbol}". Select a valid one from the list.`;
          addLog(msg);
          alert(msg);
          return;
       }
    }

    try {
      addLog(`CHATRADE AI: Toggling adaptive strategy engine ${newState ? 'ON' : 'OFF'}...`);
      setIsAlgoTradeRunning(newState);
      
      // Keep engineState in sync for dashboard displays
      useStore.getState().setEngineState(newState ? 'RUNNING' : 'STOPPED');
      useStore.getState().setEngineSession(newState ? {
        runningState: 'RUNNING',
        workflowState: 'Cognitive Pipeline Active',
        aiContext: `ChatradeAI agent actively scanning ${activeSymbol} in ${activeTimeframe} timeframe.`
      } : null);
      
      addLog(`SUCCESS: ChatradeAI agent auto-trading set to ${newState ? 'ACTIVE' : 'INACTIVE'}.`);
    } catch (err: any) {
      addLog(`FATAL ERROR: Failed to toggle AI execution state: ${err.message}`);
    }
  };

  const [tradeStatus, setTradeStatus] = useState<"idle" | "executing" | "success" | "error">("idle");
  const lotSize = strategySettings.lotSize;
  const setLotSize = (val: number) => useStore.getState().setStrategySettings({ lotSize: val });

  const handleBuy = async () => {
    if (!selectedAccountId || !session) {
      alert("Please select a valid account/session first");
      return;
    }

    const activeSetup = useStore.getState().activeSetup;
    const strategySettings = useStore.getState().strategySettings;
    const activeSymbol = activeSetup?.symbol || strategySettings?.symbol || selectedSymbol;
    const activeTimeframe = activeSetup?.timeframe || strategySettings?.timeframe || selectedTimeframe;
    const activeLotSize = activeSetup?.lotSize || strategySettings?.lotSize || lotSize || 0.1;

    if (!activeLotSize || activeLotSize <= 0) {
      alert("Enter valid lot size");
      return;
    }
    try {
      const maxTrades = strategySettings.maxTrades || 1;
      const currentPositions = useStore.getState().positions || [];
      if (currentPositions.length >= maxTrades) {
        addLog(`EA WARN: Execution blocked - Max trade limit reached (${currentPositions.length}/${maxTrades}). Close an existing position first.`);
        alert(`Execution blocked: Max trade limit reached (${currentPositions.length}/${maxTrades}).`);
        return;
      }

      const matchedStrat = activeSetup?.strategyName || useStore.getState().strategies?.find(s => s.status === 'MATCHED')?.name || 'ChatradeAI Dynamic Confluence';
      
      addLog(`CHATRADE AI: Executing manual BUY trade based on adaptive ChatradeAI signal [${matchedStrat}] for ${selectedAccountId} on ${activeSymbol} (${activeTimeframe}) at ${activeLotSize} lots...`);
      setTradeStatus("executing");

      const res = await safeFetch('/api/trade/buy', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          accountId: selectedAccountId,
          symbol: activeSymbol,
          lotSize: activeLotSize,
          comment: `AI: ${matchedStrat}`
        })
      });

      if (res?.success) {
        addLog(`CHATRADE AI: BUY trade executed successfully. Order ID: ${res.result?.orderId || res.result?.id}`);
        setTradeStatus("success");
      } else {
        addLog(`CHATRADE AI ERROR: BUY failed: ${res?.error || 'Unknown error'}`);
        setTradeStatus("error");
      }
      setTimeout(() => setTradeStatus("idle"), 3000);
    } catch (err: any) {
      addLog(`EA ERROR: BUY execution failed: ${err.message}`);
      setTradeStatus("error");
      setTimeout(() => setTradeStatus("idle"), 3000);
    }
  };

  const handleSell = async () => {
    if (!selectedAccountId || !session) {
      alert("Please select a valid account/session first");
      return;
    }

    const activeSetup = useStore.getState().activeSetup;
    const strategySettings = useStore.getState().strategySettings;
    const activeSymbol = activeSetup?.symbol || strategySettings?.symbol || selectedSymbol;
    const activeTimeframe = activeSetup?.timeframe || strategySettings?.timeframe || selectedTimeframe;
    const activeLotSize = activeSetup?.lotSize || strategySettings?.lotSize || lotSize || 0.1;

    if (!activeLotSize || activeLotSize <= 0) {
      alert("Enter valid lot size");
      return;
    }
    try {
      const maxTrades = strategySettings.maxTrades || 1;
      const currentPositions = useStore.getState().positions || [];
      if (currentPositions.length >= maxTrades) {
        addLog(`EA WARN: Execution blocked - Max trade limit reached (${currentPositions.length}/${maxTrades}). Close an existing position first.`);
        alert(`Execution blocked: Max trade limit reached (${currentPositions.length}/${maxTrades}).`);
        return;
      }

      const matchedStrat = activeSetup?.strategyName || useStore.getState().strategies?.find(s => s.status === 'MATCHED')?.name || 'ChatradeAI Dynamic Confluence';
      
      addLog(`CHATRADE AI: Executing manual SELL trade based on adaptive ChatradeAI signal [${matchedStrat}] for ${selectedAccountId} on ${activeSymbol} (${activeTimeframe}) at ${activeLotSize} lots...`);
      setTradeStatus("executing");

      const res = await safeFetch('/api/trade/sell', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          accountId: selectedAccountId,
          symbol: activeSymbol,
          lotSize: activeLotSize,
          comment: `AI: ${matchedStrat}`
        })
      });

      if (res?.success) {
        addLog(`CHATRADE AI: SELL trade executed successfully. Order ID: ${res.result?.orderId || res.result?.id}`);
        setTradeStatus("success");
      } else {
        addLog(`CHATRADE AI ERROR: SELL failed: ${res?.error || 'Unknown error'}`);
        setTradeStatus("error");
      }
      setTimeout(() => setTradeStatus("idle"), 3000);
    } catch (err: any) {
      addLog(`EA ERROR: SELL execution failed: ${err.message}`);
      setTradeStatus("error");
      setTimeout(() => setTradeStatus("idle"), 3000);
    }
  };

  const verifyAndFetch = useCallback(async (retries = 5) => {
    if (!session) return;
    setIsLoading(true);
    setLastError(null);
    
    try {
      // Also poll infra health
      try {
        await safeFetch('/api/infra-health');
      } catch (e) {
        // Silently fail health check
      }

      const data = await safeFetch('/api/accounts', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      setIsAuthValid(true);
      
      // 1. BLOCK: Ignore SYNCING status to prevent state wiping
      if (data && data.status === 'SYNCING') {
        addLog(`SDK: Synchronization in progress on TrisTech secure system...`);
        return;
      }

      const accountsList = Array.isArray(data) ? data : (data.accounts || []);
      
      if (accountsList.length === 0 && accounts.length > 0) {
        addLog(`SDK Warning: Received empty terminals list. Preserving current state.`);
        return;
      }
      
      addLog(`SUCCESS: Discovered ${accountsList.length} active terminals via SDK Synchronization.`);
      
      setAccounts(prevAccounts => accountsList.map((acc: any) => {
        const accId = acc._id || acc.id;
        const existingAcc = prevAccounts.find(a => a.id === accId);
        
        const newAcc = {
          id: accId,
          name: acc.name,
          platform: acc.platform === 'mt5' ? PlatformType.MT5 : PlatformType.MT4,
          login: acc.login,
          connectionStatus: acc.connectionStatus || existingAcc?.connectionStatus || 'DISCONNECTED',
          state: acc.state || 'UNDEPLOYED',
          balance: (acc.balance !== null && acc.balance !== undefined) 
            ? Number(acc.balance) 
            : (existingAcc?.balance ?? null),
          equity: (acc.equity !== null && acc.equity !== undefined) 
            ? Number(acc.equity) 
            : (existingAcc?.equity ?? null),
          margin: (acc.margin !== null && acc.margin !== undefined) 
            ? Number(acc.margin) 
            : (existingAcc?.margin ?? null),
          freeMargin: (acc.freeMargin !== null && acc.freeMargin !== undefined) 
            ? Number(acc.freeMargin) 
            : (existingAcc?.freeMargin ?? null),
          marginLevel: (acc.marginLevel !== null && acc.marginLevel !== undefined) 
            ? Number(acc.marginLevel) 
            : (existingAcc?.marginLevel ?? null),
          currency: acc.currency || existingAcc?.currency || 'USD',
          ready: (['CONNECTED', 'READY'].includes(acc.connectionStatus?.toUpperCase())) || (acc.balance !== null && Number(acc.balance) > 0) || (existingAcc?.ready || false)
        };
        
        if (accId === selectedAccountId) {
            // connectionManager.setRestHydrated(accId, true);
        }

        console.log(`[DEBUG] Normalizing Terminal ${newAcc.login}: status=${newAcc.connectionStatus}, ready=${newAcc.ready}`);
        return newAcc;
      }));
      setIsLoading(false);
    } catch (err: any) {
      if (retries > 0) {
        console.warn(`[RETRY] Retrying verifyAndFetch in 15s. ${retries} attempts left.`);
        setTimeout(() => verifyAndFetch(retries - 1), 15000);
      } else {
        setLastError(`System API Exception: ${err.message}`);
        addLog(`FATAL: Connection lost to secure system. Re-attempting handshake in 60s.`);
        setIsAuthValid(false);
        setIsLoading(false);
        setTimeout(() => verifyAndFetch(5), 60000);
      }
    }
  }, [addLog, session, accounts.length, selectedAccountId]);

  // Terminal Auto-Discovery logic removed in favor of direct SDK handling
  useEffect(() => {
    // We rely on verifyAndFetch for account list
  }, [accounts, addLog]);

  // Price Polling for EA Strategy removed as EA logic happens on backend/SDK.

  useEffect(() => {
    if (!bootData) return;
    // Perform initial synchronization
    verifyAndFetch();
    
    // PERIODIC SYNC: Keep terminal balances and connection states fresh
    const interval = setInterval(() => {
      verifyAndFetch(0); // Background sync with no retries to prevent stack exhaustion on poor networks
    }, 60000); // Every 60 seconds
    return () => clearInterval(interval);
  }, [verifyAndFetch, bootData]);

  // Handle AlgoTrade Start/Stop lifecycle
  useEffect(() => {
    if (!isAlgoTradeRunning) {
      addLog("RPC: Stop command received. Terminating all background workers...");
      setSyncedAccountIds(new Set());
    } else {
      addLog("RPC: Deployment active. Background monitoring initiated.");
    }
  }, [isAlgoTradeRunning, addLog]);

  const handleDeployTerminal = async () => {
    if (!selectedAccountId || !session) return;
    try {
      addLog(`ORCHESTRATION: Initiating Core Engine Deployment...`);
      await safeFetch(`/api/account/${selectedAccountId}/deploy`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ userId: session.user.id })
      });
      addLog(`SUCCESS: Terminal deployment request sent.`);
    } catch (err: any) {
      addLog(`ERROR: Deployment failed: ${err.message}`);
    }
  };

  const handleUndeployTerminal = async () => {
    if (!selectedAccountId || !session) return;
    try {
      addLog(`ORCHESTRATION: Initiating Cloud Termination...`);
      await safeFetch(`/api/account/${selectedAccountId}/undeploy`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      addLog(`SUCCESS: Terminal undeployment request sent.`);
    } catch (err: any) {
      addLog(`ERROR: Undeployment failed: ${err.message}`);
    }
  };

  const handleSwitchMode = useCallback((mode: 'EA' | 'STRATEGY') => {
    if (!selectedAccountId) return;
    
    // ENFORCEMENT: Stop first
    if (isAlgoTradeRunning) {
      alert("Please STOP execution before switching modes.");
      return;
    }

    if (openPositions > 0) {
      alert("Close all open positions before switching execution modes to prevent orphaned trades.");
      return;
    }

    setExecutionModes(prev => ({ ...prev, [selectedAccountId]: mode }));
    connectionManager.switchMode(selectedAccountId, mode);
    addLog(`SYSTEM: Execution mode for ${selectedAccountId} set to ${mode}`);
  }, [selectedAccountId, isAlgoTradeRunning, openPositions, addLog]);

  if (loadingAuth) return <FullScreenLoader message="Checking authentication..." />;
  
  const path = window.location.pathname;
  if (path === '/pricing') {
    return <PricingPage session={session} bootData={bootData} />;
  }
  
  if (path === '/reset-password') {
    return <ResetPasswordForm session={session} />;
  }
  
  if (!session) return (
    <div className="relative flex items-center justify-center bg-black overflow-hidden h-[100dvh] w-full">
      {/* Deep background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {/* User's uploaded brand background image */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-100 z-0"
          style={{ 
            backgroundImage: "url('/login-background.png')",
            backgroundColor: "#000000"
          }}
        ></div>
      </div>
      <div className="relative z-20 pointer-events-auto w-full px-4">
        <LoginForm />
      </div>
    </div>
  );
  
  if (loadingBootstrap || (!bootData && !bootError)) return <FullScreenLoader message="Loading trading workspace..." />;
  if (bootError) return <FullScreenLoader message="Workspace Failure" error={bootError} />;

  // Redirect to pricing if user has no active subscription and is not on the pricing page
  const isBootingWithKey = window.location.search.includes('activated=true');
  if (!loadingBootstrap && bootData && !bootData.has_active_subscription && path !== '/pricing' && !isBootingWithKey) {
    window.location.href = '/pricing';
    return <FullScreenLoader message="Redirecting to pricing..." />;
  }


  return (
    <div className={`fixed inset-0 flex w-full bg-[#050608] overflow-hidden text-slate-200 transition-colors duration-1000 ${streakThemeClasses}`}>
      <div className="absolute inset-0 z-0 pointer-events-none opacity-45">
        {/* Subtle Brand Logo Watermark Overlay */}
        <div 
          className="absolute inset-0 bg-contain bg-center bg-no-repeat opacity-[0.03] scale-50 z-0 pointer-events-none"
          style={{ backgroundImage: "url('/bot-logo.png?v=12')" }}
        ></div>
        <div className="absolute inset-0 bg-black/95 z-10 cyber-grid"></div>
        {/* Soft elegant warm ambient gold lighting spheres */}
        <div className="absolute -top-[20%] left-1/3 w-[600px] h-[600px] bg-[#face6f]/4 rounded-full blur-[150px] z-0"></div>
        <div className="absolute -bottom-[20%] right-1/3 w-[600px] h-[600px] bg-[#face6f]/3 rounded-full blur-[150px] z-0"></div>
      </div>

      <div className="relative z-10 flex w-full h-full min-h-0 max-h-full overflow-hidden">
        <ExpertLogPanel executionMode="STRATEGY" />
        
        {/* Sidebar - Desktop & Mobile overlay */}
        <div className={`fixed inset-0 bg-black/85 z-[60] lg:hidden transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsSidebarOpen(false)} />
        <div className={`fixed lg:relative z-[70] lg:z-0 transition-all duration-300 transform 
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} 
          ${isDesktopSidebarOpen ? 'lg:w-64 lg:opacity-100 lg:translate-x-0 lg:border-r border-white/5' : 'lg:w-0 lg:opacity-0 lg:-translate-x-full lg:border-r-0 lg:pointer-events-none'} 
          h-full bg-black/95 backdrop-blur-xl shrink-0 overflow-hidden`}
        >
          <Sidebar 
            activeTab={activeTab} 
            setActiveTab={(tab) => { setActiveTab(tab); setIsSidebarOpen(false); }} 
            onTabChange={(tab, sub) => {
              setActiveTab(tab);
              if (tab === 'admin' && sub) setAdminSubTab(sub as any);
              setIsSidebarOpen(false);
            }}
            subscriptionPlan={bootData.subscription_plan}
            licenseKey={bootData.license_key}
          />
        </div>
        
        <main className="flex-1 flex flex-col overflow-hidden relative w-full bg-black/30 min-h-0">
          <header className="h-14 sm:h-16 border-b border-white/5 flex items-center justify-between px-3 sm:px-6 bg-black/80 backdrop-blur-3xl shrink-0 z-20">
            <div className="flex items-center gap-2 sm:gap-4">
              <button 
                onClick={() => {
                  if (window.innerWidth >= 1024) {
                    const next = !isDesktopSidebarOpen;
                    setIsDesktopSidebarOpen(next);
                    localStorage.setItem('desktop_sidebar_open', String(next));
                  } else {
                    setIsSidebarOpen(true);
                  }
                }} 
                className="p-2 hover:bg-white/5 rounded-lg text-slate-400 transition-colors cursor-pointer"
                style={{ color: 'var(--accent-color)' }}
              >
                <Menu className="w-5 h-5 shadow-sm" />
              </button>
              <h1 className="text-base sm:text-xl font-black text-white tracking-widest uppercase truncate ml-2 font-mono drop-shadow-[0_2px_10px_rgba(var(--accent-color-rgb),0.5)]">
                ALGOTRADE
              </h1>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0 justify-end">
              <div className="flex items-center">
                {['INIT', 'CONNECTING_META'].includes(tradingStatus) ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 border border-white/10 rounded-md animate-pulse">
                    <Cloud className="w-3 h-3 animate-bounce" style={{ color: 'var(--accent-color)' }} />
                    <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest whitespace-nowrap" style={{ color: 'var(--accent-color)' }}>BOOTING</span>
                  </div>
                ) : tradingStatus === 'META_CONNECTED' ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 rounded-md">
                    <Cloud className="w-3 h-3 text-amber-500 animate-pulse" />
                    <span className="text-[9px] sm:text-[10px] font-mono font-bold text-amber-500 uppercase tracking-widest whitespace-nowrap">CONNECTING...</span>
                  </div>
                ) : ['ACCOUNT_SYNCING', 'BROKER_CONNECTED', 'SYNCING'].includes(tradingStatus) ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 border border-blue-500/20 rounded-md">
                    <RefreshCw className="w-3 h-3 text-blue-500 animate-spin" />
                    <span className="text-[9px] sm:text-[10px] font-mono font-bold text-blue-500 uppercase tracking-widest whitespace-nowrap">SYNCING</span>
                  </div>
                ) : tradingStatus === 'OFFLINE' ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/10 border border-rose-500/20 rounded-md">
                    <AlertCircle className="w-3 h-3 text-rose-500" />
                    <span className="text-[9px] sm:text-[10px] font-mono font-bold text-rose-500 uppercase tracking-widest whitespace-nowrap">OFFLINE</span>
                  </div>
                ) : ['ACCOUNT_READY', 'STREAMING', 'READY'].includes(tradingStatus) ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-md shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    <span className="text-[9px] sm:text-[10px] font-mono font-bold text-emerald-500 uppercase tracking-widest whitespace-nowrap">CONNECTED</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-500/10 border border-slate-500/20 rounded-md">
                    <CheckCircle2 className="w-3 h-3 text-slate-500" />
                    <span className="text-[9px] sm:text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">{tradingStatus}</span>
                  </div>
                )}
              </div>

               <button
                 onClick={async () => { localStorage.clear(); await supabase.auth.signOut(); window.location.reload(); }}
                 className="hidden sm:inline-block text-[9px] sm:text-[10px] font-mono font-bold text-rose-500 hover:text-white uppercase tracking-widest px-2 py-1 transition-colors"
               >
                 Logout
               </button>

              <button 
                onClick={() => setIsNotificationCenterOpen(true)}
                title="Real-Time High-Impact News Alerts"
                className={`relative p-1.5 sm:p-2 rounded-lg border transition-all active:scale-95 ${
                  unreadPushCount > 0 
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.3)]' 
                    : isDNDActive 
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' 
                    : 'hover:bg-white/5 border-white/5 text-slate-400'
                }`}
              >
                {isDNDActive ? <BellOff className="w-3.5 h-3.5 sm:w-4 h-4" /> : <Bell className="w-3.5 h-3.5 sm:w-4 h-4" />}
                {unreadPushCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-500 text-white font-mono font-bold text-[9px] w-4 h-4 rounded-full flex items-center justify-center animate-bounce shadow-lg">
                    {unreadPushCount > 9 ? '9+' : unreadPushCount}
                  </span>
                )}
              </button>

              {/* Theme Switcher Button */}
              <button 
                onClick={() => {
                  const currentTheme = chartSettings.theme || 'dark';
                  useStore.getState().setChartSettings({ theme: currentTheme === 'dark' ? 'light' : 'dark' });
                }}
                title={chartSettings.theme === 'light' ? "Switch to Dark Mode" : "Switch to Light Mode"}
                className="p-1.5 sm:p-2 rounded-lg border border-white/5 text-slate-400 hover:bg-white/5 transition-all active:scale-95"
              >
                {chartSettings.theme === 'light' ? (
                  <Sun className="w-3.5 h-3.5 sm:w-4 h-4 text-amber-500 animate-[spin-slow]" />
                ) : (
                  <Moon className="w-3.5 h-3.5 sm:w-4 h-4 text-[#face6f]" />
                )}
              </button>

              <button onClick={() => verifyAndFetch()} className="p-1.5 sm:p-2 hover:bg-white/5 rounded-lg border border-white/5 transition-all active:scale-95">
                <RefreshCw className={`w-3.5 h-3.5 sm:w-4 h-4 text-slate-400 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </header>

          <div className={`flex-1 ${(activeTab === 'chatrade' || activeTab === 'data') ? 'overflow-hidden min-h-0 p-0 sm:p-2 lg:p-4 lg:pb-2' : 'overflow-y-auto p-2 sm:p-6 pb-[calc(70px+env(safe-area-inset-bottom))] lg:pb-6'} custom-scrollbar z-10 w-full overflow-x-hidden flex flex-col`}>
            <div className={`max-w-[1700px] mx-auto w-full ${(activeTab === 'chatrade' || activeTab === 'data') ? 'flex-1 min-h-0' : 'space-y-4 flex-1'} flex flex-col`}>
            {/* BACKGROUND CHATRADE AI INSTANCE TO MAINTAIN POLLING/WEBSOCKETS */}
            <div className={`${activeTab === 'chatrade' ? 'flex-1 flex flex-col min-h-0' : 'hidden'} w-full overflow-hidden`}>
              {bootData && (session?.user?.email || '').toLowerCase() !== 'trispinblackops@gmail.com' && (bootData.subscription_plan || '').toLowerCase() === 'starter' ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[#0b101e] border border-white/10 rounded-3xl max-w-lg mx-auto my-12 shadow-2xl">
                  <div className="w-16 h-16 bg-slate-800/80 rounded-2xl flex items-center justify-center shadow-lg mb-6 border border-white/10 text-slate-400">
                    <Cpu className="w-8 h-8 animate-pulse" />
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mb-3">Premium Tool Locked</h2>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-sm mb-6">
                    Chatrade AI is reserved for PRO and ELITE subscribers. Please upgrade your plan to unlock advanced multi-agent trade analysis, real-time risk veto intelligence, and news impact correlation.
                  </p>
                  <button 
                    onClick={() => setActiveTab('dashboard')}
                    className="py-3 px-6 rounded-xl font-bold text-xs text-white transition-all bg-indigo-600 hover:bg-indigo-500 shadow-lg active:scale-95"
                  >
                    Return to Metrics Dashboard
                  </button>
                </div>
              ) : (
                <ChatradeAI 
                  accounts={accounts} 
                  selectedAccountId={selectedAccountId} 
                  currentUserEmail={session?.user?.email || 'trispinblackops@gmail.com'} 
                  addLog={addLog} 
                  availableSymbols={availableBrokerSymbols}
                  token={session?.access_token}
                  isAlgoTradeRunning={isAlgoTradeRunning}
                  toggleAlgoTrade={handleToggleAlgo}
                  selectedSymbol={selectedSymbol}
                  setSelectedSymbol={setSelectedSymbol}
                  selectedTimeframe={selectedTimeframe}
                  setSelectedTimeframe={setSelectedTimeframe}
                  subscriptionPlan={bootData?.subscription_plan}
                />
              )}
            </div>
            
            {/* BACKGROUND MARKET DATA INSTANCE TO MAINTAIN WEBSOCKETS */}
            <div className={`${activeTab === 'data' ? 'flex-1 flex flex-col min-h-0' : 'hidden'} w-full overflow-hidden`}>
              <ErrorBoundary>
                <MarketData 
                  accounts={accounts} 
                  selectedAccountId={selectedAccountId || ''} 
                  setSelectedAccountId={handleAccountSelect}
                  symbol={selectedSymbol}
                  setSymbol={setSelectedSymbol}
                  timeframe={selectedTimeframe}
                  setTimeframe={setSelectedTimeframe}
                  addLog={addLog}
                  availableBrokerSymbols={availableBrokerSymbols}
                  lotSize={lotSize}
                  setLotSize={setLotSize}
                  onBuy={handleBuy}
                  onSell={handleSell}
                  onToggleAlgo={handleToggleAlgo}
                  isAlgoRunning={isAlgoTradeRunning}
                  tradeStatus={tradeStatus}
                  connectionStatus={sdkStatus}
                  onDeploy={handleDeployTerminal}
                  onUndeploy={handleUndeployTerminal}
                  setActiveTab={setActiveTab}
                  token={session?.access_token}
                  isLoading={isLoading}
                />
              </ErrorBoundary>
            </div>

            <AnimatePresence mode="wait">
              {(activeTab !== 'chatrade' && activeTab !== 'data') && (
              <motion.div
                key={activeTab}
                className={`flex-1 flex flex-col min-h-0`}
                initial={{ opacity: 0, scale: 0.98, filter: 'blur(10px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 1.02, filter: 'blur(10px)' }}
                transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              >
                {activeTab === 'dashboard' && (
                  <Dashboard 
                    accounts={accounts} 
                    selectedAccountId={selectedAccountId}
                    isLoading={isLoading} 
                    isAlgoTradeRunning={isAlgoTradeRunning} 
                    syncedAccountIds={syncedAccountIds}
                    selectedSymbol={selectedSymbol}
                    isTradingReady={tradingStatus ? isTradingReady(tradingStatus) : false}
                    token={session?.access_token}
                    onBuy={handleBuy}
                    onSell={handleSell}
                    onToggleAlgo={handleToggleAlgo}
                    lotSize={lotSize}
                    setLotSize={setLotSize}
                    tradeStatus={tradeStatus}
                    hasActiveSubscription={bootData?.has_active_subscription}
                  />
                )}
                {activeTab === 'command-center' && session?.user?.email?.toLowerCase() === 'trispinblackops@gmail.com' && <CommandCenter />}
                {activeTab === 'open_positions' && (
                  <ErrorBoundary>
                    <OpenPositionsView 
                      accounts={accounts}
                      token={session?.access_token} 
                      selectedAccountId={selectedAccountId} 
                      addLog={addLog} 
                    />
                  </ErrorBoundary>
                )}
                {activeTab === 'accounts' && <AccountConfig accounts={accounts} setAccounts={setAccounts} token={session?.access_token} subscriptionPlan={bootData?.subscription_plan} onSelectAccount={(id) => { handleAccountSelect(id); setActiveTab("data"); }} />}
                {activeTab === 'settings' && (
                  <ErrorBoundary>
                    <ChartSettings />
                  </ErrorBoundary>
                )}
                {activeTab === 'news' && (
                  <ErrorBoundary>
                    <News 
                      activeSymbol={selectedSymbol} 
                      onSymbolChange={setSelectedSymbol} 
                      availableBrokerSymbols={availableBrokerSymbols}
                      selectedAccountId={selectedAccountId || ''}
                      selectedTimeframe={selectedTimeframe}
                    />
                  </ErrorBoundary>
                )}
                {activeTab === 'admin' && (
                  <ErrorBoundary>
                    <AdminDashboard session={session} initialTab={adminSubTab} />
                  </ErrorBoundary>
                )}
                {activeTab === 'admin-logs' && (
                  <ErrorBoundary>
                    <AdminDashboard session={session} initialTab="logs" />
                  </ErrorBoundary>
                )}
                {activeTab === 'logs' && (
                  <ErrorBoundary>
                    <SystemMonitor 
                      logs={logs} 
                      isAuthValid={isAuthValid} 
                      lastError={lastError} 
                      sdkStatus={sdkStatus}
                      onLock={() => setActiveTab('dashboard')} 
                    />
                  </ErrorBoundary>
                )}
              </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Desktop Footer - Hidden on mobile */}
        <footer className="hidden lg:flex h-10 bg-black border-t border-white/5 items-center px-4 sm:px-10 gap-4 text-[7px] sm:text-[8px] uppercase tracking-[0.2em] sm:tracking-[0.4em] font-black text-slate-600 shrink-0 z-20 overflow-hidden">
          <div className="flex items-center gap-2 truncate">
            <LockIcon className="w-2.5 h-2.5 sm:w-3 h-3 shrink-0" style={{ color: 'var(--accent-color)' }} />
            <span className="truncate">ENGINE: ALGOTRADE</span>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-4 shrink-0">
             <span className="hidden xs:inline">REGION: global.secured</span>
             <span className="truncate" style={{ color: 'var(--accent-color)' }}>v3-secured</span>
          </div>
        </footer>

        {/* Bottom Navigation */}
        <nav className="lg:hidden bg-black/95 backdrop-blur-xl border-t border-white/5 flex items-center justify-between px-1 shrink-0 z-50 w-full fixed bottom-0 left-0" style={{ height: 'calc(60px + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center justify-center gap-1 w-1/4 h-full transition-all active:scale-95 ${activeTab === 'dashboard' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`} style={activeTab === 'dashboard' ? { color: 'var(--accent-color)' } : {}}>
            <Activity className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[9px] font-mono font-bold uppercase transition-colors shrink-0">METRICS</span>
          </button>
          <button onClick={() => setActiveTab('data')} className={`flex flex-col items-center justify-center gap-1 w-1/4 h-full transition-all active:scale-95 ${activeTab === 'data' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`} style={activeTab === 'data' ? { color: 'var(--accent-color)' } : {}}>
            <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[9px] font-mono font-bold uppercase transition-colors shrink-0">MARKET</span>
          </button>
          <button onClick={() => setActiveTab('open_positions')} className={`flex flex-col items-center justify-center gap-1 w-1/4 h-full transition-all active:scale-95 ${activeTab === 'open_positions' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`} style={activeTab === 'open_positions' ? { color: 'var(--accent-color)' } : {}}>
            <Folder className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[9px] font-mono font-bold uppercase transition-colors shrink-0">OPEN POSITIONS</span>
          </button>
          <button onClick={() => setActiveTab('accounts')} className={`flex flex-col items-center justify-center gap-1 w-1/4 h-full transition-all active:scale-95 ${activeTab === 'accounts' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`} style={activeTab === 'accounts' ? { color: 'var(--accent-color)' } : {}}>
            <Users className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[9px] font-mono font-bold uppercase transition-colors shrink-0">ACCOUNT</span>
          </button>
        </nav>

        <NewsPushToast 
          alert={activeToastAlert} 
          onDismiss={dismissToast} 
          onOpenNews={() => setActiveTab('news')} 
        />

        <NotificationCenter 
          isOpen={isNotificationCenterOpen}
          onClose={() => setIsNotificationCenterOpen(false)}
          permission={notificationPermission}
          onRequestPermission={requestPermission}
          onTriggerTest={triggerTestNotification}
          onOpenNewsTab={() => setActiveTab('news')}
          isDNDActive={isDNDActive}
          onToggleDND={() => setIsDNDActive(!isDNDActive)}
          selectedSymbol={selectedSymbol || 'XAUUSDm'}
        />

        {/* ChatradeAI Quick Trade & Execution FAB */}
        {selectedAccountId && session && (
          <div className="fixed bottom-20 right-4 sm:bottom-24 sm:right-6 z-[80] flex flex-col items-end gap-2">
            <AnimatePresence>
              {isFabPanelOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 10 }}
                  className="w-72 bg-slate-950/95 border border-white/10 rounded-xl p-4 shadow-[0_0_30px_rgba(0,0,0,0.85)] backdrop-blur-md font-sans"
                  style={{ borderColor: 'rgba(var(--accent-color-rgb), 0.25)' }}
                >
                  <div className="flex justify-between items-center border-b border-white/5 pb-2 mb-2.5">
                    <div className="flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 animate-pulse" style={{ color: 'var(--accent-color)' }} />
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">ChatradeAI Live State</span>
                    </div>
                    <button 
                      onClick={() => setIsFabPanelOpen(false)}
                      className="text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Vertex AI Enterprise Cost Auditor */}
                  <VertexCostAuditor isAlgoTradeRunning={isAlgoTradeRunning} className="mb-3 border-none !p-0 !bg-transparent !shadow-none" />

                  {activeSetup ? (
                    <div className="space-y-3">
                      <div className="bg-white/[0.02] border border-white/5 p-2 rounded-lg space-y-1">
                        <div className="flex justify-between items-center text-[9px] uppercase font-bold text-slate-500">
                          <span>Active Strategy</span>
                          <div className="flex items-center gap-1.5">
                            <span style={{ color: 'var(--accent-color)' }}>{activeSetup.confidence}% Conf</span>
                            <button
                              type="button"
                              onClick={() => setIsEvidenceViewerOpen(true)}
                              className="flex items-center gap-1 text-[8px] font-mono font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/20 transition-all cursor-pointer"
                            >
                              Evidence Package
                            </button>
                          </div>
                        </div>
                        <div className="text-xs font-black text-white">{activeSetup.strategyName}</div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-mono font-bold bg-black/40 p-2 rounded-lg border border-white/5">
                        <div className="flex flex-col">
                          <span className="text-[8px] text-slate-500 uppercase">Symbol</span>
                          <span className="text-white uppercase">{activeSetup.symbol || selectedSymbol}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[8px] text-slate-500 uppercase">Timeframe</span>
                          <span className="text-white uppercase">{activeSetup.timeframe || strategySettings.timeframe || selectedTimeframe}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[8px] text-slate-500 uppercase">Lot Size</span>
                          <span className="text-white">{activeSetup.lotSize || strategySettings.lotSize || lotSize}</span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={handleBuy}
                          disabled={tradeStatus === "executing"}
                          className={`flex-1 py-2 px-3 rounded-lg text-[10px] font-black uppercase bg-emerald-500 text-white hover:bg-emerald-400 active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer ${tradeStatus === "executing" ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {tradeStatus === "executing" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                          BUY {activeSetup.symbol || selectedSymbol}
                        </button>
                        <button
                          onClick={handleSell}
                          disabled={tradeStatus === "executing"}
                          className={`flex-1 py-2 px-3 rounded-lg text-[10px] font-black uppercase bg-rose-500 text-white hover:bg-rose-400 active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer ${tradeStatus === "executing" ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {tradeStatus === "executing" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                          SELL {activeSetup.symbol || selectedSymbol}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-slate-400 text-[10px] text-center py-2 leading-relaxed">
                        Awaiting confluence setup scan. Current monitoring configuration below.
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-mono font-bold bg-black/40 p-2 rounded-lg border border-white/5">
                        <div className="flex flex-col">
                          <span className="text-[8px] text-slate-500 uppercase">Symbol</span>
                          <span className="text-white uppercase">{strategySettings.symbol || selectedSymbol}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[8px] text-slate-500 uppercase">Timeframe</span>
                          <span className="text-white uppercase">{strategySettings.timeframe || selectedTimeframe}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[8px] text-slate-500 uppercase">Lot Size</span>
                          <span className="text-white">{strategySettings.lotSize || lotSize}</span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={handleBuy}
                          disabled={tradeStatus === "executing"}
                          className={`flex-1 py-2 px-3 rounded-lg text-[10px] font-black uppercase bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/25 active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer ${tradeStatus === "executing" ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {tradeStatus === "executing" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                          BUY
                        </button>
                        <button
                          onClick={handleSell}
                          disabled={tradeStatus === "executing"}
                          className={`flex-1 py-2 px-3 rounded-lg text-[10px] font-black uppercase bg-rose-500/15 border border-rose-500/20 text-rose-400 hover:bg-rose-500/25 active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer ${tradeStatus === "executing" ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {tradeStatus === "executing" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                          SELL
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <button
              onClick={() => setIsFabPanelOpen(prev => !prev)}
              className="w-12 h-12 rounded-full shadow-[0_0_20px_rgba(var(--accent-color-rgb),0.35)] bg-black/50 border border-white/20 flex items-center justify-center backdrop-blur-md transition-all hover:scale-110 active:scale-95 cursor-pointer relative"
              style={{ borderColor: 'rgba(var(--accent-color-rgb), 0.5)', color: 'var(--accent-color)' }}
            >
              <Cpu className="w-5 h-5 animate-pulse" />
              {activeSetup && (
                <span className="absolute -top-1 -right-1 bg-emerald-500 text-white font-sans font-black text-[7px] px-1 py-0.5 rounded-full uppercase tracking-tighter animate-bounce shadow-lg">
                  SIGNAL
                </span>
              )}
            </button>
          </div>
        )}
      <EvidencePackageViewer
        activeSetup={activeSetup}
        isOpen={isEvidenceViewerOpen}
        onClose={() => setIsEvidenceViewerOpen(false)}
        onExecute={(dir) => dir === 'BUY' ? handleBuy() : handleSell()}
        isExecuting={tradeStatus === 'executing'}
      />
      </main>
      </div>
    </div>
  );
};


export default App;
