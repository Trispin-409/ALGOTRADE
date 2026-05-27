
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
  X,
  Play,
  Moon,
  MoonStar,
  Settings,
  Bell,
  BellOff,
  Activity,
  TrendingUp,
  Users,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PlatformType, TradingAccount } from './types';
import Dashboard from './components/Dashboard';
import Sidebar from './components/Sidebar';
import AccountConfig from './components/AccountConfig';
import News from './components/News';
import RiskManagement from './components/RiskManagement';
import ChatradeAI from './components/ChatradeAI';
  // Remove ea-deployer state

import SystemMonitor from './components/SystemMonitor';
import { ExpertLogPanel } from './components/ExpertLogPanel';
import MarketData from './components/MarketData';
import ChartSettings from './components/ChartSettings';
import { ErrorBoundary } from './components/ErrorBoundary';
import { connectionManager, TradingPhase } from './src/lib/ConnectionManager';
import { safeFetch } from './src/lib/utils';
import { supabase } from './src/lib/supabase';
import { LoginForm } from './src/components/Auth/LoginForm';
import { ResetPasswordForm } from './src/components/Auth/ResetPasswordForm';
import { FullScreenLoader } from './src/components/Auth/FullScreenLoader';
import { useStore } from './src/store';
import { PricingPage } from './src/components/PricingPage';
import { AdminDashboard } from './components/AdminDashboard';

// No explicit SDK_URL needed for same-origin SDK proxy

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [bootData, setBootData] = useState<any>(null);
  const [loadingBootstrap, setLoadingBootstrap] = useState(false);

  // Zustand State
  const setConnectionStatus = useStore(state => state.setConnectionStatus);
  const updateAccount = useStore(state => state.updateAccount);
  const connectionStatus = useStore(state => state.connectionStatus);
  const globalHistory = useStore(state => state.history);
  const chartSettings = useStore(state => state.chartSettings);

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

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
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
      if (window.location.search.includes('activated=true')) {
        window.history.replaceState({}, '', '/');
      }
    })
    .catch(err => {
      addLog(`FATAL: Failed to retrieve system configuration: ${err.message}`);
    })
    .finally(() => {
      setLoadingBootstrap(false);
    });
  }, [session, bootData]);

  // Global State
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'chatrade');
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
  const [openPositions, setOpenPositions] = useState<number>(0);
  const [isAlgoTradeRunning, setIsAlgoTradeRunning] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState(() => localStorage.getItem('selectedAccountId') || '');
  const [tradingStatus, setTradingStatus] = useState<string>('INIT');
  const [availableBrokerSymbols, setAvailableBrokerSymbols] = useState<string[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState(() => localStorage.getItem('selectedSymbol') || 'XAUUSDm');

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
  const [selectedTimeframe, setSelectedTimeframe] = useState(() => localStorage.getItem('selectedTimeframe') || '1m');

  // Sync selectedTimeframe with store strategy settings
  useEffect(() => {
    const currentStoreTimeframe = useStore.getState().strategySettings.timeframe;
    if (selectedTimeframe && selectedTimeframe !== currentStoreTimeframe) {
      useStore.getState().setStrategySettings({ timeframe: selectedTimeframe });
    }
  }, [selectedTimeframe]);
  const [isDNDActive, setIsDNDActive] = useState(() => localStorage.getItem('isDNDActive') === 'true');
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

  // EA Status Polling (Orchestration Plane)
  useEffect(() => {
    if (!selectedAccountId || !session) return;
    
    const fetchStatus = async () => {
      if (!selectedAccountId) return;
      try {
        const url = `/api/account/${encodeURIComponent(selectedAccountId)}/status`;
        const data = await safeFetch(url);
        if (data) {
           setEaStatuses(prev => ({ ...prev, [selectedAccountId]: data }));
           // Sync algo running state with terminal state if in EA mode
           if (executionModes[selectedAccountId] === 'EA') {
              setIsAlgoTradeRunning(data.status === 'ACTIVE' || data.status === 'RUNNING' || data.algoRunning === true);
           }
        }
      } catch (err: any) {
        // Suppress benign network flap errors to keep console clean, but log systemic routing errors 
        const isNetworkError = err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError');
        if (!isNetworkError) {
          addLog?.(`HEALTH: Status poll for ${selectedAccountId} failed: ${err.message}`);
          console.error(`[POLL] Status error:`, err);
        }
      }
    };
    
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000); // 15 seconds for reactive UI (backend throttles to 5s)
    return () => clearInterval(interval);
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
           console.warn(`[LIFECYCLE] Account ${id} is not fully active (${data.state}, ${data.connectionStatus}). Skipping websocket boot.`);
           return;
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
        const { accountId, balance, equity, currency } = data;
        console.log(`[WS] Account Update for ${accountId}:`, { balance, equity, currency });
        
        // ZUSTAND SOURCE OF TRUTH Update
        if (accountId === selectedAccountId) {
            // Only update if balance/equity are valid numbers to prevent "0 USD" reset
            const updatePayload: any = {};
            if (balance !== null && balance !== undefined) updatePayload.balance = Number(balance);
            if (equity !== null && equity !== undefined) updatePayload.equity = Number(equity);
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
                currency: currency !== undefined ? currency : acc.currency,
                connectionStatus: isNowReady ? 'CONNECTED' : acc.connectionStatus,
                ready: isNowReady
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


  const handleToggleAlgo = async () => {
    if (!selectedAccountId || !session) return;
    const newState = !isAlgoTradeRunning;
    const mode = executionModes[selectedAccountId] || 'STRATEGY';

    // 1. VALIDATION: Check symbol before starting
    if (newState) {
       if (!selectedSymbol || !availableBrokerSymbols.includes(selectedSymbol)) {
          const msg = `EA ERROR: Cannot start strategy on invalid symbol "${selectedSymbol}". Select a valid one from the list.`;
          addLog(msg);
          alert(msg);
          return;
       }
    }

    try {
      if (mode === 'EA') {
        // LAYER 2: Orchestration - Start/Stop Cloud Algo logic on MetaApi terminal
        // Note: The user prefers the specific EA panels for deployment, 
        // but if the main button is used, we ensure it maps to the correct cloud signal.
        const endpoint = newState ? `/api/account/${selectedAccountId}/start-algo` : `/api/account/${selectedAccountId}/stop-algo`;
        addLog(`ORCHESTRATION: Requesting EA Engine logic ${newState ? 'START' : 'STOP'}...`);
        const res = await safeFetch(endpoint, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          }
        });
        if (res) {
          setIsAlgoTradeRunning(newState);
          addLog(`SUCCESS: ${mode} Engine logic ${newState ? 'ACTIVATED' : 'HALTED'}.`);
        }
      } else {
        // STRATEGY Mode: Toggle Core-side execution loop
        addLog(`STRATEGY: Requesting Core AI cycle ${newState ? 'START' : 'STOP'}...`);
        const data = await safeFetch(`/api/account/${selectedAccountId}/algo/toggle`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ enabled: newState })
        });
        if (data.success) {
          setIsAlgoTradeRunning(newState);
          addLog(`SUCCESS: Core AI analysis cycle set to ${newState ? 'ACTIVE' : 'PAUSED'}.`);
        }
      }
    } catch (err: any) {
      addLog(`FATAL ERROR: Failed to toggle execution state: ${err.message}`);
    }
  };

  const [tradeStatus, setTradeStatus] = useState<string | null>(null);
  const lotSize = strategySettings.lotSize;
  const setLotSize = (val: number) => useStore.getState().setStrategySettings({ lotSize: val });

  const handleBuy = async () => {
    if (!selectedAccountId || !session) {
      alert("Please select a valid account/session first");
      return;
    }
    if (!lotSize || lotSize <= 0) {
      alert("Enter valid lot size");
      return;
    }
    try {
      const currentPositions = useStore.getState().positions;
      const maxTrades = strategySettings.maxTrades || 1;
      const currentAlgoTrades = currentPositions.filter(p => p.comment === 'ALGOTRADE').length;

      if (currentAlgoTrades >= maxTrades) {
         addLog(`EA ERROR: Max trade limit reached (${currentAlgoTrades}/${maxTrades}). Close an existing position first.`);
         return;
      }

      const tradeSymbol = selectedSymbol || (availableBrokerSymbols.length > 0 ? availableBrokerSymbols[0] : 'XAUUSDm');
      addLog(`EA: Executing manual BUY trade via SDK for ${selectedAccountId} on ${tradeSymbol} at ${lotSize} lots...`);
      setTradeStatus("executing");
      const data = await safeFetch('/api/trade/buy', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          accountId: selectedAccountId,
          symbol: tradeSymbol,
          lotSize,
          comment: 'ALGOTRADE'
        })
      });

      if (data.success) {
        addLog(`EA: BUY trade executed successfully: ${JSON.stringify(data.result)}`);
        setTradeStatus("success");
      } else {
        addLog(`EA ERROR: BUY failed: ${data.error}`);
        setTradeStatus("error");
      }
      setTimeout(() => setTradeStatus(null), 3000);
    } catch (err: any) {
      addLog(`EA ERROR: BUY failed: ${err.message}`);
      setTradeStatus("error");
      setTimeout(() => setTradeStatus(null), 3000);
    }
  };

  const handleSell = async () => {
    if (!selectedAccountId || !session) {
      alert("Please select a valid account/session first");
      return;
    }
    if (!lotSize || lotSize <= 0) {
      alert("Enter valid lot size");
      return;
    }
    try {
      const currentPositions = useStore.getState().positions;
      const maxTrades = strategySettings.maxTrades || 1;
      const currentAlgoTrades = currentPositions.filter(p => p.comment === 'ALGOTRADE').length;

      if (currentAlgoTrades >= maxTrades) {
         addLog(`EA ERROR: Max trade limit reached (${currentAlgoTrades}/${maxTrades}). Close an existing position first.`);
         return;
      }

      const tradeSymbol = selectedSymbol || (availableBrokerSymbols.length > 0 ? availableBrokerSymbols[0] : 'XAUUSDm');
      addLog(`EA: Executing manual SELL trade via SDK for ${selectedAccountId} on ${tradeSymbol} at ${lotSize} lots...`);
      setTradeStatus("executing");
      const data = await safeFetch('/api/trade/sell', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          accountId: selectedAccountId,
          symbol: tradeSymbol,
          lotSize,
          comment: 'ALGOTRADE'
        })
      });

      if (data.success) {
        addLog(`EA: SELL trade executed successfully: ${JSON.stringify(data.result)}`);
        setTradeStatus("success");
      } else {
        addLog(`EA ERROR: SELL failed: ${data.error}`);
        setTradeStatus("error");
      }
      setTimeout(() => setTradeStatus(null), 3000);
    } catch (err: any) {
      addLog(`EA ERROR: SELL failed: ${err.message}`);
      setTradeStatus("error");
      setTimeout(() => setTradeStatus(null), 3000);
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
    <div className="relative flex items-center justify-center min-h-screen bg-black overflow-hidden">
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
  
  if (loadingBootstrap || !bootData) return <FullScreenLoader message="Loading trading workspace..." />;

  // Redirect to pricing if user has no active subscription and is not on the pricing page
  const isBootingWithKey = window.location.search.includes('activated=true');
  if (!loadingBootstrap && bootData && !bootData.has_active_subscription && path !== '/pricing' && !isBootingWithKey) {
    window.location.href = '/pricing';
    return <FullScreenLoader message="Redirecting to pricing..." />;
  }


  return (
    <div className={`flex h-screen bg-[#050608] overflow-hidden text-slate-200 transition-colors duration-1000 ${streakThemeClasses}`}>
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

      <div className="relative z-10 flex w-full h-full">
        <ExpertLogPanel executionMode="STRATEGY" />
        
        {/* Sidebar - Desktop & Mobile overlay */}
        <div className={`fixed inset-0 bg-black/85 z-[60] lg:hidden transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsSidebarOpen(false)} />
        <div className={`fixed lg:relative z-[70] lg:z-0 transition-transform duration-300 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} h-full border-r border-white/5 bg-black/95 backdrop-blur-xl`}>
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
        
        <main className="flex-1 flex flex-col overflow-hidden relative w-full bg-black/30">
          <header className="h-14 sm:h-16 border-b border-white/5 flex items-center justify-between px-3 sm:px-6 bg-black/80 backdrop-blur-3xl shrink-0 z-20">
            <div className="flex items-center gap-2 sm:gap-4">
              <button 
                onClick={() => setIsSidebarOpen(true)} 
                className="lg:hidden p-2 hover:bg-white/5 rounded-lg text-slate-400 transition-colors"
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
                onClick={() => setIsDNDActive(!isDNDActive)}
                title={isDNDActive ? "Disable Do Not Disturb" : "Enable Do Not Disturb"}
                className={`p-1.5 sm:p-2 rounded-lg border transition-all active:scale-95 ${
                  isDNDActive 
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' 
                    : 'hover:bg-white/5 border-white/5 text-slate-400'
                }`}
              >
                {isDNDActive ? <BellOff className="w-3.5 h-3.5 sm:w-4 h-4" /> : <Bell className="w-3.5 h-3.5 sm:w-4 h-4" />}
              </button>

              <button onClick={verifyAndFetch} className="p-1.5 sm:p-2 hover:bg-white/5 rounded-lg border border-white/5 transition-all active:scale-95">
                <RefreshCw className={`w-3.5 h-3.5 sm:w-4 h-4 text-slate-400 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-3 sm:p-6 custom-scrollbar z-10 w-full overflow-x-hidden">
            <div className="max-w-[1600px] mx-auto w-full space-y-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, scale: 0.98, Filter: 'blur(10px)' }}
                animate={{ opacity: 1, scale: 1, Filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 1.02, Filter: 'blur(10px)' }}
                transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              >
                {activeTab === 'chatrade' && (
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
                  />
                )}
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
                {activeTab === 'accounts' && <AccountConfig accounts={accounts} setAccounts={setAccounts} token={session?.access_token} subscriptionPlan={bootData?.subscription_plan} onSelectAccount={(id) => { handleAccountSelect(id); setActiveTab("data"); }} />}
                {activeTab === 'risk' && <RiskManagement />}
                <div style={{ display: activeTab === 'data' ? 'block' : 'none' }}>
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
        <nav className="h-14 sm:h-16 bg-black/60 backdrop-blur-md border-t border-white/5 flex items-center justify-center gap-6 sm:gap-16 px-4 shrink-0 z-20 pb-safe w-full">
          <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center gap-1 w-16 transition-all active:scale-95 ${activeTab === 'dashboard' ? 'text-white drop-shadow-[0_0_10px_rgba(var(--accent-color-rgb),0.5)]' : 'text-slate-500 hover:text-slate-300'}`} style={activeTab === 'dashboard' ? { color: 'var(--accent-color)' } : {}}>
            <Activity className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[10px] font-mono font-bold uppercase transition-colors">Metrics</span>
          </button>
          <button onClick={() => setActiveTab('data')} className={`flex flex-col items-center gap-1 w-16 transition-all active:scale-95 ${activeTab === 'data' ? 'text-white drop-shadow-[0_0_10px_rgba(var(--accent-color-rgb),0.5)]' : 'text-slate-500 hover:text-slate-300'}`} style={activeTab === 'data' ? { color: 'var(--accent-color)' } : {}}>
            <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[10px] font-mono font-bold uppercase transition-colors">Market</span>
          </button>
          <button onClick={() => setActiveTab('accounts')} className={`flex flex-col items-center gap-1 w-16 transition-all active:scale-95 ${activeTab === 'accounts' ? 'text-white drop-shadow-[0_0_10px_rgba(var(--accent-color-rgb),0.5)]' : 'text-slate-500 hover:text-slate-300'}`} style={activeTab === 'accounts' ? { color: 'var(--accent-color)' } : {}}>
            <Users className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[10px] font-mono font-bold uppercase transition-colors">Account</span>
          </button>
          <button onClick={() => setActiveTab('risk')} className={`flex flex-col items-center gap-1 w-16 transition-all active:scale-95 ${activeTab === 'risk' ? 'text-white drop-shadow-[0_0_10px_rgba(var(--accent-color-rgb),0.5)]' : 'text-slate-500 hover:text-slate-300'}`} style={activeTab === 'risk' ? { color: 'var(--accent-color)' } : {}}>
            <Shield className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[10px] font-mono font-bold uppercase transition-colors">Risk</span>
          </button>
        </nav>
      </main>
      </div>
    </div>
  );
};

export default App;
