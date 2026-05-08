
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { TradingAccount, PlatformType, ExpertAdvisor } from '../types';
import { safeFetch } from '../src/lib/utils';
import { 
  Trash2, Server, Zap, Loader2, Info, ShieldCheck, 
  Upload, FileCheck, AlertTriangle, Settings2, Database,
  ChevronRight, Pencil, X, Globe, Key, RefreshCw, Power, PowerOff, Link as LinkIcon,
  Cpu, Activity, FileCode, CheckCircle2, Save, FileUp, Plus, Search, Terminal
} from 'lucide-react';

interface AccountConfigProps {
  accounts: TradingAccount[];
  setAccounts: React.Dispatch<React.SetStateAction<TradingAccount[]>>;
  token?: string;
  onSelectAccount?: (id: string) => void;
}

interface ProvisioningProfile {
  _id?: string;
  id?: string;
  name: string;
  version: number;
  status: string;
  brokerTimezone: string;
  brokerDSTSwitchTimezone: string;
  type: string;
}

const TRISPIN_EA_CODE = `//+------------------------------------------------------------------+
//|                                          TRISPIN-ICT-SCALPER.mq4 |
//|                                          Copyright 2024, TRISPIN |
//|   "https://www.instagram.com/trispin_409trader/profilecard/?igsh |
//+------------------------------------------------------------------+
#property copyright "Copyright 2024, TRISPIN"
#property link      "//www.instagram.com/trispin_409trader/profilecard/?igsh"
#property version   "1.00"
#property strict

// Define the strategy parameters
input int ICT_tenkan_period = 9;
input int ICT_kijun_period = 26;
input int ICT_senkou_period = 52;
input int ICT_displacement = 26;

input int SMC_short_MA_period = 50;
input int SMC_long_MA_period = 200;

input double price_action_threshold = 20;

// Simple Moving Average (SMA) crossover settings
input int smaFastPeriod = 50;   // Fast SMA period
input int smaSlowPeriod = 200;  // Slow SMA period

input int stoploss = 5000; // in pips
input int takeprofit = 13000; // in pips
input double position_size_min = 0.01; // minimum position size
input double position_size_max = 0.01; // maximum position size
input int NumberOfPositions = 5;
input int Slippage = 3;    // Slippage in points
input int fastMA = 12;     // Fast MA period
input int slowMA = 26;     // Slow MA period
  
input string position_name = "TRISPIN-ICT-SCALPER";

// MACD parameters
input int macdFastEMA = 12;     // Fast EMA period for MACD
input int macdSlowEMA = 26;     // Slow EMA period for MACD
input int macdSignalSMA = 9;    // Signal line period for MACD
input ENUM_APPLIED_PRICE macdApplyTo = PRICE_CLOSE;  // Applied price for MACD calculation

// Define the trading symbol and time frame
input string symbol = "XAUUSD.m";
input ENUM_TIMEFRAMES timeframe = PERIOD_M15;

// Define the trading pairs
string pairs[] = {"XAUUSD.m"};

// Define MagicNumber for trade identification
input int MagicNumber = 10101;  // Replace with your desired magic number

// Image display settings
input int ImageWidth = 200;  // Image width in pixels
input int ImageHeight = 200; // Image height in pixels
input string imageName = "richfield_license.bmp"; // Image file name (must be in MQL4\\\\Images folder)

// Function to fetch market data for specified Forex pairs
void fetch_market_data(string &symbols[]) {
    int totalBars = 100;
    datetime timestamp;
    double price;
    for (int i = 0; i < ArraySize(symbols); i++) {
        string pair = symbols[i];
        for (int j = 0; j < totalBars; j++) {
            timestamp = TimeCurrent() - j * PeriodSeconds(timeframe);
            price = MathRand() * 100;
        }
    }
}

string ErrorDescription(int code) {
    switch(code) {
        case 1: return "No error returned";
        case 2: return "Common error";
        case 3: return "Invalid trade parameters";
        case 4: return "Trade server is busy";
        case 5: return "Old version of the client terminal";
        case 6: return "No connection with trade server";
        case 7: return "Not enough rights";
        case 8: return "Too frequent requests";
        case 9: return "Malfunctional trade operation";
        case 133: return "Market is closed";
        case 134: return "Trade is disabled";
        case 135: return "Not enough money";
        default: return "Unknown error";
    }
}

int count_open_positions() {
    int count = 0;
    for (int i = 0; i < OrdersTotal(); i++) {
        if (OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) {
            if (OrderSymbol() == Symbol() && OrderMagicNumber() == MagicNumber) {
                count++;
            }
        }
    }
    return count;
}

bool apply_ict_strategy() {
    double tenkanSen = iIchimoku(Symbol(), Period(), ICT_tenkan_period, ICT_kijun_period, ICT_senkou_period, MODE_TENKANSEN, 0);
    double kijunSen = iIchimoku(Symbol(), Period(), ICT_tenkan_period, ICT_kijun_period, ICT_senkou_period, MODE_KIJUNSEN, 0);
    if (tenkanSen > kijunSen) return true;
    if (tenkanSen < kijunSen) return false;
    return false;
}

bool apply_smc_strategy() {
    double shortMA = iMA(Symbol(), Period(), SMC_short_MA_period, 0, MODE_SMA, PRICE_CLOSE, 0);
    double longMA = iMA(Symbol(), Period(), SMC_long_MA_period, 0, MODE_SMA, PRICE_CLOSE, 0);
    if (shortMA > longMA) return true;
    if (shortMA < longMA) return false;
    return false;
}

bool apply_sma_strategy() {
    double smaFast = iMA(Symbol(), Period(), smaFastPeriod, 0, MODE_SMA, PRICE_CLOSE, 0);
    double smaSlow = iMA(Symbol(), Period(), smaSlowPeriod, 0, MODE_SMA, PRICE_CLOSE, 0);
    if (smaFast > smaSlow) return true;
    if (smaFast < smaSlow) return false;
    return false;
}

bool apply_macd_strategy() {
    double macdLine = iMACD(Symbol(), Period(), macdFastEMA, macdSlowEMA, macdSignalSMA, macdApplyTo, MODE_MAIN, 0);
    double signalLine = iMACD(Symbol(), Period(), macdFastEMA, macdSlowEMA, macdSignalSMA, macdApplyTo, MODE_SIGNAL, 0);
    if (macdLine > signalLine) return true;
    if (macdLine < signalLine) return false;
    return false;
}

void open_buy_trade() {
    double lotSize = position_size_min;
    double price = Ask;
    double sl = price - stoploss * Point;
    double tp = price + takeprofit * Point;
    int ticket = OrderSend(Symbol(), OP_BUY, lotSize, price, Slippage, sl, tp, position_name, MagicNumber, 0, Blue);
    if (ticket < 0) Print("Error opening buy: ", ErrorDescription(GetLastError()));
}

void open_sell_trade() {
    double lotSize = position_size_min;
    double price = Bid;
    double sl = price + stoploss * Point;
    double tp = price - takeprofit * Point;
    int ticket = OrderSend(Symbol(), OP_SELL, lotSize, price, Slippage, sl, tp, position_name, MagicNumber, 0, clrRed);
    if (ticket < 0) Print("Error opening sell: ", ErrorDescription(GetLastError()));
}

void execute_trades() {
    int buySignalCount = 0; int sellSignalCount = 0;
    if (apply_ict_strategy()) buySignalCount++; else sellSignalCount++;
    if (apply_smc_strategy()) buySignalCount++; else sellSignalCount++;
    if (apply_sma_strategy()) buySignalCount++; else sellSignalCount++;
    if (apply_macd_strategy()) buySignalCount++; else sellSignalCount++;
    int open_positions = count_open_positions();
    if (open_positions < NumberOfPositions) {
        if (buySignalCount > sellSignalCount) open_buy_trade();
        else if (sellSignalCount > buySignalCount) open_sell_trade();
    }
}

int OnInit() {
    DisplayImage();
    return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) {
    ObjectDelete(0, "ImageDisplay");
}

void OnTick() {
    execute_trades();
}

void DisplayImage() {
    int chartWidth = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS, 0);
    int chartHeight = (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS, 0);
    int centerX = (chartWidth - ImageWidth) / 2;
    int centerY = (chartHeight - ImageHeight) / 2;
    ObjectCreate(0, "ImageDisplay", OBJ_BITMAP_LABEL, 0, 0, 0);
    ObjectSetString(0, "ImageDisplay", OBJPROP_BMPFILE, imageName);
    ObjectSetInteger(0, "ImageDisplay", OBJPROP_XDISTANCE, centerX);
    ObjectSetInteger(0, "ImageDisplay", OBJPROP_YDISTANCE, centerY);
}
`;

const safeBtoa = (str: string): string => {
  try {
    return btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
        return String.fromCharCode(parseInt(p1, 16));
      })
    );
  } catch (e) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
};

const AccountConfig: React.FC<AccountConfigProps> = ({ accounts, setAccounts, token, onSelectAccount }) => {
  const [view, setView] = useState<'accounts' | 'profiles'>('accounts');
  const [isAdding, setIsAdding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [profiles, setProfiles] = useState<ProvisioningProfile[]>([]);
  const [activeStep, setActiveStep] = useState<'idle' | 'deploying' | 'polling'>('idle');
  const [inspectingAccount, setInspectingAccount] = useState<TradingAccount | null>(null);
  const [expertAdvisors, setExpertAdvisors] = useState<ExpertAdvisor[]>([]);
  const [loadingEAs, setLoadingEAs] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pollingMessage, setPollingMessage] = useState<string>('');
  const [systemLogs, setSystemLogs] = useState<string[]>([]);
  
  const [serverSearchQuery, setServerSearchQuery] = useState('');
  const [discoveredServers, setDiscoveredServers] = useState<Record<string, string[]>>({});
  const [isSearchingServers, setIsSearchingServers] = useState(false);

  const [isAddingEA, setIsAddingEA] = useState(false);
  const [eaFormData, setEaFormData] = useState({
    expertId: '',
    symbol: 'EURUSD',
    period: '1h',
    preset: ''
  });

  const [formData, setFormData] = useState({ 
    name: '', 
    platform: '4', 
    login: '', 
    password: '', 
    server: '',
    timezone: 'EET',
    dstTimezone: 'EET'
  });
  
  const addSystemLog = (msg: string) => {
    setSystemLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
  };

  const fetchProfiles = useCallback(async () => {
    // getProvisioningProfiles is no longer supported by the SDK, 
    // so we skip this fetch and use a default empty array.
    setProfiles([]);
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  useEffect(() => {
    const searchServers = async () => {
      if (serverSearchQuery.length < 3) {
        setDiscoveredServers({});
        return;
      }
      setIsSearchingServers(true);
      try {
        const data = await safeFetch(`/api/servers/search?name=${encodeURIComponent(serverSearchQuery)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        setDiscoveredServers(data || {});
      } catch (err) {
        console.error("Server search failed", err);
      } finally {
        setIsSearchingServers(false);
      }
    };

    const timer = setTimeout(searchServers, 600);
    return () => clearTimeout(timer);
  }, [serverSearchQuery]);

  const handleDeleteAccount = async (accountId: string, accountName: string, accountLogin: string) => {
    if (!confirm(`Hide terminal "${accountName}" (${accountLogin}) from the UI?`)) return;
    
    setActionLoading(`${accountId}-delete`);
    setIsAdding(true); 
    setSystemLogs([]);
    addSystemLog(`SYSTEM_TERMINAL_V1.0 | CLUSTER_PURGE_REQUEST`);

    try {
      addSystemLog(`COMMAND: Decommissioning resources via SDK Provisioner...`);
      await safeFetch(`/api/account/${accountId}/lease`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      addSystemLog(`SUCCESS: Resources released for account ${accountLogin}.`);
      setAccounts(prev => prev.filter(acc => acc.id !== accountId));
      setTimeout(() => {
        setIsAdding(false);
        setActiveStep('idle');
        setActionLoading(null);
      }, 1500);
    } catch (err: any) {
      addSystemLog(`FATAL: SDK Provider failure. ${err.message}`);
      setActionLoading(null);
    }
  };

  const handleUpdateEA = async (accountId: string) => {
    if (!eaFormData.expertId || !eaFormData.symbol) {
      alert("Expert ID and Symbol are required.");
      return;
    }
    setIsSubmitting(true);
    try {
      const presetBase64 = eaFormData.preset ? safeBtoa(eaFormData.preset) : "";
      await safeFetch(`/api/account/${accountId}/ea/${eaFormData.expertId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          symbol: eaFormData.symbol,
          period: eaFormData.period,
          preset: presetBase64
        })
      });

      // Redeploy account via SDK Synchronizer
      await safeFetch(`/api/account/${accountId}/redeploy`, { 
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      await fetchExpertAdvisors(accountId);
      setIsAddingEA(false);
    } catch (err: any) {
      alert(`Update Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEA = async (accountId: string, expertId: string) => {
    if (!confirm(`Delete Expert Advisor "${expertId}"?`)) return;
    setActionLoading(`delete-ea-${expertId}`);
    try {
      await safeFetch(`/api/account/${accountId}/ea/${expertId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      await safeFetch(`/api/account/${accountId}/redeploy`, { 
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      await fetchExpertAdvisors(accountId);
    } catch (err: any) {
      alert(`Delete Error: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleEAFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, accountId: string, expertId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setActionLoading(`upload-${expertId}`);
    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      await safeFetch(`/api/account/${accountId}/ea/${expertId}/file`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ fileBase64 })
      });

      await safeFetch(`/api/account/${accountId}/redeploy`, { 
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      alert("Binary synchronized successfully.");
      await fetchExpertAdvisors(accountId);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const fetchExpertAdvisors = async (accountId: string) => {
    setLoadingEAs(true);
    try {
      const data = await safeFetch(`/api/account/${accountId}/ea`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      setExpertAdvisors(data);
    } catch (err) {
      console.error("Failed to fetch EAs:", err);
    } finally {
      setLoadingEAs(false);
    }
  };

  const handleReconnect = async (accountId: string) => {
    setActionLoading(`${accountId}-reconnect`);
    try {
      await safeFetch(`/api/account/${accountId}/deploy`, { 
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      addSystemLog(`COMMAND: Reconnection signal broadcast to Cloud Node for ${accountId}.`);
    } catch (err: any) {
      alert(`Reconnect Error: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleNodeAction = async (accountId: string, action: 'deploy' | 'undeploy' | 'redeploy') => {
    setActionLoading(`${accountId}-${action}`);
    try {
      await safeFetch(`/api/account/${accountId}/${action}`, { 
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      alert(`Request [${action.toUpperCase()}] submitted to SDK Synchronizer.`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const generateTransactionId = () => {
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  };

  const handleCreateAccount = async () => {
    if (!formData.name || !formData.server || !formData.login || !formData.password) {
      alert("Please complete all fields for deployment.");
      return;
    }

    setIsSubmitting(true);
    setSystemLogs([]);
    const transactionId = generateTransactionId();
    addSystemLog(`INITIALIZING AUTOMATIC DETECTION ENGINE [TX: ${transactionId.slice(0, 8)}]`);
    
    try {
      setActiveStep('deploying');
      addSystemLog(`STEP 1: Requesting Terminal with Platform MT${formData.platform} Detection via SDK Service...`);
      addSystemLog(`NOTE: Real-time authentication can take 15-45 seconds. Please wait...`);

      const payload: any = {
        name: formData.name,
        server: formData.server,
        login: formData.login,
        password: formData.password,
        platform: formData.platform === '5' ? 'mt5' : 'mt4',
        type: 'cloud-g2',
        magic: 10101,
        metastatsApiEnabled: true
      };

      const accountData = await safeFetch(`/api/accounts`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      const accountId = accountData.id || accountData._id;
      
      addSystemLog(`SUCCESS: Cloud Terminal ID ${accountId.slice(0, 8)} created.`);
      setAccounts(prev => {
        if (!prev.find(a => a.id === accountId)) {
          return [...prev, accountData];
        }
        return prev;
      });
      setIsAdding(false);
      setActiveStep('idle');
    } catch (err: any) {
      addSystemLog(`CRITICAL FAULT: ${err.message}`);
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 w-full max-w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white/5 p-6 sm:p-8 rounded-[30px] sm:rounded-[40px] border border-white/5 backdrop-blur-md gap-4">
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="w-12 h-12 sm:w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20 shadow-inner shrink-0">
            <Database className="text-indigo-400 w-6 h-6 sm:w-7 h-7" />
          </div>
          <div>
            <h2 className="text-lg sm:text-2xl font-black text-white tracking-tight uppercase truncate">Metatrader account</h2>
            <div className="flex items-center gap-3 sm:gap-4 mt-1">
              <button onClick={() => setView('accounts')} className={`text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-colors ${view === 'accounts' ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}>Terminals</button>
              <span className="w-1 h-1 rounded-full bg-slate-800 shrink-0"></span>
              <button onClick={() => setView('profiles')} className={`text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-colors ${view === 'profiles' ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}>Profiles</button>
            </div>
          </div>
        </div>
        {!isAdding && view === 'accounts' && (
          <button onClick={() => { setIsAdding(true); setSystemLogs([]); setActiveStep('idle'); }} className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-xl font-black transition-all shadow-lg shadow-indigo-600/20 active:scale-95 text-[10px] sm:text-xs uppercase tracking-widest">
            Add
          </button>
        )}
      </div>

      {view === 'accounts' ? (
        <>
          {isAdding && (
            <div className="bg-slate-950 border border-white/10 rounded-[30px] sm:rounded-[40px] p-6 sm:p-10 max-w-4xl mx-auto shadow-2xl animate-in zoom-in-95 duration-300 space-y-6 flex flex-col lg:flex-row gap-8">
              <div className="flex-1 space-y-6">
                <div className="flex justify-between items-center border-b border-white/5 pb-4">
                  <span className="text-[9px] sm:text-[10px] font-black text-indigo-400 uppercase tracking-widest truncate">
                    {actionLoading?.includes('delete') ? 'Decommission Protocol' : 'Account Configuration'}
                  </span>
                  <button onClick={() => setIsAdding(false)} className="lg:hidden text-slate-500 hover:text-white"><X className="w-5 h-5" /></button>
                </div>

                {activeStep === 'polling' ? (
                  <div className="py-12 text-center space-y-6">
                    <div className="w-16 h-16 sm:w-24 h-24 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto border-4 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
                    <h3 className="text-lg sm:text-xl font-black text-white uppercase tracking-tighter truncate px-4">{pollingMessage}</h3>
                    <button onClick={() => setIsAdding(false)} className="text-[9px] sm:text-[10px] text-slate-500 font-black uppercase tracking-widest hover:text-white mt-4 block mx-auto">Close and Monitor</button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2">Terminal Type</label>
                        <select className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 sm:py-3 text-white outline-none focus:border-indigo-500 text-sm font-medium h-[52px]" value={formData.platform} onChange={e => setFormData({...formData, platform: e.target.value})}>
                          <option value="4">MT4 Core</option>
                          <option value="5">MT5 Core</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2">Display Name</label>
                        <input type="text" placeholder="Account_Name" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 sm:py-3 text-white focus:border-indigo-500 outline-none text-base sm:text-sm font-bold h-[52px]" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                      </div>
                    </div>

                    <div className="space-y-2 relative">
                      <label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2 text-indigo-400">Broker Discovery</label>
                      <div className="relative">
                        <input 
                          type="text" 
                          placeholder="Search broker server..." 
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 sm:py-3 pl-10 text-white focus:border-indigo-500 outline-none text-base sm:text-sm font-mono h-[52px]" 
                          value={serverSearchQuery} 
                          onChange={e => {
                            setServerSearchQuery(e.target.value);
                            setFormData({...formData, server: e.target.value});
                          }} 
                        />
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                        {isSearchingServers && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-500 animate-spin" />}
                      </div>

                      {Object.keys(discoveredServers).length > 0 && (
                        <div className="absolute z-50 left-0 right-0 mt-2 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl max-h-60 overflow-y-auto custom-scrollbar p-2">
                          {Object.entries(discoveredServers as Record<string, string[]>).map(([broker, servers]) => (
                            <div key={broker} className="mb-2 last:mb-0">
                              <div className="text-[7px] sm:text-[8px] font-black text-indigo-500 uppercase tracking-widest px-3 py-1 bg-white/5 rounded-t-lg truncate">{broker}</div>
                              {servers.map(srv => (
                                <button 
                                  key={srv} 
                                  onClick={() => {
                                    setFormData({...formData, server: srv});
                                    setServerSearchQuery(srv);
                                    setDiscoveredServers({});
                                  }}
                                  className="w-full text-left px-3 py-3 sm:py-2 text-xs text-slate-300 hover:bg-indigo-600 hover:text-white transition-colors flex items-center justify-between border-t border-white/5 first:border-t-0"
                                >
                                  <span className="truncate mr-2">{srv}</span>
                                  <CheckCircle2 className="w-3 h-3 opacity-0 shrink-0" />
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2">Login ID</label>
                        <input type="text" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 sm:py-3 text-white focus:border-indigo-500 outline-none text-base sm:text-sm font-mono h-[52px]" value={formData.login} onChange={e => setFormData({...formData, login: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2">Password</label>
                        <input type="password" placeholder="••••••••" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 sm:py-3 text-white focus:border-indigo-500 outline-none text-base sm:text-sm h-[52px]" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                      </div>
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row gap-4 pt-4">
                      <button onClick={() => setIsAdding(false)} className="w-full sm:flex-1 py-4 text-slate-500 font-black uppercase text-[10px] h-[52px]">Cancel</button>
                      <button onClick={handleCreateAccount} disabled={isSubmitting} className="w-full sm:flex-[2] bg-indigo-600 text-white py-4 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-500 shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-3 h-[52px]">
                        {isSubmitting ? <Loader2 className="animate-spin w-4 h-4" /> : <Zap className="w-4 h-4" />} Add account
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="lg:w-80 bg-black border border-white/5 rounded-3xl overflow-hidden flex flex-col h-[280px] sm:h-[400px] lg:h-auto">
                <div className="bg-slate-900 px-4 py-3 border-b border-white/5 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-3 h-3 text-emerald-500" />
                    <span className="text-[8px] font-black text-emerald-500/80 uppercase tracking-widest">SYSTEM_TERMINAL_V1.0</span>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></div>
                </div>
                <div className="p-4 flex-1 overflow-y-auto font-mono text-[9px] text-emerald-400/70 custom-scrollbar space-y-1 bg-black/90">
                  <p className="text-emerald-500 font-bold border-b border-emerald-500/10 pb-1 mb-2 tracking-tighter">ENCODING: UTF-8 | REAL-TIME TELEMETRY</p>
                  {systemLogs.length === 0 ? (
                    <p className="opacity-30 italic">Awaiting Deployment Protocol...</p>
                  ) : (
                    systemLogs.map((log, i) => (
                      <p key={i} className="animate-in fade-in slide-in-from-left-2 duration-300 leading-relaxed break-all">
                        {log}
                      </p>
                    ))
                  )}
                </div>
                <div className="bg-slate-900 px-4 py-2 border-t border-white/5 shrink-0">
                  <span className="text-[7px] font-black text-slate-600 uppercase tracking-widest">Automatic Engine (London)</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col space-y-4 sm:space-y-6">
            {accounts.map(acc => (
              <div 
                key={acc.id} 
                onClick={() => onSelectAccount && onSelectAccount(acc.id)}
                className="bg-slate-900/40 border border-white/5 p-6 sm:p-8 rounded-[30px] sm:rounded-[40px] backdrop-blur-md hover:border-indigo-500/30 transition-all group overflow-hidden cursor-pointer flex flex-col md:flex-row md:items-center justify-between"
              >
                <div className="flex items-start md:items-center gap-3 sm:gap-4 overflow-hidden mb-4 md:mb-0">
                  <div className="w-10 h-10 sm:w-12 h-12 bg-indigo-600/10 rounded-xl flex items-center justify-center font-black text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-inner uppercase font-mono shrink-0">{acc.platform}</div>
                  <div className="truncate">
                    <div className="flex items-center gap-2">
                      <h4 className="font-black text-white text-sm sm:text-base truncate">{acc.name}</h4>
                    </div>
                    <p className="text-[9px] sm:text-[10px] text-slate-500 font-mono truncate">{acc.login} • {acc.server}</p>
                  </div>
                </div>

                <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-3 shrink-0">
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className={`px-2 sm:px-3 py-1 rounded-full text-[7px] sm:text-[8px] font-black uppercase border ${acc.connectionStatus?.toUpperCase() === 'CONNECTED' || acc.connectionStatus?.toUpperCase() === 'READY' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>{acc.connectionStatus}</div>
                    {acc.connectionStatus?.toUpperCase() !== 'CONNECTED' && acc.connectionStatus?.toUpperCase() !== 'READY' && acc.state === 'DEPLOYED' && (
                      <span className="text-[6px] text-rose-500 font-bold uppercase tracking-tighter">Check Credentials</span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={() => handleDeleteAccount(acc.id, acc.name || 'Unknown', acc.login || 'Unknown')}
                      disabled={actionLoading === `${acc.id}-delete`}
                      className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] font-black uppercase tracking-widest border border-rose-500/20 transition-colors flex items-center gap-1"
                    >
                      {actionLoading === `${acc.id}-delete` ? <Loader2 className="w-3 h-3 animate-spin" /> : <span>Hide</span>}
                    </button>
                    {acc.connectionStatus?.toUpperCase() !== 'CONNECTED' && acc.connectionStatus?.toUpperCase() !== 'READY' && acc.state === 'DEPLOYED' && (
                      <button 
                        onClick={() => handleReconnect(acc.id)}
                        disabled={actionLoading === `${acc.id}-reconnect`}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest border border-emerald-500/20 transition-colors flex items-center gap-1"
                      >
                        {actionLoading === `${acc.id}-reconnect` ? <Loader2 className="w-3 h-3 animate-spin" /> : <span>Connect</span>}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-4 overflow-x-hidden">
          <div className="bg-amber-500/10 border border-amber-500/20 p-5 sm:p-6 rounded-[24px] sm:rounded-[32px]">
             <div className="flex items-start gap-4">
                <Info className="text-amber-500 w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-[10px] sm:text-xs text-amber-200/60 font-medium leading-relaxed">Profiles are managed automatically by the London Cluster. Manual creation is only required for legacy on-premise setups.</p>
             </div>
          </div>
          <div className="space-y-3">
            {profiles.map(p => (
              <div key={p.id || p._id} className="bg-slate-900/40 border border-white/5 p-4 sm:p-6 rounded-2xl sm:rounded-[32px] flex items-center justify-between group hover:border-indigo-500/20 transition-all overflow-hidden gap-3">
                <div className="flex items-center gap-3 sm:gap-6 overflow-hidden">
                  <div className="w-10 h-10 sm:w-12 h-12 bg-slate-950 rounded-xl sm:rounded-2xl flex items-center justify-center border border-white/5 text-slate-500 font-black group-hover:text-indigo-400 transition-colors uppercase font-mono shrink-0 text-xs">MT{p.version}</div>
                  <div className="truncate">
                    <h4 className="text-xs sm:text-sm font-black text-white tracking-tight truncate">{p.name}</h4>
                    <div className="flex items-center gap-2 sm:gap-3 mt-0.5 text-[8px] sm:text-[9px] font-black text-slate-500 uppercase tracking-widest truncate">
                      <span className="truncate">{p.brokerTimezone}</span>
                      <span className="w-1 h-1 rounded-full bg-slate-800 shrink-0"></span>
                      <span className="text-indigo-400 truncate">{p.status}</span>
                    </div>
                  </div>
                </div>
                <button className="p-3 hover:bg-indigo-500/10 text-slate-500 hover:text-indigo-400 rounded-xl transition-all shrink-0 active:scale-95"><Settings2 className="w-4 h-4 sm:w-5 h-5" /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountConfig;
