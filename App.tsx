
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
import ExpertAdvisorDeployer from './components/ExpertAdvisorDeployer';
import SystemMonitor from './components/SystemMonitor';
import { ExpertLogPanel } from './components/ExpertLogPanel';
import MarketData from './components/MarketData';
import ChartSettings from './components/ChartSettings';
import { ErrorBoundary } from './components/ErrorBoundary';
import { connectionManager } from './src/lib/ConnectionManager';
import { safeFetch } from './src/lib/utils';
import { supabase } from './src/lib/supabase';
import { LoginForm } from './src/components/Auth/LoginForm';
import { FullScreenLoader } from './src/components/Auth/FullScreenLoader';
import { useStore } from './src/store';

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

  useEffect(() => {
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
    if (!session) return;
    setLoadingBootstrap(true);

    safeFetch("/api/user/bootstrap", {
      headers: { Authorization: `Bearer ${session.access_token}` }
    })
    .then(data => {
      setBootData(data);
      if (data.execution_modes) {
        setExecutionModes(data.execution_modes);
      }
    })
    .catch(err => {
      addLog(`FATAL: Failed to retrieve system configuration: ${err.message}`);
    })
    .finally(() => {
      setLoadingBootstrap(false);
    });
  }, [session]);

  // Global State
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'dashboard');
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
  const [isLogsUnlocked, setIsLogsUnlocked] = useState(() => localStorage.getItem('isLogsUnlocked') === 'true');
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [openPositions, setOpenPositions] = useState<number>(0);
  const [isAlgoTradeRunning, setIsAlgoTradeRunning] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState(() => localStorage.getItem('selectedAccountId') || '');
  const [tradingStatus, setTradingStatus] = useState<string>('INIT');
  const [availableBrokerSymbols, setAvailableBrokerSymbols] = useState<string[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState(() => localStorage.getItem('selectedSymbol') || 'XAUUSDm');

  // Sync selectedSymbol with store strategy settings
  useEffect(() => {
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
      try {
        const res = await fetch(`/api/account/${selectedAccountId}/status`, {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        if (res.ok) {
           const data = await res.json();
           setEaStatuses(prev => ({ ...prev, [selectedAccountId]: data }));
           // Sync algo running state with terminal state if in EA mode
           if (executionModes[selectedAccountId] === 'EA') {
              setIsAlgoTradeRunning(data.status === 'ACTIVE' || data.status === 'RUNNING');
           }
        }
      } catch (err: any) {
        if (!err.message?.includes('Failed to fetch')) {
          console.error("EA status poll failed:", err);
        }
      }
    };
    
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000); // 15 seconds to limit CPU credits
    return () => clearInterval(interval);
  }, [selectedAccountId, session, executionModes]);

  const addLog = useCallback((msg: string) => {
    // DND Filter: Suppress non-critical messages
    if (isDNDActive && (
      msg.startsWith('STREAM:') || 
      msg.startsWith('HEALTH:') || 
      msg.startsWith('BROKER:') || 
      msg.startsWith('RPC:') ||
      msg.startsWith('EA:') ||
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
    
    setSelectedAccountId(id);
    localStorage.setItem('selectedAccountId', id);
    
    const fetchAlgoStatus = async () => {
       try {
         const data = await safeFetch(`/api/account/${id}/status`, {
           headers: { Authorization: `Bearer ${session.access_token}` }
         });
         if (data.algoRunning !== undefined) {
           setIsAlgoTradeRunning(data.algoRunning);
         }
       } catch (e) {
         console.warn("[LIFECYCLE] Failed to sync algo status", e);
       }
    };
    fetchAlgoStatus();
    
    try {
      // 3. EXECUTE: Single entry point to connection manager
      connectionManager.bootOnce(id, serverUrl);
    } catch (err: any) {
      addLog(`FATAL: ${err.message}`);
      setTradingStatus('CONFIG_ERROR');
    }
  }, [bootData, addLog, session]);

  // Helper to determine if trading is ready
  const isTradingReady = useCallback((status: string) => {
    return status === 'READY' || status === 'SYNCING';
  }, []);

  // Unified Bootstrapper: Only fire once we have BOTH an ID and bootData
  useEffect(() => {
    if (!bootData || !session) return;
    
    const savedId = localStorage.getItem('selectedAccountId');
    if (savedId) {
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
      // Logic remained for global connection status
      if (phase === 'READY') {
          setConnectionStatus('READY');
          setSdkStatus('CONNECTED');
      } else if (phase === 'SYNCING') {
          setConnectionStatus('SYNCING');
          setSdkStatus('SYNCING');
      } else if (phase === 'CONNECTING') {
          setConnectionStatus('CONNECTING');
          setSdkStatus('BOOTING');
      } else if (phase === 'OFFLINE') {
          setConnectionStatus('OFFLINE');
          // Removed: setSdkStatus('OFFLINE'); // Don't flip to offline just because WS disconnected briefly
      } else {
          setConnectionStatus('INIT');
      }
    });

    const unsubData = connectionManager.subscribe((data: any) => {
      if (data.type === 'status:update') {
          if (data.accountId === selectedAccountId) {
              setSdkStatus(data.status === 'SYNCHRONIZED' ? 'CONNECTED' : data.status);
          }
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
                ready: isNowReady
              };
            }
            return acc;
          });
          return updated;
        });
      }

      if (data.type === 'EA_JOURNAL') {
        const payloadStr = Object.keys(data.metadata || {}).length > 0 ? JSON.stringify(data.metadata) : '';
        addLog(`[EA][${data.level}] ${data.message} ${payloadStr}`);
      }

      const store = useStore.getState();
      if (data.type === 'POSITIONS_SNAPSHOT') {
        store.setPositions(data.data || []);
      } else if (data.type === 'POSITION_UPDATE') {
        const p = store.positions;
        const exists = p.findIndex(pos => pos.id === data.data.id);
        if (exists !== -1) {
          const np = [...p];
          np[exists] = data.data;
          store.setPositions(np);
        } else {
          store.setPositions([...p, data.data]);
        }
      } else if (data.type === 'POSITION_REMOVED') {
        store.setPositions(store.positions.filter(p => p.id !== data.data.id));
      } else if (data.type === 'HISTORY_ORDER_ADDED') {
        store.setHistory([data.data, ...store.history].slice(0, 20));
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

  useEffect(() => {
    localStorage.setItem('isLogsUnlocked', isLogsUnlocked.toString());
  }, [isLogsUnlocked]);



  // Handle Available Symbols fetch
  useEffect(() => {
    if (!selectedAccountId || !session) return;

    const fetchBrokerSymbols = async (retries = 5) => {
      try {
        const brokerSymbols = await safeFetch(`/api/account/${selectedAccountId}/symbols`, {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        setAvailableBrokerSymbols(brokerSymbols);
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
  }, [selectedAccountId, addLog, session]);

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

  const handleUnlockLogs = (e: React.FormEvent) => {
    e.preventDefault();
    const correctPassword = import.meta.env.VITE_SYSTEM_LOG || import.meta.env.VITE_SYSTEM_LOGS_PASSWORD || 'vite system log';
    if (passwordInput === correctPassword) {
      setIsLogsUnlocked(true);
      setPasswordError(false);
      addLog("ADMIN: System logs unlocked.");
    } else {
      setPasswordError(true);
      addLog("SECURITY: Unauthorized access attempt.");
    }
  };

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
        addLog(`SDK: Synchronization in progress on London Cluster...`);
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
          ready: (acc.connectionStatus === 'CONNECTED') || (acc.balance !== null && Number(acc.balance) > 0) || (existingAcc?.ready || false)
        };
        
        if (accId === selectedAccountId) {
            connectionManager.setRestHydrated(accId, true);
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
        setLastError(`Cluster Exception: ${err.message}`);
        addLog(`FATAL: Connection lost to London Cluster. Re-attempting handshake in 60s.`);
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
    // Perform initial synchronization only
    verifyAndFetch();
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
  if (!session) return (
    <div className="relative flex items-center justify-center min-h-screen bg-[#090b14] overflow-hidden">
      {/* Deep robotic background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-slate-900/50 to-cyan-900/20 z-0 mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-[url('https://storage.googleapis.com/aida-uploads/default/14cb5da6-8f37-4d9e-bdb3-fc14b74bbde8/image.webp')] bg-cover bg-center bg-no-repeat opacity-60 z-0"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-[#02040a] via-transparent to-transparent z-0 opacity-80"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]"></div>
      </div>
      <LoginForm />
    </div>
  );
  if (loadingBootstrap || !bootData) return <FullScreenLoader message="Loading trading workspace..." />;

  return (
    <div className="flex h-screen bg-[#02040a] overflow-hidden text-slate-200 cyber-grid">
      <ExpertLogPanel executionMode="STRATEGY" />
      {/* Sidebar - Desktop & Mobile overlay */}
      <div className={`fixed inset-0 bg-black/60 z-[60] lg:hidden transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsSidebarOpen(false)} />
      <div className={`fixed lg:relative z-[70] lg:z-0 transition-transform duration-300 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} h-full`}>
        <Sidebar activeTab={activeTab} setActiveTab={(tab) => { setActiveTab(tab); setIsSidebarOpen(false); }} />
      </div>
      
      <main className="flex-1 flex flex-col overflow-hidden relative w-full">
        <header className="h-16 sm:h-20 border-b border-white/5 flex items-center justify-between px-3 sm:px-10 bg-slate-900/10 backdrop-blur-3xl shrink-0 z-20">
          <div className="flex items-center gap-2 sm:gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)} 
              className="lg:hidden p-2 hover:bg-white/5 rounded-xl text-slate-400"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="text-lg sm:text-2xl font-black text-white tracking-tighter uppercase truncate ml-2">
              ALGOTRADE
            </h1>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-5 flex-1 min-w-0 justify-end">
            <div className="flex items-center">
              {tradingStatus === 'BOOTING' || tradingStatus === 'INIT' ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl animate-pulse">
                  <Cloud className="w-3.5 h-3.5 text-indigo-500 animate-bounce" />
                  <span className="text-[8px] sm:text-[12px] font-black text-indigo-500 uppercase tracking-widest whitespace-nowrap">BOOTING</span>
                </div>
              ) : tradingStatus === 'SYNCING' ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                  <span className="text-[8px] sm:text-[12px] font-black text-blue-500 uppercase tracking-widest whitespace-nowrap">SYNCING</span>
                </div>
              ) : tradingStatus === 'OFFLINE' ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                  <span className="text-[8px] sm:text-[12px] font-black text-rose-500 uppercase tracking-widest whitespace-nowrap">OFFLINE</span>
                </div>
              ) : tradingStatus === 'READY' ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-[8px] sm:text-[12px] font-black text-emerald-500 uppercase tracking-widest whitespace-nowrap">CONNECTED</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-500/10 border border-slate-500/20 rounded-xl">
                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-[8px] sm:text-[12px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">{tradingStatus}</span>
                </div>
              )}
            </div>

             <button
               onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }}
               className="hidden sm:inline-block text-[10px] sm:text-xs font-black text-rose-500 hover:text-white uppercase tracking-widest px-3 py-1.5 transition-colors"
             >
               Logout
             </button>

            <button 
              onClick={() => setIsDNDActive(!isDNDActive)}
              title={isDNDActive ? "Disable Do Not Disturb" : "Enable Do Not Disturb"}
              className={`p-2 sm:p-2.5 rounded-xl border transition-all active:scale-95 ${
                isDNDActive 
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' 
                  : 'hover:bg-white/5 border-white/5 text-slate-400'
              }`}
            >
              {isDNDActive ? <BellOff className="w-4 h-4 sm:w-5 h-5" /> : <Bell className="w-4 h-4 sm:w-5 h-5" />}
            </button>

            <button onClick={verifyAndFetch} className="p-2 sm:p-2.5 hover:bg-white/5 rounded-xl border border-white/5 transition-all active:scale-95">
              <RefreshCw className={`w-4 h-4 sm:w-5 h-5 text-slate-400 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar z-10 w-full overflow-x-hidden">
          <div className="max-w-[1600px] mx-auto w-full space-y-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, scale: 0.98, Filter: 'blur(10px)' }}
                animate={{ opacity: 1, scale: 1, Filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 1.02, Filter: 'blur(10px)' }}
                transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              >
                {activeTab === 'dashboard' && (
                  <Dashboard 
                    accounts={accounts} 
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
                  />
                )}
                {activeTab === 'accounts' && <AccountConfig accounts={accounts} setAccounts={setAccounts} token={session?.access_token} />}
                {activeTab === 'ea-deployer' && <ExpertAdvisorDeployer accounts={accounts} availableBrokerSymbols={availableBrokerSymbols} token={session?.access_token} />}
                {activeTab === 'data' && (
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
                      executionMode={executionModes[selectedAccountId] || 'EA'}
                      eaStatus={eaStatuses[selectedAccountId]}
                      onSwitchMode={handleSwitchMode}
                      onDeploy={handleDeployTerminal}
                      onUndeploy={handleUndeployTerminal}
                      setActiveTab={setActiveTab}
                      token={session?.access_token}
                    />
                  </ErrorBoundary>
                )}
                {activeTab === 'settings' && (
                  <ErrorBoundary>
                    <ChartSettings />
                  </ErrorBoundary>
                )}
                {activeTab === 'logs' && (
                  <ErrorBoundary>
                    {isLogsUnlocked ? (
                      <SystemMonitor 
                        logs={logs} 
                        isAuthValid={isAuthValid} 
                        lastError={lastError} 
                        sdkStatus={sdkStatus}
                        onLock={() => {
                          setIsLogsUnlocked(false);
                          setPasswordInput('');
                          addLog("ACCESS: System logs locked by administrator.");
                        }} 
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-[600px] animate-in fade-in zoom-in-95 duration-500">
                        <div className="bg-slate-900/40 border border-white/10 p-10 rounded-[40px] shadow-2xl backdrop-blur-xl max-w-md w-full space-y-8 text-center">
                          <div className="w-20 h-20 bg-indigo-500/10 rounded-[30px] flex items-center justify-center border border-indigo-500/20 mx-auto">
                            <LockIcon className="text-indigo-500 w-10 h-10" />
                          </div>
                          <div className="space-y-2">
                            <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Encrypted Access</h2>
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">System logs are restricted to authorized personnel only.</p>
                          </div>
                          
                          <form onSubmit={handleUnlockLogs} className="space-y-4">
                            <div className="relative">
                              <input 
                                type="password" 
                                value={passwordInput}
                                onChange={(e) => setPasswordInput(e.target.value)}
                                placeholder="ENTER ACCESS KEY"
                                className={`w-full bg-black/40 border ${passwordError ? 'border-rose-500/50' : 'border-white/10'} rounded-2xl px-6 py-4 text-center font-mono text-sm tracking-[0.3em] focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-slate-700`}
                                autoFocus
                              />
                              {passwordError && (
                                <p className="text-rose-500 text-[10px] font-black uppercase tracking-widest mt-2 animate-pulse">Invalid Access Key</p>
                              )}
                            </div>
                            <button 
                              type="submit"
                              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-xs transition-all active:scale-95 shadow-lg shadow-indigo-500/20"
                            >
                              Authorize Access
                            </button>
                          </form>
                        </div>
                      </div>
                    )}
                  </ErrorBoundary>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Desktop Footer - Hidden on mobile */}
        <footer className="hidden lg:flex h-10 bg-black border-t border-white/5 items-center px-4 sm:px-10 gap-4 text-[7px] sm:text-[8px] uppercase tracking-[0.2em] sm:tracking-[0.4em] font-black text-slate-600 shrink-0 z-20 overflow-hidden">
          <div className="flex items-center gap-2 truncate">
            <LockIcon className="w-2.5 h-2.5 sm:w-3 h-3 text-indigo-500 shrink-0" />
            <span className="truncate">ENGINE: ALGOTRADE</span>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-4 shrink-0">
             <span className="hidden xs:inline">REGION: london.cluster</span>
             <span className="text-indigo-500/50 truncate">v3-secured</span>
          </div>
        </footer>

        {/* Bottom Navigation */}
        <nav className="h-16 lg:h-20 bg-slate-900 border-t border-white/5 flex items-center justify-center gap-8 sm:gap-16 px-4 shrink-0 z-20 pb-safe w-full">
          <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center gap-1 w-16 transition-colors ${activeTab === 'dashboard' ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}>
            <Activity className="w-5 h-5 lg:w-6 lg:h-6" />
            <span className="text-[10px] lg:text-xs font-bold">Metrics</span>
          </button>
          <button onClick={() => setActiveTab('data')} className={`flex flex-col items-center gap-1 w-16 transition-colors ${activeTab === 'data' ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}>
            <TrendingUp className="w-5 h-5 lg:w-6 lg:h-6" />
            <span className="text-[10px] lg:text-xs font-bold">Market</span>
          </button>
          <button onClick={() => setActiveTab('ea-deployer')} className={`flex flex-col items-center gap-1 w-16 transition-colors ${activeTab === 'ea-deployer' ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}>
            <Terminal className="w-5 h-5 lg:w-6 lg:h-6" />
            <span className="text-[10px] lg:text-xs font-bold">Terminal</span>
          </button>
          <button onClick={() => setActiveTab('accounts')} className={`flex flex-col items-center gap-1 w-16 transition-colors ${activeTab === 'accounts' ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}>
            <Users className="w-5 h-5 lg:w-6 lg:h-6" />
            <span className="text-[10px] lg:text-xs font-bold">Account</span>
          </button>
        </nav>
      </main>
    </div>
  );
};

export default App;
