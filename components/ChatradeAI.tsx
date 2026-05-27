import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Cpu, Shield, ShieldAlert, TrendingUp, DollarSign, Target, Sparkles, 
  MessageSquare, Sliders, Play, CheckCircle2, ChevronRight, Upload, 
  ChevronLeft, AlertCircle, RefreshCw, Layers, ArrowRight, CornerDownRight,
  TrendingDown, Check, X, ShieldCheck, Activity, Send, FileText, Image as ImageIcon,
  Square
} from 'lucide-react';
import { useStore } from '../src/store';
import { formatCurrency } from '../src/lib/utils';

interface PropRules {
  maxDailyDrawdown?: string | null;
  maxTotalDrawdown?: string | null;
  maxLotSize?: string | null;
  profitTarget?: string | null;
  newsRestrictions?: string | null;
  timeRestrictions?: string | null;
  consistencyRule?: string | null;
  summary?: string;
}

interface UserPlan {
  capital: string;
  goal: string;
  riskProfile: 'Conservative' | 'Balanced' | 'Aggressive' | 'Prop Firm Safe';
  rules: PropRules | null;
  riskPerTrade?: string;
  maxLotSize?: string;
  stopLossSize?: string;
  takeProfitSize?: string;
  trailingStop?: string;
  profitMilestones?: string;
  drawdownProtection?: string;
  progression?: string;
}

interface Message {
  id: string;
  sender: 'user' | 'mentor';
  text: string;
  timestamp: Date;
}

interface ReasoningResult {
  outcome: 'APPROVE' | 'REJECT' | 'WAIT';
  confidence: number;
  reason: string;
  detailedReasoning: string;
  technicalAlignment: string;
  fundamentalAlignment: string;
  newsImpact: string;
  calendarRisk: string;
  leverageSafety: string;
  lotSize: number;
  stopLossPips: number;
  takeProfitPips: number;
  trailingStopPips: number;
  riskRewardRatio: string;
  mentorVoice: string;
}

interface ChatradeAIProps {
  accounts: any[];
  selectedAccountId: string;
  currentUserEmail: string;
  addLog: (msg: string) => void;
  availableSymbols?: string[];
  token?: string;
  isAlgoTradeRunning?: boolean;
  toggleAlgoTrade?: () => void;
  selectedSymbol?: string;
  setSelectedSymbol?: (sym: string) => void;
}

export default function ChatradeAI({ 
  accounts = [], 
  selectedAccountId = '', 
  currentUserEmail = 'trispinblackops@gmail.com', 
  addLog,
  availableSymbols = [],
  token = '',
  isAlgoTradeRunning = false,
  toggleAlgoTrade,
  selectedSymbol: propSymbol,
  setSelectedSymbol: propSetSymbol
}: ChatradeAIProps) {

  // Active sub-view in Chatrade Dashboard: 'mentor' | 'execution' | 'plan'
  const [activeSubTab, setActiveSubTab] = useState<'mentor' | 'execution' | 'plan'>('execution');
  
  // Setup Wizard State
  const [userPlan, setUserPlan] = useState<UserPlan | null>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [isLoadingPlan, setIsLoadingPlan] = useState(true);

  // Form Fields
  const [capital, setCapital] = useState('$1000');
  const [goal, setGoal] = useState('Double account');
  const [riskProfile, setRiskProfile] = useState<'Conservative' | 'Balanced' | 'Aggressive' | 'Prop Firm Safe'>('Balanced');
  const [propRuleText, setPropRuleText] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedFileBase64, setUploadedFileBase64] = useState<string | null>(null);
  const [uploadedFileMime, setUploadedFileMime] = useState<string | null>(null);
  const [isParsingRules, setIsParsingRules] = useState(false);
  const [parsedRules, setParsedRules] = useState<PropRules | null>(null);

  // Main UI States
  const [symbolsList, setSymbolsList] = useState<string[]>(['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'XAUUSD', 'BTCUSD']);
  const [localSymbol, localSetSymbol] = useState('EURUSD');
  const selectedSymbol = propSymbol !== undefined ? propSymbol : localSymbol;
  const setSelectedSymbol = propSetSymbol !== undefined ? propSetSymbol : localSetSymbol;
  const [selectedDirection, setSelectedDirection] = useState<'BUY' | 'SELL'>('BUY');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisSteps, setAnalysisSteps] = useState<string[]>([]);
  const [reasoningResult, setReasoningResult] = useState<ReasoningResult | null>(null);
  const [executionLog, setExecutionLog] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // Chatmentor State
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // AI Quota state
  const [quotaInfo, setQuotaInfo] = useState<{
    plan: 'STARTER' | 'PRO' | 'ELITE';
    chatsTotal: number;
    chatsUsed: number;
    chatsRemaining: number;
    deepsTotal: number;
    deepsUsed: number;
    deepsRemaining: number;
    lowQuotaMode: boolean;
  } | null>(null);

  const refreshQuotaInfo = () => {
    if (!currentUserEmail) return;
    fetch(`/api/chatrade/quota-status?email=${encodeURIComponent(currentUserEmail)}`, {
      headers: {
        'Authorization': `Bearer ${token || localStorage.getItem('token') || ''}`
      }
    })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          setQuotaInfo({
            plan: res.plan,
            chatsTotal: res.chatsTotal,
            chatsUsed: res.chatsUsed,
            chatsRemaining: res.chatsRemaining,
            deepsTotal: res.deepsTotal,
            deepsUsed: res.deepsUsed,
            deepsRemaining: res.deepsRemaining,
            lowQuotaMode: res.lowQuotaMode,
          });
        }
      })
      .catch(err => console.error("Error fetching quota:", err));
  };

  const changePlanTier = async (newTier: 'STARTER' | 'PRO' | 'ELITE') => {
    if (!currentUserEmail) return;
    try {
      const response = await fetch('/api/chatrade/set-tier', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({ email: currentUserEmail, tier: newTier })
      });
      const data = await response.json();
      if (data.success && data.quota) {
        setQuotaInfo(data.quota);
        addLog?.(`[AI_QUOTA_PLAN] Subscribed to simulated tier: ${newTier}. Free tiers blocked.`);
      }
    } catch (e) {
      console.error("Error upgrading plan", e);
    }
  };

  useEffect(() => {
    if (currentUserEmail) {
      refreshQuotaInfo();
    }
  }, [currentUserEmail]);

  const activeSubTabStore = useStore(state => state.connectionStatus); // used to force re-render on socket but not needed here
  const activeStream = useStore(state => state.activeStream);

  // Sync selectedSymbol with active chart stream
  useEffect(() => {
    if (activeStream?.symbol && symbolsList.includes(activeStream.symbol)) {
      setSelectedSymbol(activeStream.symbol);
    }
  }, [activeStream?.symbol, symbolsList]);

  const activeAccount = accounts.find(a => a.id === selectedAccountId);
  const balance = activeAccount?.balance || 1000;

  useEffect(() => {
    // Sync starting capital with real current balance on startup and handle currency
    if (activeAccount && (capital === '$1000' || capital === 'R1000' || capital === 'R 1000' || capital === '$ 1000' || capital === '$1,000.00' || capital === 'R1,000.00')) {
      setCapital(formatCurrency(balance, activeAccount.currency || 'USD'));
    }
  }, [activeAccount, balance]);

  useEffect(() => {
    if (availableSymbols && availableSymbols.length > 0) {
      setSymbolsList(availableSymbols);
      if (!availableSymbols.includes(selectedSymbol)) {
         setSelectedSymbol(availableSymbols[0]);
      }
    }
  }, [availableSymbols, selectedSymbol]);

  // Load User Plan
  useEffect(() => {
    if (!currentUserEmail) return;
    setIsLoadingPlan(true);
    fetch(`/api/chatrade/plan?email=${encodeURIComponent(currentUserEmail)}`, {
      headers: {
        'Authorization': `Bearer ${token || localStorage.getItem('token') || ''}`
      }
    })
      .then(r => r.json())
      .then(res => {
        if (res.success && res.plan) {
          setUserPlan(res.plan);
          // Pre-populate Form
          setCapital(res.plan.capital);
          setGoal(res.plan.goal);
          setRiskProfile(res.plan.riskProfile);
          if (res.plan.rules) setParsedRules(res.plan.rules);
        } else {
          // Check if previously stored locally in localStorage
          const cachedPlan = localStorage.getItem(`chatrade_plan:${currentUserEmail}`);
          if (cachedPlan) {
            try {
              const parsed = JSON.parse(cachedPlan);
              setUserPlan(parsed);
              setParsedRules(parsed.rules);
            } catch (e) {}
          }
        }
      })
      .catch(err => console.error("Error loading plan", err))
      .finally(() => setIsLoadingPlan(false));
  }, [currentUserEmail]);

  // Initialize Chat Mentor Greetings on Startup or Plan Change
  useEffect(() => {
    if (userPlan) {
      setMessages([
        {
          id: 'welcome',
          sender: 'mentor',
          text: `Welcome back, Trader. I am your Chatrade AI execution intelligence mentor. 
Our personalized rules are loaded. Capital base: ${userPlan.capital}. Risk strategy: ${userPlan.riskProfile}. 
${userPlan.rules ? "Prop-firm risk parameters are active." : "Consistent growth guidelines are configured."}

I stand ready to evaluate live execution signals across technical setups, macro trends and latest news before authorizing trades. What is on your mind today?`,
          timestamp: new Date()
        }
      ]);
    } else {
      setMessages([
        {
          id: 'wizard',
          sender: 'mentor',
          text: `Hello! I am Chatrade AI, your trading intelligence enforcer and risk mentor. Let's initiate your personalized configuration guide to forge your institutional risk framework. To start, what is your current starting capital?`,
          timestamp: new Date()
        }
      ]);
    }
  }, [userPlan]);

  // Handle Plan Save
  const savePlan = async (planToSave: UserPlan) => {
    setUserPlan(planToSave);
    localStorage.setItem(`chatrade_plan:${currentUserEmail}`, JSON.stringify(planToSave));
    try {
      await fetch('/api/chatrade/plan', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({ email: currentUserEmail, plan: planToSave })
      });
      addLog?.(`[CHATRADE_PLAN] Personalized trading parameters locked for ${currentUserEmail}`);
    } catch (e) {
      console.warn("Could not save to server-side cache", e);
    }
  };

  // Auto Start Config
  const handleAutoStart = () => {
    const defaultPlan: UserPlan = {
      capital: formatCurrency(balance, activeAccount?.currency || 'USD'),
      goal: 'Double account',
      riskProfile: 'Balanced',
      rules: null,
      riskPerTrade: '1.0%',
      maxLotSize: '0.05 lot size threshold',
      stopLossSize: '25 pips dynamic',
      takeProfitSize: '50 pips target',
      trailingStop: 'Activate relative stop at +25 pips',
      profitMilestones: 'De-risk 50% profit at +30 pips',
      drawdownProtection: 'Maximum daily drawdown restricted to 5.0%',
      progression: 'Linear lot expansion upon positive capital milestone'
    };
    savePlan(defaultPlan);
    setIsSettingUp(false);
  };

  // Generate Personalized Trading Plan on Setup Wizard Close
  const handleGeneratePlan = () => {
    // Generate logical guidelines based on selected profile
    let generatedPlan: Partial<UserPlan> = {
      capital,
      goal,
      riskProfile,
      rules: parsedRules
    };

    if (riskProfile === 'Conservative') {
      generatedPlan.riskPerTrade = '0.5%';
      generatedPlan.maxLotSize = '0.02 lot size standard limit';
      generatedPlan.stopLossSize = '15 pips safe limit';
      generatedPlan.takeProfitSize = '35 pips conservative';
      generatedPlan.trailingStop = 'Lock current gain at +15 pips';
      generatedPlan.profitMilestones = 'Progress scale at 5% absolute net profit';
      generatedPlan.drawdownProtection = 'Auto deactivate at 3% max daily loss';
      generatedPlan.progression = 'Compounding lot progression locked to quarterly milestones';
    } else if (riskProfile === 'Balanced') {
      generatedPlan.riskPerTrade = '1.0%';
      generatedPlan.maxLotSize = '0.05 lot size limit';
      generatedPlan.stopLossSize = '20 pips balanced target';
      generatedPlan.takeProfitSize = '45 pips balanced target';
      generatedPlan.trailingStop = 'Activate tracking at +20 pips';
      generatedPlan.profitMilestones = 'De-risk 50% at +25 pips gain';
      generatedPlan.drawdownProtection = 'Hard halt after 5% daily drop';
      generatedPlan.progression = 'Compounding progression adjusts every 15% account growth';
    } else if (riskProfile === 'Aggressive') {
      generatedPlan.riskPerTrade = '2.5%';
      generatedPlan.maxLotSize = '0.15 lot limit';
      generatedPlan.stopLossSize = '35 pips wider target';
      generatedPlan.takeProfitSize = '85 pips target';
      generatedPlan.trailingStop = 'Follow trend at +35 pips';
      generatedPlan.profitMilestones = 'Take partial profits actively';
      generatedPlan.drawdownProtection = 'Warning at 8% daily loss threshold';
      generatedPlan.progression = 'Aggressive compounding on active consecutive winning streaks';
    } else { // Prop Firm Safe
      generatedPlan.riskPerTrade = '0.25%';
      generatedPlan.maxLotSize = parsedRules?.maxLotSize || '0.02 lot absolute max';
      generatedPlan.stopLossSize = '15 pips strict SL';
      generatedPlan.takeProfitSize = '35 pips technical target';
      generatedPlan.trailingStop = 'Guard active profits super tightly';
      generatedPlan.profitMilestones = parsedRules?.profitTarget ? `Profit milestone locked at ${parsedRules.profitTarget}` : '8% stage 1 profit target constraint';
      generatedPlan.drawdownProtection = parsedRules?.maxDailyDrawdown ? `Controlled daily cap: ${parsedRules.maxDailyDrawdown}` : 'Strict maximum 4% daily drawdown ceiling';
      generatedPlan.progression = 'Steady low dispersion progression';
    }

    savePlan(generatedPlan as UserPlan);
    setIsSettingUp(false);
    setWizardStep(1);
  };

  // Prop Rule File Parsing
  const handlePropFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    const mime = file.type;
    setUploadedFileMime(mime);

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setUploadedFileBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleParseRules = async () => {
    setIsParsingRules(true);
    try {
      const res = await fetch('/api/chatrade/parse-rules', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({
          text: propRuleText,
          fileData: uploadedFileBase64,
          mimeType: uploadedFileMime
        })
      });
      const data = await res.json();
      if (data.success && data.rules) {
        setParsedRules(data.rules);
        addLog?.(`[CHATRADE_PARSER] Prop firm rules analyzed successfully using Gemini Document intelligence.`);
      } else {
        alert("Failed to parse prop rules: " + (data.error || "Please try copy-pasting text instead."));
      }
    } catch (e: any) {
      console.error(e);
      alert("Error invoking intelligent parser: " + (e.message || "Check database / internet."));
    } finally {
      setIsParsingRules(false);
    }
  };

  // Comprehensive Core Fusion Analysis
  const handleFusionAnalysis = async () => {
    if (!selectedAccountId) {
      alert("Please connect or select an active account first.");
      return;
    }

    setIsAnalyzing(true);
    setReasoningResult(null);
    setExecutionLog(null);
    setAnalysisSteps([]);

    const steps = [
      "Connecting to Node.js technical strategy engine...",
      "Extracting historical candlesticks pattern database...",
      "Analyzing support/resistance heatmaps & zone breakouts...",
      "Querying FRED terminal (Inflation, Federal Funds Rate, 10Y Yields)...",
      "Retrieving currency-weighted news events from Finnhub...",
      "Assessing high-impact economic calendar events...",
      "Cross-referencing capital restrictions and trailing thresholds...",
      "Synthesizing all signals in Gemini Multimodal reasoning node..."
    ];

    // Simulate animated step checks sequentially
    for (let i = 0; i < steps.length; i++) {
      setAnalysisSteps(prev => [...prev, steps[i]]);
      await new Promise(r => setTimeout(r, 600));
    }

    try {
      const res = await fetch('/api/chatrade/analyze', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({
          accountId: selectedAccountId,
          symbol: selectedSymbol,
          direction: selectedDirection,
          email: currentUserEmail,
          isDeepRequest: true
        })
      });
      const data = await res.json();
      if (data.success && data.analysis) {
        setReasoningResult(data.analysis);
        addLog?.(`[CHATRADE_DECISION] ${selectedSymbol} ${selectedDirection} evaluated by Chatrade AI: ${data.analysis.outcome} (${data.analysis.confidence}% confidence)`);
        if (data.quotaInfo) {
          setQuotaInfo(data.quotaInfo);
        } else {
          refreshQuotaInfo();
        }
      } else {
        alert("Server failed to perform intelligence checks: " + (data.error || "Validate system key."));
        refreshQuotaInfo();
      }
    } catch (e: any) {
      console.error(e);
      alert("Failed core check: " + (e.message || "Connection timeout or API error."));
      refreshQuotaInfo();
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Execute approved trade via API
  const handleExecuteTrade = async () => {
    if (!reasoningResult || !selectedAccountId) return;
    setIsExecuting(true);
    setExecutionLog("Broadcasting execution vector...");

    try {
      const isBuy = selectedDirection === 'BUY';
      const path = isBuy ? '/api/trade/buy' : '/api/trade/sell';
      
      const res = await fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({
          accountId: selectedAccountId,
          symbol: selectedSymbol,
          lotSize: reasoningResult.lotSize || 0.01,
          stopLoss: reasoningResult.stopLossPips || 20,
          takeProfit: reasoningResult.takeProfitPips || 40,
          comment: "CHATRADE"
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setExecutionLog(`ORDER PLACED: Chatrade AI verified & executed ${selectedDirection} ${selectedSymbol} [Size: ${reasoningResult.lotSize}]. Dynamic Stop Loss and Take Profit applied securely!`);
        addLog?.(`[EXECUTION_SUCCESS] Chatrade authorized order on ${selectedSymbol} placed.`);
      } else {
        setExecutionLog(`REJECTED BY BROKER ENGINE: ${data.error || "Execution timeout bounds."}`);
      }
    } catch (e: any) {
      setExecutionLog(`EXECUTION EXCEPTION: ${e.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleDirectBuy = async () => {
    if (!selectedAccountId) {
      alert("Please connect or select an active account first.");
      return;
    }
    setIsExecuting(true);
    setExecutionLog("Broadcasting manual buy execution via Chatrade...");
    try {
      const res = await fetch('/api/trade/buy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({
          accountId: selectedAccountId,
          symbol: selectedSymbol,
          lotSize: 0.01,
          stopLoss: 20,
          takeProfit: 40,
          comment: "CHATRADE"
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setExecutionLog(`ORDER PLACED: Direct manual BUY order on ${selectedSymbol} executed successfully with 0.01 Lot!`);
        addLog?.(`[CHATRADE_DIRECT] Direct manual BUY order placed on ${selectedSymbol}.`);
      } else {
        setExecutionLog(`REJECTED BY BROKER ENGINE: ${data.error || "Execution timeout bounds."}`);
      }
    } catch (e: any) {
      setExecutionLog(`EXECUTION EXCEPTION: ${e.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleDirectSell = async () => {
    if (!selectedAccountId) {
      alert("Please connect or select an active account first.");
      return;
    }
    setIsExecuting(true);
    setExecutionLog("Broadcasting manual sell execution via Chatrade...");
    try {
      const res = await fetch('/api/trade/sell', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({
          accountId: selectedAccountId,
          symbol: selectedSymbol,
          lotSize: 0.01,
          stopLoss: 20,
          takeProfit: 40,
          comment: "CHATRADE"
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setExecutionLog(`ORDER PLACED: Direct manual SELL order on ${selectedSymbol} executed successfully with 0.01 Lot!`);
        addLog?.(`[CHATRADE_DIRECT] Direct manual SELL order placed on ${selectedSymbol}.`);
      } else {
        setExecutionLog(`REJECTED BY BROKER ENGINE: ${data.error || "Execution timeout bounds."}`);
      }
    } catch (e: any) {
      setExecutionLog(`EXECUTION EXCEPTION: ${e.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  // Chat Messenger
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const userText = inputMessage.trim();
    if (!userText || isSendingMessage) return;

    const userMsg: Message = {
      id: Math.random().toString(),
      sender: 'user',
      text: userText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setIsSendingMessage(true);

    // Natural Language Trading Commands Parsing
    const cleanText = userText.toLowerCase().replace(/\s+/g, ' ');
    
    // Check for automation queries
    if (cleanText.includes('automate') || cleanText.includes('auto trade') || cleanText.includes('autopilot') || cleanText.includes('automation')) {
      if (!isAlgoTradeRunning) {
        setMessages(prev => [...prev, {
          id: Math.random().toString(),
          sender: 'mentor',
          text: `🤖 **Automation Parameters Synced**: I have configured the adaptive risk filters for automation, but to start executing automatically on your broker account, you must click the **START** button in the Fused Confluence panel.`,
          timestamp: new Date()
        }]);
        setIsSendingMessage(false);
        return;
      }
    }

    if (cleanText.startsWith('buy ') || cleanText.startsWith('sell ')) {
      if (!selectedAccountId) {
        setMessages(prev => [...prev, {
          id: Math.random().toString(),
          sender: 'mentor',
          text: `⚠️ **Connection Error**: Please link and select a valid trading account first before issuing market commands.`,
          timestamp: new Date()
        }]);
        setIsSendingMessage(false);
        return;
      }

      if (isAlgoTradeRunning) {
        setMessages(prev => [...prev, {
          id: Math.random().toString(),
          sender: 'mentor',
          text: `🔒 **Console Locked**: Automated algo-trading engine is active. Please click **STOP** to disable automation before placing direct manual orders.`,
          timestamp: new Date()
        }]);
        setIsSendingMessage(false);
        return;
      }

      const parts = cleanText.split(' ');
      const direction = parts[0].toUpperCase() as 'BUY' | 'SELL';
      let parsedSymbolName = parts[1]?.toUpperCase() || '';
      parsedSymbolName = parsedSymbolName.replace(/[^A-Z0-9\-\.\#\_]/g, '');

      // Locate correct symbol from our matched broker list
      const matchedSymbol = symbolsList.find(s => s.toUpperCase() === parsedSymbolName.toUpperCase() 
        || s.toUpperCase().replace(/[^A-Z0-9]/g, '') === parsedSymbolName.toUpperCase().replace(/[^A-Z0-9]/g, '')
      ) || selectedSymbol;

      // Extract Lot size
      let lotSize = 0.01;
      const lotIdx = parts.indexOf('lot');
      if (lotIdx !== -1 && parts[lotIdx + 1]) {
        const parsed = parseFloat(parts[lotIdx + 1]);
        if (!isNaN(parsed) && parsed > 0) lotSize = parsed;
      } else {
        // Try parsing any number that is float or typical lot size range (e.g. 0.05, 0.1, 1.0)
        for (let i = 2; i < parts.length; i++) {
          const val = parseFloat(parts[i]);
          if (!isNaN(val) && parts[i].includes('.') && val < 5.0) {
            lotSize = val;
            break;
          }
        }
      }

      // Extract SL & TP
      let stopLoss = 20;
      const slIdx = parts.indexOf('sl');
      if (slIdx !== -1 && parts[slIdx + 1]) {
        const parsed = parseInt(parts[slIdx + 1]);
        if (!isNaN(parsed)) stopLoss = parsed;
      }
      
      let takeProfit = 40;
      const tpIdx = parts.indexOf('tp');
      if (tpIdx !== -1 && parts[tpIdx + 1]) {
        const parsed = parseInt(parts[tpIdx + 1]);
        if (!isNaN(parsed)) takeProfit = parsed;
      }

      try {
        const path = direction === 'BUY' ? '/api/trade/buy' : '/api/trade/sell';
        const response = await fetch(path, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token || localStorage.getItem('token') || ''}`
          },
          body: JSON.stringify({
            accountId: selectedAccountId,
            symbol: matchedSymbol,
            lotSize,
            stopLoss,
            takeProfit,
            comment: "CHATRADE"
          })
        });

        const data = await response.json();
        if (response.ok && data.success) {
          setMessages(prev => [...prev, {
            id: Math.random().toString(),
            sender: 'mentor',
            text: `📈 **Direct Chat order executed successfully!**\n- Direction: **${direction}**\n- Symbol: **${matchedSymbol}**\n- Lot size: **${lotSize}**\n- Stop Loss: **${stopLoss} pips**\n- Take Profit: **${takeProfit} pips**\nComment: **CHATRADE**`,
            timestamp: new Date()
          }]);
          addLog?.(`[CHATRADE_CHAT_TRADE] Placed ${direction} ${matchedSymbol} (${lotSize} lots) via chat interface.`);
        } else {
          setMessages(prev => [...prev, {
            id: Math.random().toString(),
            sender: 'mentor',
            text: `❌ **Failed to execute order**: ${data.error || "Rejected by execution gateway."}`,
            timestamp: new Date()
          }]);
        }
      } catch (err: any) {
        setMessages(prev => [...prev, {
          id: Math.random().toString(),
          sender: 'mentor',
          text: `❌ **Execution error**: ${err.message}`,
          timestamp: new Date()
        }]);
      } finally {
        setIsSendingMessage(false);
      }
      return;
    }

    try {
      const res = await fetch('/api/chatrade/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({
          message: userMsg.text,
          email: currentUserEmail,
          accountId: selectedAccountId,
          history: messages.slice(-5) // Pass limited history for backend optimization
         })
      });
      const data = await res.json();
      if (res.ok && data.success && data.reply) {
        setMessages(prev => [...prev, {
          id: Math.random().toString(),
          sender: 'mentor',
          text: data.reply,
          timestamp: new Date()
        }]);
        if (data.quotaInfo) {
          setQuotaInfo(data.quotaInfo);
        } else {
          refreshQuotaInfo();
        }
      } else {
        const errorMsg = data.error || "An unexpected error occurred.";
        setMessages(prev => [...prev, {
          id: Math.random().toString(),
          sender: 'mentor',
          text: `⚠️ **System Alert**: ${errorMsg}`,
          timestamp: new Date()
        }]);
        refreshQuotaInfo();
      }
    } catch (e: any) {
      console.error("Chat error", e);
      setMessages(prev => [...prev, {
        id: Math.random().toString(),
        sender: 'mentor',
        text: `⚠️ **System Alert**: Connection failure. Please ensure the backend is active and internet connections are functional.`,
        timestamp: new Date()
      }]);
      refreshQuotaInfo();
    } finally {
      setIsSendingMessage(false);
    }
  };

  if (isLoadingPlan) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-slate-400">
        <RefreshCw className="w-10 h-10 animate-spin text-emerald-500 mb-4" />
        <span className="font-mono text-xs uppercase tracking-widest">Loading Chatrade AI Interface...</span>
      </div>
    );
  }

  // DISPLAY WIZARD IF REQUESTED OR NO PLAN CONFIGURED
  if (!userPlan || isSettingUp) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-8 bg-black/40 min-h-[80vh] flex flex-col justify-center">
        <div className="bg-slate-950/60 backdrop-blur-xl border border-white/5 rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden g-glass glowing-frame">
          
          <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-accent/5 rounded-full blur-[100px] pointer-events-none" style={{ backgroundColor: 'var(--accent-color)', opacity: 0.05 }} />

          <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                <Cpu className="w-6 h-6 text-emerald-400 animate-pulse" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                  Chatrade AI <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-mono uppercase font-black">Guided Setup</span>
                </h1>
                <p className="text-xs text-slate-400 font-mono">STEP {wizardStep} OF 5</p>
              </div>
            </div>
            {userPlan && (
              <button 
                onClick={() => setIsSettingUp(false)}
                className="text-xs text-slate-400 hover:text-white pb-1 border-b border-dashed border-white/20 transition-all font-mono"
              >
                Exit setup
              </button>
            )}
          </div>

          <AnimatePresence mode="wait">
            {wizardStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-300 font-mono">Question 1: What is your starting trading capital size?</label>
                  <p className="text-xs text-slate-400">Specify your baseline balance which risk calculations will utilize for compounding thresholds.</p>
                </div>

                {activeAccount && (
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <span className="text-[10px] text-emerald-400 font-mono uppercase block tracking-wider font-extrabold">Active Trading Account Detected</span>
                      <span className="text-sm font-bold text-slate-200 mt-1 block">
                        {activeAccount.name} ({activeAccount.login})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCapital(formatCurrency(balance, activeAccount.currency || 'USD'))}
                      className="w-full sm:w-auto px-4 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl text-xs font-bold font-mono border border-emerald-500/35 transition-all flex items-center justify-center gap-2 shadow-sm animate-pulse"
                    >
                      Use Live Account Balance: {formatCurrency(balance, activeAccount.currency || 'USD')}
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[100, 500, 1000, 5000, 10000, 50000].map(num => {
                    const val = formatCurrency(num, activeAccount?.currency || 'USD');
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setCapital(val)}
                        className={`p-4 rounded-xl border font-mono text-sm font-bold tracking-tight text-center transition-all ${
                          capital === val 
                            ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-md' 
                            : 'bg-white/5 border-white/5 text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        {val}
                      </button>
                    );
                  })}
                  <div className="sm:col-span-3">
                    <input 
                      type="text"
                      value={capital}
                      onChange={(e) => setCapital(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-emerald-500"
                      placeholder={`Custom Capital (e.g. ${formatCurrency(1500, activeAccount?.currency || 'USD')})`}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {wizardStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-300 font-mono">Question 2: What is your trading milestone goal?</label>
                  <p className="text-xs text-slate-400">Establishing distinct goals lets Chatrade dynamically shift compounding scales once targets are realized.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    'Double account balance', 
                    'Grow responsibly to $500', 
                    'Pass live Prop Firm challenge (Phase 1 & 2)', 
                    'Consistent micro swing growth', 
                    'Generate healthy monthly target'
                  ].map(val => (
                    <button
                      key={val}
                      onClick={() => setGoal(val)}
                      className={`p-4 rounded-xl border text-left text-sm transition-all flex items-center gap-3 ${
                        goal === val 
                          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-md' 
                          : 'bg-white/5 border-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      <Target className={`w-4 h-4 shrink-0 ${goal === val ? 'text-emerald-400' : 'text-slate-500'}`} />
                      <span className="font-medium text-xs truncate">{val}</span>
                    </button>
                  ))}
                  <div className="sm:col-span-2">
                    <input 
                      type="text"
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500"
                      placeholder="Custom Objective (e.g. Master steady monthly payouts)"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {wizardStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-300 font-mono">Question 3: Select your precise Risk Profile</label>
                  <p className="text-xs text-slate-400">Risk determines size modeling, maximum SL limits, and dynamic news buffer windows.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { key: 'Conservative', desc: '0.5% trade risk, tight stop limits, auto-freeze on 3% daily drop.', icon: Shield },
                    { key: 'Balanced', desc: '1.0% trade risk, adaptive stop, automatic cease on 5% daily drop.', icon: Sliders },
                    { key: 'Aggressive', desc: '2.5% trade risk, wider threshold limit, warning flag at 8% decline.', icon: TrendingUp },
                    { key: 'Prop Firm Safe', desc: '0.25% trade risk, rigid prop constraints, extreme high impact filters.', icon: ShieldAlert }
                  ].map(prof => (
                    <button
                      key={prof.key}
                      onClick={() => setRiskProfile(prof.key as any)}
                      className={`p-4 rounded-xl border text-left transition-all space-y-2 ${
                        riskProfile === prof.key 
                          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-md' 
                          : 'bg-white/5 border-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <prof.icon className={`w-4 h-4 ${riskProfile === prof.key ? 'text-emerald-400' : 'text-slate-400'}`} />
                        <span className="font-bold text-xs">{prof.key}</span>
                      </div>
                      <p className="text-[11px] text-slate-450 leading-relaxed font-sans">{prof.desc}</p>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {wizardStep === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-300 font-mono">Question 4: Do you wish to bind Prop Firm limits?</label>
                  <p className="text-xs text-slate-400">Paste your rulebook text or drag-and-drop a screenshot or contract PDF. Gemini intelligent parsing extracts limits instantly.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-slate-400 block font-mono">PASTE GUIDELINE TEXT</span>
                    <textarea
                      value={propRuleText}
                      onChange={(e) => setPropRuleText(e.target.value)}
                      className="w-full h-32 bg-white/5 border border-white/10 rounded-xl p-3 text-white text-xs focus:outline-none focus:border-emerald-500 font-sans leading-relaxed"
                      placeholder="e.g. Max daily drawdown 5%. Absolute max drawdown 10%. News trading forbidden 2 mins before and after red-folder announcements."
                    />
                  </div>

                  <div className="space-y-2 flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-semibold text-slate-400 block font-mono mb-2">UPLOAD CAPTURE / PDF</span>
                      <label className="border border-dashed border-white/10 hover:border-emerald-500/50 bg-white/5 p-4 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all gap-2 h-24">
                        <Upload className="w-5 h-5 text-slate-400 group-hover:text-emerald-400" />
                        <span className="text-[10px] text-slate-400 text-center truncate max-w-[200px]">
                          {uploadedFileName || "Choose PDF, image or screenshot"}
                        </span>
                        <input 
                          type="file" 
                          accept="image/*,application/pdf"
                          onChange={handlePropFileChange}
                          className="hidden" 
                        />
                      </label>
                    </div>

                    <button
                      onClick={handleParseRules}
                      disabled={isParsingRules || (!propRuleText.trim() && !uploadedFileBase64)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-mono rounded-xl font-bold text-xs disabled:opacity-40 transition-all shadow-md active:scale-95"
                    >
                      {isParsingRules ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                          Parsing via Gemini...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-emerald-400" />
                          Run Intelligent Rule Parser
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {parsedRules && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-2"
                  >
                    <div className="flex items-center gap-2 text-emerald-400">
                      <ShieldCheck className="w-4 h-4" />
                      <span className="text-xs font-bold font-mono uppercase tracking-widest">Intelligent Extraction Complete:</span>
                    </div>
                    <p className="text-[11px] text-slate-300 font-serif italic">"{parsedRules.summary}"</p>
                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400 mt-2 border-t border-white/5 pt-2">
                      <div>Max Daily: <span className="text-emerald-400 font-bold">{parsedRules.maxDailyDrawdown || "N/A"}</span></div>
                      <div>Total Drawdown: <span className="text-emerald-400 font-bold">{parsedRules.maxTotalDrawdown || "N/A"}</span></div>
                      <div>Max Lot Size: <span className="text-emerald-400 font-bold">{parsedRules.maxLotSize || "N/A"}</span></div>
                      <div>Profit Guideline: <span className="text-emerald-400 font-bold">{parsedRules.profitTarget || "N/A"}</span></div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}

            {wizardStep === 5 && (
              <motion.div
                key="step5"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-300 font-mono">Trading Plan Confirmation</label>
                  <p className="text-xs text-slate-400">Please review your Chatrade bounds. Pressing commit generates your adaptive guidance framework.</p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-6 space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-4 border-b border-white/5">
                    <div>
                      <span className="text-[9px] font-mono text-slate-400 uppercase">Capital base</span>
                      <p className="text-sm font-extrabold text-white mt-0.5">{capital}</p>
                    </div>
                    <div>
                      <span className="text-[9px] font-mono text-slate-400 uppercase">Risk Strategy</span>
                      <p className="text-sm font-extrabold text-emerald-400 mt-0.5">{riskProfile}</p>
                    </div>
                    <div>
                      <span className="text-[9px] font-mono text-slate-400 uppercase">Prop firm link</span>
                      <p className="text-sm font-extrabold text-white mt-0.5">{parsedRules ? "Activated" : "None"}</p>
                    </div>
                    <div>
                      <span className="text-[9px] font-mono text-slate-400 uppercase">Core Model</span>
                      <p className="text-sm font-extrabold text-emerald-400 mt-0.5">Gemini 3.5</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-xs font-bold font-mono uppercase tracking-widest text-slate-400">Plan Directives:</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs leading-relaxed">
                      <div className="flex items-start gap-2 text-slate-300">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span>Max Risk Per Execution limits standard sizes to 0.5% - 1.0%.</span>
                      </div>
                      <div className="flex items-start gap-2 text-slate-300">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span>Continuous News blackout blockages will trigger near key intervals.</span>
                      </div>
                      <div className="flex items-start gap-2 text-slate-300">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span>Compounding compounding rules adjust automatically as milestones occur.</span>
                      </div>
                      <div className="flex items-start gap-2 text-slate-300">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span>Dynamic trailing stop-losses preserve gains on sudden pips drop.</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center justify-between gap-4 mt-8 pt-6 border-t border-white/5">
            {wizardStep > 1 ? (
              <button
                type="button"
                onClick={() => setWizardStep(prev => prev - 1)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-md active:scale-95"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous Question
              </button>
            ) : (
              <button
                type="button"
                onClick={handleAutoStart}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/25 text-rose-450 border border-rose-500/20 rounded-xl text-xs font-mono font-bold transition-all"
              >
                Bypass / Auto Initialize
              </button>
            )}

            {wizardStep < 5 ? (
              <button
                type="button"
                onClick={() => setWizardStep(prev => prev + 1)}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-black font-mono text-xs font-extrabold rounded-xl transition-all shadow-lg active:scale-95 ml-auto"
              >
                Proceed Question
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGeneratePlan}
                className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-black font-mono text-xs font-extrabold rounded-xl transition-all shadow-lg shadow-emerald-500/25 active:scale-95 animate-pulse ml-auto"
              >
                Commit Intelligent Plan
              </button>
            )}
          </div>

        </div>
      </div>
    );
  }

  // DISPLAY CORE CHATRADE AI INTUITION DASHBOARD
  return (
    <div className="w-full mx-auto space-y-6">
      
      {/* Top Rebranding Capital Monitoring Header */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-950/60 backdrop-blur-md border border-white/5 rounded-2xl p-4 flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
            <DollarSign className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-mono uppercase block">Target Capital</span>
            <span className="text-base font-extrabold text-white font-mono">{userPlan.capital}</span>
          </div>
        </div>

        <div className="bg-slate-950/60 backdrop-blur-md border border-white/5 rounded-2xl p-4 flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
            <Target className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="truncate">
            <span className="text-[10px] text-slate-400 font-mono uppercase block">Current Objective</span>
            <span className="text-xs font-extrabold text-slate-200 block truncate">{userPlan.goal}</span>
          </div>
        </div>

        <div className="bg-slate-950/60 backdrop-blur-md border border-white/5 rounded-2xl p-4 flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-mono uppercase block">Risk Profile Bounds</span>
            <span className="text-xs font-extrabold text-emerald-400 font-mono">{userPlan.riskProfile}</span>
          </div>
        </div>

        <div className="bg-slate-950/60 backdrop-blur-md border border-white/5 rounded-2xl p-4 flex items-center gap-3 cursor-pointer" onClick={() => setIsSettingUp(true)}>
          <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors">
            <Sliders className="w-5 h-5 text-slate-400" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-mono uppercase block">Guideline Rules</span>
            <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
              {userPlan.rules ? "Prop Rules Active" : "No rules bound"} <ChevronRight className="w-3 h-3 text-slate-500" />
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Real-time Signal Confluence Panel / Execution parameters */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-950/60 backdrop-blur-md border border-white/5 rounded-2xl shadow-xl p-5 relative overflow-hidden g-glass">
            
            <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-5">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-emerald-400" />
                <h2 className="text-sm font-bold text-white font-mono uppercase tracking-wider">AI Fused Verification Vector</h2>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select 
                  value={selectedSymbol}
                  onChange={(e) => setSelectedSymbol && setSelectedSymbol(e.target.value)}
                  disabled={isAlgoTradeRunning}
                  className={`bg-black/80 border border-white/10 rounded-lg px-2 py-1 text-xs font-mono text-white focus:outline-none focus:border-emerald-500 ${isAlgoTradeRunning ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {symbolsList.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>

                <div className={`flex bg-black/60 rounded-lg p-0.5 border border-white/5 shrink-0 ${isAlgoTradeRunning ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <button 
                    onClick={() => !isAlgoTradeRunning && setSelectedDirection('BUY')}
                    disabled={isAlgoTradeRunning}
                    className={`px-3 py-1 rounded text-[10px] font-mono font-bold transition-all ${selectedDirection === 'BUY' ? 'bg-emerald-500 text-black shadow' : 'text-slate-400 hover:text-white'} ${isAlgoTradeRunning ? 'cursor-not-allowed' : ''}`}
                  >
                    BUY
                  </button>
                  <button 
                    onClick={() => !isAlgoTradeRunning && setSelectedDirection('SELL')}
                    disabled={isAlgoTradeRunning}
                    className={`px-3 py-1 rounded text-[10px] font-mono font-bold transition-all ${selectedDirection === 'SELL' ? 'bg-rose-500 text-white shadow' : 'text-slate-400 hover:text-white'} ${isAlgoTradeRunning ? 'cursor-not-allowed' : ''}`}
                  >
                    SELL
                  </button>
                </div>

                <div className="border-l border-white/10 h-6 mx-1"></div>

                <button
                  onClick={toggleAlgoTrade}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all shadow-md active:scale-95 border ${
                    isAlgoTradeRunning
                      ? 'bg-rose-500/20 text-rose-450 border-rose-500/50 hover:bg-rose-500/30'
                      : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 hover:bg-emerald-500/30'
                  }`}
                >
                  {isAlgoTradeRunning ? <Square className="w-3 h-3 fill-rose-500/30" /> : <Play className="w-3 h-3 fill-emerald-500/30 ml-0.5" />}
                  {isAlgoTradeRunning ? 'STOP' : 'START'}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-stretch gap-4 justify-between bg-black/40 border border-white/5 rounded-xl p-4">
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-white font-mono">Verify Multi-Vector Confluence Parameters</h4>
                  <p className="text-[11px] text-slate-400 font-sans leading-tight">Authorize Chatrade to fuse strategy, microeconomic FRED, Finnhub sentiments, and prop firm guidelines before execution.</p>
                </div>
                <button
                  onClick={handleFusionAnalysis}
                  disabled={isAnalyzing}
                  className="px-5 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-black font-mono font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-500/10 transition-all flex items-center justify-center gap-2 shrink-0 active:scale-95"
                >
                  {isAnalyzing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      FUSING DATA INDICES...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      REASON WITH CHATRADE
                    </>
                  )}
                </button>
              </div>

              {/* Direct Execution & Control Center */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-black/30 border border-white/5 rounded-2xl p-4">
                
                <div className="sm:col-span-1 flex flex-col justify-between space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-350">
                    <Activity className="w-3.5 h-3.5 text-emerald-400" />
                    <span>DIRECT EXECUTION</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleDirectBuy}
                      disabled={isAlgoTradeRunning || isExecuting}
                      className={`flex flex-col items-center justify-center gap-1 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl transition-all ${
                        !isAlgoTradeRunning && !isExecuting ? 'hover:bg-emerald-500/20 active:scale-95 cursor-pointer' : 'opacity-40 grayscale cursor-not-allowed'
                      }`}
                    >
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                      <span className="text-[10px] font-mono font-black text-emerald-400 uppercase tracking-wider">BUY</span>
                    </button>
                    
                    <button
                      onClick={handleDirectSell}
                      disabled={isAlgoTradeRunning || isExecuting}
                      className={`flex flex-col items-center justify-center gap-1 py-3 bg-rose-500/10 border border-rose-500/20 rounded-xl transition-all ${
                        !isAlgoTradeRunning && !isExecuting ? 'hover:bg-rose-500/20 active:scale-95 cursor-pointer' : 'opacity-40 grayscale cursor-not-allowed'
                      }`}
                    >
                      <TrendingDown className="w-4 h-4 text-rose-400" />
                      <span className="text-[10px] font-mono font-black text-rose-400 uppercase tracking-wider">SELL</span>
                    </button>
                  </div>
                </div>

                <div className="sm:col-span-2 flex flex-col justify-between space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-350">
                    <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                    <span>AUTOMATED TRADING SYSTEM CONTROL</span>
                  </div>
                  <button
                    onClick={toggleAlgoTrade}
                    className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border transition-all active:scale-95 ${
                      isAlgoTradeRunning 
                        ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 hover:bg-rose-500/30' 
                        : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30'
                    }`}
                    style={isAlgoTradeRunning ? { boxShadow: '0 0 15px rgba(244,63,94,0.15)' } : { boxShadow: '0 0 15px rgba(16,185,129,0.15)' }}
                  >
                    {isAlgoTradeRunning ? (
                      <>
                        <Square className="w-4 h-4 fill-rose-500/50" />
                        <span className="text-[10px] font-mono font-black uppercase tracking-widest">
                          STOP
                        </span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-emerald-500/50 ml-0.5" />
                        <span className="text-[10px] font-mono font-black uppercase tracking-widest">
                          START
                        </span>
                      </>
                    )}
                  </button>
                </div>

              </div>

              {/* Step checklist animation while checking */}
              {isAnalyzing && (
                <div className="p-4 bg-white/5 border border-white/5 rounded-xl space-y-2">
                  <h4 className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Intelligent system check status:</h4>
                  <div className="space-y-1.5 font-mono text-[11px]">
                    {analysisSteps.map((step, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-slate-350">
                        <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Display reasoning output once parsed */}
              {reasoningResult && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-black/40 border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center text-center space-y-2">
                      <span className="text-[9px] font-mono text-slate-400 uppercase">DECISION STATUS</span>
                      <span className={`text-xl font-black font-mono px-4 py-1.5 rounded-xl border ${
                        reasoningResult.outcome === 'APPROVE' 
                          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' 
                          : reasoningResult.outcome === 'REJECT'
                          ? 'bg-rose-500/10 border-rose-500 text-rose-550'
                          : 'bg-amber-500/10 border-amber-500 text-amber-500'
                      }`}>
                        {reasoningResult.outcome}
                      </span>
                    </div>

                    <div className="bg-black/40 border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center text-center space-y-2">
                      <span className="text-[9px] font-mono text-slate-400 uppercase">CONFIDENCE SCORE</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-black font-mono text-white">{reasoningResult.confidence}%</span>
                        <div className="w-16 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div className={`h-full ${reasoningResult.confidence >= 70 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${reasoningResult.confidence}%` }}></div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-black/40 border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center text-center space-y-2">
                      <span className="text-[9px] font-mono text-slate-400 uppercase">DYNAMIC LOT</span>
                      <span className="text-xl font-black font-mono text-emerald-400">{reasoningResult.lotSize} LOT</span>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-900/40 border border-white/5 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <MessageSquare className="w-4 h-4" />
                      <span className="text-[10px] font-mono uppercase tracking-widest font-bold">Mental Directive Summary:</span>
                    </div>
                    <p className="text-[12px] text-slate-200 font-sans leading-relaxed italic">"{reasoningResult.mentorVoice}"</p>
                  </div>

                  {/* Core Fused Signals breakdown */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="border border-white/5 bg-black/20 rounded-xl p-3 space-y-1">
                      <span className="text-[9px] font-mono text-slate-405 block uppercase">TECHNICALS</span>
                      <p className="text-slate-200 font-sans leading-tight">{reasoningResult.technicalAlignment}</p>
                    </div>
                    <div className="border border-white/5 bg-black/20 rounded-xl p-3 space-y-1">
                      <span className="text-[9px] font-mono text-slate-405 block uppercase">MACRO BIAS (FRED)</span>
                      <p className="text-slate-200 font-sans leading-tight">{reasoningResult.fundamentalAlignment}</p>
                    </div>
                    <div className="border border-white/5 bg-black/20 rounded-xl p-3 space-y-1">
                      <span className="text-[9px] font-mono text-slate-405 block uppercase">NEWS SENTIMENT (FINNHUB)</span>
                      <p className="text-slate-200 font-sans leading-tight">{reasoningResult.newsImpact}</p>
                    </div>
                    <div className="border border-white/5 bg-black/20 rounded-xl p-3 space-y-1">
                      <span className="text-[9px] font-mono text-slate-405 block uppercase">ECONOMIC CALENDAR RISK</span>
                      <p className="text-slate-200 font-sans leading-tight">{reasoningResult.calendarRisk}</p>
                    </div>
                  </div>

                  {/* Compulsory Take Profit and Stop Loss Parameters */}
                  <div className="border border-white/5 bg-emerald-500/5 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <span className="text-xs font-bold text-white font-mono uppercase">Calculated SL & TP Directives</span>
                      <span className="text-[10px] text-emerald-400 font-mono">Risk Reward: {reasoningResult.riskRewardRatio}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 bg-black/20 border border-white/5 rounded-lg">
                        <div className="text-[9px] text-slate-400 font-mono uppercase">Stop Loss SIZE</div>
                        <div className="text-xs font-bold text-rose-400 mt-0.5">{reasoningResult.stopLossPips} pips</div>
                      </div>
                      <div className="p-2 bg-black/20 border border-white/5 rounded-lg">
                        <div className="text-[9px] text-slate-400 font-mono uppercase">Take Profit SIZE</div>
                        <div className="text-xs font-bold text-emerald-400 mt-0.5">{reasoningResult.takeProfitPips} pips</div>
                      </div>
                      <div className="p-2 bg-black/20 border border-white/5 rounded-lg">
                        <div className="text-[9px] text-slate-400 font-mono uppercase">Trailing Activation</div>
                        <div className="text-xs font-bold text-emerald-400 mt-0.5">{reasoningResult.trailingStopPips} pips</div>
                      </div>
                    </div>
                  </div>

                  {/* Action Execution Option */}
                  {reasoningResult.outcome === 'APPROVE' && (
                    <div className="space-y-2">
                      <button
                        onClick={handleExecuteTrade}
                        disabled={isExecuting}
                        className="w-full py-4.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-black text-xs font-extrabold font-mono rounded-xl tracking-wider transition-all shadow-xl shadow-emerald-500/10 active:scale-95 text-center flex items-center justify-center gap-2 uppercase"
                      >
                        {isExecuting ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Transmitting Execution Vector...
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4" />
                            Authorize and Execute {selectedDirection} Order now
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {executionLog && (
                    <div className="p-3.5 bg-white/5 border border-white/5 uppercase rounded-xl font-mono text-[10px] text-emerald-400 tracking-wider">
                      {executionLog}
                    </div>
                  )}

                </motion.div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Quick action buttons / Plan breakdown details */}
            <div className="bg-slate-950/60 backdrop-blur-md border border-white/5 rounded-2xl p-5 shadow-lg space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 mb-1">
                <Shield className="w-4 h-4" />
                <h3 className="text-xs font-bold font-mono uppercase tracking-wider">Drawdown Safeguard</h3>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center bg-black/20 p-2.5 rounded-lg">
                  <span className="text-slate-400">Daily Drop Limit</span>
                  <span className="font-extrabold text-white font-mono">{userPlan.drawdownProtection || "5% limit"}</span>
                </div>
                <p className="text-[10px] text-slate-450 leading-tight">Engine ceases execution if margin/balance breaches your limit.</p>
              </div>
            </div>

            <div className="bg-slate-950/60 backdrop-blur-md border border-white/5 rounded-2xl p-5 shadow-lg space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 mb-1">
                <Target className="w-4 h-4" />
                <h3 className="text-xs font-bold font-mono uppercase tracking-wider">Lot Sizes Threshold</h3>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center bg-black/20 p-2.5 rounded-lg">
                  <span className="text-slate-400">Max Lot constraint</span>
                  <span className="font-extrabold text-white font-mono">{userPlan.maxLotSize || "0.02 lot"}</span>
                </div>
                <p className="text-[10px] text-slate-450 leading-tight">Gemini prevents orders exceeding customized scale to protect leverage.</p>
              </div>
            </div>

            <div className="bg-slate-950/60 backdrop-blur-md border border-white/5 rounded-2xl p-5 shadow-lg space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 mb-1">
                <Sliders className="w-4 h-4" />
                <h3 className="text-xs font-bold font-mono uppercase tracking-wider">Trailing Stop Setup</h3>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center bg-black/20 p-2.5 rounded-lg">
                  <span className="text-slate-400">Trailing Activation</span>
                  <span className="font-extrabold text-white font-mono">{userPlan.trailingStop || "Locked stop"}</span>
                </div>
                <p className="text-[10px] text-slate-450 leading-tight">Automatic profit protection engages at technical target intervals.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side Quotas & Conversations Block */}
        <div className="space-y-6">
          
          {/* Visual AI Quota Enforcement & Control Card */}
          <div className="bg-slate-950/60 backdrop-blur-md border border-white/5 rounded-2xl p-5 shadow-xl space-y-4 g-glass relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
                <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-white">AI Quota Monitor</h3>
              </div>
              <span className="text-[10px] bg-slate-800 text-slate-300 font-mono px-2 py-0.5 rounded uppercase font-extrabold">Active</span>
            </div>

            {quotaInfo ? (
              <div className="space-y-4">
                {/* Plan Tier Display */}
                <div className="flex items-center justify-between bg-black/20 p-3 rounded-xl border border-white/5">
                  <div>
                    <span className="text-[8px] text-slate-400 font-mono uppercase block">Subscription License</span>
                    <span className="text-sm font-extrabold text-white tracking-wide font-mono">{quotaInfo.plan} PLAN</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded font-mono text-[9px] font-bold">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    SECURE ACTIVE
                  </div>
                </div>

                {/* Simulated Tier Switches */}
                <div className="space-y-1">
                  <span className="text-[8px] text-slate-450 font-mono uppercase block">Test subscription profiles:</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['STARTER', 'PRO', 'ELITE'] as const).map(tier => (
                      <button
                        key={tier}
                        onClick={() => changePlanTier(tier)}
                        className={`py-1.5 rounded-lg border font-mono text-[9px] font-bold transition-all ${
                          quotaInfo.plan === tier 
                            ? 'bg-emerald-500 text-black border-emerald-500 hover:bg-emerald-600' 
                            : 'bg-white/5 border-white/5 text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        {tier}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Low Quota Warning Bar */}
                {quotaInfo.lowQuotaMode && (
                  <div className="bg-orange-500/15 border border-orange-500/30 text-orange-400 text-[10px] font-mono px-3 py-2 rounded-lg flex items-center gap-2 animate-pulse">
                    <AlertCircle className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                    <span>[LOW QUOTA MODE ACTIVE] 1-Sentence High-Density Compression</span>
                  </div>
                )}

                {/* Quota Indicators */}
                <div className="space-y-4 pt-1">
                  {/* Chats Limit */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-slate-400 font-sans">AI Chat Messages</span>
                      <span className="font-bold text-white font-mono">
                        {quotaInfo.chatsTotal - quotaInfo.chatsRemaining} / {quotaInfo.chatsTotal}
                      </span>
                    </div>
                    <div className="w-full bg-slate-850 h-2 rounded-full overflow-hidden border border-white/5">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${
                          (quotaInfo.chatsRemaining / quotaInfo.chatsTotal) > 0.6 
                            ? 'bg-emerald-500' 
                            : (quotaInfo.chatsRemaining / quotaInfo.chatsTotal) > 0.3 
                            ? 'bg-amber-500' 
                            : 'bg-rose-500'
                        }`}
                        style={{ width: `${Math.min(100, (1 - (quotaInfo.chatsRemaining / quotaInfo.chatsTotal)) * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[8px] font-mono text-slate-500">
                      <span>Consumed</span>
                      <span>{quotaInfo.chatsRemaining} daily chats remaining.</span>
                    </div>
                  </div>

                  {/* Deeps Limit */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-slate-400 font-sans">Confluence Analyses (Deep)</span>
                      <span className="font-bold text-white font-mono">
                        {quotaInfo.deepsTotal - quotaInfo.deepsRemaining} / {quotaInfo.deepsTotal}
                      </span>
                    </div>
                    <div className="w-full bg-slate-850 h-2 rounded-full overflow-hidden border border-white/5">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${
                          (quotaInfo.deepsRemaining / quotaInfo.deepsTotal) > 0.6 
                            ? 'bg-emerald-500' 
                            : (quotaInfo.deepsRemaining / quotaInfo.deepsTotal) > 0.3 
                            ? 'bg-amber-500' 
                            : 'bg-rose-500'
                        }`}
                        style={{ width: `${Math.min(100, (1 - (quotaInfo.deepsRemaining / quotaInfo.deepsTotal)) * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[8px] font-mono text-slate-500">
                      <span>Consumed</span>
                      <span>{quotaInfo.deepsRemaining} daily analyses remaining.</span>
                    </div>
                  </div>
                </div>

              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-slate-500 font-mono text-[10px]">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                Syncing system levels...
              </div>
            )}
          </div>

          {/* Right Side: Professional Mentor Chat Container */}
          <div className="bg-slate-950/60 backdrop-blur-md border border-white/5 rounded-2xl shadow-xl flex flex-col h-[70vh] lg:h-[50vh] overflow-hidden g-glass relative">
          
          <div className="p-4 bg-black/40 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
              <div>
                <h3 className="text-xs font-extrabold text-white font-mono uppercase tracking-widest">Mentor Conversation</h3>
                <p className="text-[9px] text-emerald-400 font-mono">PRO-ACTIVE ENFORCEMENT ON</p>
              </div>
            </div>
            <button 
              onClick={() => setIsSettingUp(true)}
              className="px-2 py-1 hover:bg-white/5 rounded-lg border border-white/10 text-[9px] font-mono text-slate-400 hover:text-white transition-all capitalize"
            >
              Reconfigure Plan
            </button>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-4 custom-scrollbar">
            {messages.map((m) => (
              <div 
                key={m.id}
                className={`flex flex-col max-w-[85%] ${m.sender === 'user' ? 'ml-auto items-end' : 'items-start'}`}
              >
                <div className={`p-3 rounded-2xl text-xs leading-relaxed ${
                  m.sender === 'user' 
                    ? 'bg-emerald-500 text-black font-medium rounded-tr-none' 
                    : 'bg-white/5 border border-white/5 text-slate-200 rounded-tl-none font-sans'
                }`}>
                  {m.text}
                </div>
                <span className="text-[9px] text-slate-500 font-mono mt-1 px-1">
                  {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
            {isSendingMessage && (
              <div className="flex items-center gap-1.5 text-slate-500/80 font-mono text-[10px] items-center p-2">
                <RefreshCw className="w-3 h-3 animate-spin text-emerald-500" />
                Mentor is writing...
              </div>
            )}
          </div>

          <form onSubmit={handleSendMessage} className="p-3 bg-black/60 border-t border-white/5 flex gap-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask Chatrade mentor about indices, rules..."
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-sans"
            />
            <button
              type="submit"
              disabled={isSendingMessage || !inputMessage.trim()}
              className="p-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-black rounded-xl transition-all shadow active:scale-95"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>
);
}
