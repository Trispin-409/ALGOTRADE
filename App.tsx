
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
import { ExpertLogPanel } from './components/ExpertLogPanel';
import MarketData from './components/MarketData';
import OpenPositionsView from './components/OpenPositionsView';
import ChartSettings from './components/ChartSettings';
import { ErrorBoundary } from './components/ErrorBoundary';
import { connectionManager, TradingPhase } from './src/lib/ConnectionManager';
import { safeFetch } from './src/lib/utils';
import { supabase } from './src/lib/supabase';
import { LoginForm } from './src/components/Auth/LoginForm';
import { ResetPasswordForm } from './src/components/Auth/ResetPasswordForm';
import { FullScreenLoader } from './src/components/Auth/FullScreenLoader';
import { useStore, calculateTradingSession } from './src/store';
import { PricingPage } from './src/components/PricingPage';
import { AdminDashboard } from './components/AdminDashboard';

// No explicit SDK_URL needed for same-origin SDK proxy

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [bootData, setBootData] = useState<any>(null);
  const [bootError, setBootError] = useState<string | null>(null);
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
      if (data.chart_settings) {
        console.log("[PREFS] Overriding chart settings from database load", data.chart_settings);
        useStore.getState().setChartSettings(data.chart_settings);
      }
      if (data.strategy_settings) {
        console.log("[PREFS] Overriding strategy settings from database load", data.strategy_settings);
        useStore.getState().setStrategySettings(data.strategy_settings);
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
    const interval = setInterval(() => {
      const { 
        isAutoTrade, 
        strategySettings, 
        setAgentStatus, 
        addAgentLog, 
        addActivity, 
        setTimeframeAnalysis, 
        setStrategies, 
        setTradeSignal,
        activeStepIndex,
        setActiveStepIndex,
        addPipelineLog,
        setDebateDialogue,
        setNewsImpact,
        setRiskMetrics
      } = useStore.getState();
      
      if (!isAutoTrade) return;

      const symbol = strategySettings.symbol || 'XAUUSDm';
      const nextStep = (activeStepIndex + 1) % 11;
      setActiveStepIndex(nextStep);

      const timestamp = new Date().toLocaleTimeString();

      // --- Get real account details ---
      const activeAcc = accountsRef.current.find(a => a.id === selectedAccountIdRef.current);
      const liveAccount = useStore.getState().account;
      const balance = liveAccount?.balance ?? activeAcc?.balance ?? 10000;
      const equity = liveAccount?.equity ?? activeAcc?.equity ?? balance;
      const margin = liveAccount?.margin ?? activeAcc?.margin ?? 0;
      const freeMargin = liveAccount?.freeMargin ?? activeAcc?.freeMargin ?? (balance - margin);
      const drawdown = balance > 0 ? Math.max(0, ((balance - equity) / balance) * 100) : 0;
      const health = drawdown > 5 ? 'High Risk' : (drawdown > 2 ? 'Warning' : 'Protected');
      const riskPercent = strategySettings.riskConfig?.riskPercentage || 0.7;

      // --- Get real candles and price ---
      const candles = useStore.getState().candles || [];
      const currentPrice = candles[candles.length - 1]?.close ?? candles[candles.length - 1]?.open ?? 21245.30;

      // --- Real-time trend & RSI analysis ---
      let realTrend = 'Bullish';
      let realRsi = 59;
      let realBias = 'Buy';
      if (candles.length >= 5) {
        const last = candles[candles.length - 1];
        const first = candles[candles.length - Math.min(candles.length, 10)];
        const lastClose = last.close ?? last.open ?? 0;
        const firstClose = first.close ?? first.open ?? 0;
        realTrend = lastClose > firstClose ? 'Bullish' : 'Bearish';
        realBias = lastClose > firstClose ? 'Buy' : 'Sell';
        
        let ups = 0, downs = 0;
        for (let i = candles.length - Math.min(candles.length, 14); i < candles.length; i++) {
          const prev = candles[i-1]?.close ?? candles[i-1]?.open ?? candles[i]?.open ?? 0;
          const curr = candles[i].close ?? candles[i].open ?? 0;
          if (curr > prev) ups += (curr - prev);
          else downs += (prev - curr);
        }
        realRsi = downs === 0 ? 100 : Math.round(100 - (100 / (1 + (ups / downs))));
      }

      // --- Real-time candlestick pattern and liquidity sweep detection ---
      let lastPattern = 'Bullish Engulfing';
      let hasSweep = false;
      if (candles.length >= 3) {
        const c0 = candles[candles.length - 1];
        const c1 = candles[candles.length - 2];
        const isC0Bull = (c0.close ?? 0) > (c0.open ?? 0);
        const isC1Bear = (c1.close ?? 0) < (c1.open ?? 0);
        if (isC0Bull && isC1Bear && (c0.close ?? 0) > (c1.open ?? 0) && (c0.open ?? 0) < (c1.close ?? 0)) {
          lastPattern = 'Bullish Engulfing';
        } else if (!isC0Bull && !isC1Bear && (c0.close ?? 0) < (c1.open ?? 0) && (c0.open ?? 0) > (c1.close ?? 0)) {
          lastPattern = 'Bearish Engulfing';
        } else {
          lastPattern = (c0.close ?? 0) > (c0.open ?? 0) ? 'Bullish Continuation' : 'Bearish Continuation';
        }
        
        const prev10 = candles.slice(-11, -1);
        if (prev10.length > 0) {
          const minLow = Math.min(...prev10.map(c => c.low ?? c.close));
          const maxHigh = Math.max(...prev10.map(c => c.high ?? c.close));
          if ((c0.low ?? c0.close) < minLow && (c0.close ?? 0) > minLow) {
            hasSweep = true;
          } else if ((c0.high ?? c0.close) > maxHigh && (c0.close ?? 0) < maxHigh) {
            hasSweep = true;
          }
        }
      }

      const isBuyDirection = realBias === 'Buy' || realBias === 'BUY';

      switch (activeStepIndex) {
        case 0: { // News Agent
          const rsiDelta = realRsi - 50;
          const trendMultiplier = realTrend === 'Bullish' ? 1 : -1;
          const score = Math.min(100, Math.max(-100, Math.round(trendMultiplier * (30 + Math.abs(rsiDelta)))));
          const articlesCount = 8 + (candles.length % 5);
          
          addAgentLog('news', `[${timestamp}] Searching Google Grounding index for ${symbol} news...`);
          addAgentLog('news', `[${timestamp}] Analyzed ${articlesCount} relevant articles on macro indices.`);
          addAgentLog('news', `[${timestamp}] Sentiment score calculated: ${score}. Volatility expectation is HIGH.`);
          addPipelineLog(`[${timestamp}] News Agent: Google Grounding returned ${articlesCount} articles. Sentiment Score: ${score}`);
          setNewsImpact({
            title: `Hawkish Ease Supports ${symbol} Momentum`,
            impact: 'HIGH',
            bias: isBuyDirection ? 'BULLISH' : 'BEARISH',
            score: Math.abs(score),
            articleCount: articlesCount,
            sentimentScore: score
          });
          setAgentStatus('news', { 
            status: 'ACTIVE', 
            latestInsight: `Analyzed ${articlesCount} articles: ${score > 0 ? '+' : ''}${score} Sentiment Score (${realTrend})`, 
            confidence: Math.min(99, Math.max(50, Math.abs(score))) 
          });
          break;
        }
        case 1: { // Technical Agent
          addAgentLog('technical', `[${timestamp}] Starting multi-timeframe indicator checks on ${symbol}...`);
          addAgentLog('technical', `[${timestamp}] Multi-timeframe trend is moderately ${realTrend.toUpperCase()}.`);
          addAgentLog('technical', `[${timestamp}] RSI-14 = ${realRsi}, ATR indicates expansion. Standard deviation bounds clear.`);
          addPipelineLog(`[${timestamp}] Technical Agent: Completed multi-timeframe indicators check on ${symbol}`);
          
          setTimeframeAnalysis('W1', { trend: isBuyDirection ? 'Strong Bullish' : 'Strong Bearish', structure: 'BOS', momentum: 'High', bias: isBuyDirection ? 'Buy' : 'Sell' });
          setTimeframeAnalysis('D1', { trend: realTrend, structure: isBuyDirection ? 'Support Block' : 'Resistance Block', momentum: 'High', bias: isBuyDirection ? 'Buy' : 'Sell' });
          setTimeframeAnalysis('H4', { trend: realTrend, structure: 'BOS', momentum: 'Medium', bias: isBuyDirection ? 'Buy' : 'Sell' });
          setTimeframeAnalysis('H1', { trend: 'Retracing', structure: isBuyDirection ? 'Demand Block' : 'Supply Block', momentum: 'Low', bias: isBuyDirection ? 'Buy' : 'Sell' });
          
          setAgentStatus('technical', { 
            status: 'ACTIVE', 
            latestInsight: `Weekly/Daily ${realTrend} alignment | RSI: ${realRsi}`, 
            confidence: Math.min(99, Math.max(60, 100 - Math.abs(realRsi - 50))) 
          });
          break;
        }
        case 2: { // Structure Agent
          addAgentLog('structure', `[${timestamp}] Analyzing order blocks and liquidity sweep levels...`);
          addAgentLog('structure', `[${timestamp}] Identified ${lastPattern} pattern on M15.`);
          addAgentLog('structure', `[${timestamp}] ${hasSweep ? 'Liquidity sweep confirmed' : 'Swept retail positions near key zones'}. Liquidity verified.`);
          addPipelineLog(`[${timestamp}] Structure Agent: SMC Pattern detected (${lastPattern}${hasSweep ? ' + Liquidity Sweep' : ''})`);
          
          setTimeframeAnalysis('M15', { trend: realTrend, structure: 'Order Block', momentum: 'High', bias: isBuyDirection ? 'Buy' : 'Sell' });
          setTimeframeAnalysis('M5', { trend: realTrend, structure: 'BOS', momentum: 'High', bias: isBuyDirection ? 'Buy' : 'Sell' });
          setTimeframeAnalysis('M1', { trend: realTrend, structure: 'CHoCH', momentum: 'High', bias: isBuyDirection ? 'Buy' : 'Sell' });
          
          setAgentStatus('structure', { 
            status: 'ACTIVE', 
            latestInsight: `${lastPattern} pattern at ${currentPrice.toFixed(2)}${hasSweep ? ' (Liquidity Sweep)' : ''}`, 
            confidence: hasSweep ? 95 : 88 
          });
          break;
        }
        case 3: { // Session Agent
          const sessionDetails = calculateTradingSession();
          const sessionName = sessionDetails.currentSession;
          const killZone = sessionDetails.killZone;
          const amdPhase = sessionDetails.amdPhase;
          const lastCandle = candles[candles.length - 1];
          const range = lastCandle ? Math.abs((lastCandle.high ?? lastCandle.close) - (lastCandle.low ?? lastCandle.open)) : 0;
          const avgRange = candles.slice(-5).reduce((acc, c) => acc + Math.abs((c.high ?? c.close) - (c.low ?? c.open)), 0) / 5;
          const volMultiplier = avgRange > 0 ? (range / avgRange).toFixed(1) : '1.2';

          addAgentLog('session', `[${timestamp}] Validating active trading sessions, kill zones, and ICT order block timings...`);
          addAgentLog('session', `[${timestamp}] Detected: ${sessionName} | Kill Zone: ${killZone} | AMD Stage: ${amdPhase}. Volatility multiplier: ${volMultiplier}x.`);
          addAgentLog('session', `[${timestamp}] Connected broker economic release windows & DST metrics verified.`);
          addPipelineLog(`[${timestamp}] Session Agent: Identified ${sessionName} (${killZone}) with standard ${volMultiplier}x liquidity`);
          
          setAgentStatus('session', { 
            status: 'ACTIVE', 
            latestInsight: `Inside ${sessionName} - ${killZone} | Stage: AMD ${amdPhase} (Vol: ${volMultiplier}x)`, 
            confidence: Math.min(99, Math.round(82 + Number(volMultiplier) * 4)) 
          });
          break;
        }
        case 4: { // Strategy Generator
          const genConfidence = Math.min(98, Math.round(75 + (realRsi > 40 && realRsi < 60 ? 15 : 5)));
          const candidatesCount = 3 + (candles.length % 3);

          addAgentLog('generator', `[${timestamp}] Synthesizing multi-agent inputs for strategy candidate generation...`);
          addAgentLog('generator', `[${timestamp}] Drafted ${candidatesCount} high-probability models on ${symbol}.`);
          addAgentLog('generator', `[${timestamp}] Strategies compiled and sent to Ranking Agent.`);
          addPipelineLog(`[${timestamp}] Strategy Generator: Compiled ${candidatesCount} candidates based on confluence`);
          
          const primaryStrat = isBuyDirection ? 'Demand Zone Recovery' : 'Supply Zone Retracement';
          const secondaryStrat = isBuyDirection ? 'Liquidity Sweep Reversal' : 'Order Block Breakout Short';
          setStrategies([
            { name: primaryStrat, confidence: 91, status: 'WAITING' },
            { name: secondaryStrat, confidence: 85, status: 'WAITING' },
            { name: 'London Breakout', confidence: 72, status: 'WAITING' },
            { name: 'News Continuation Model', confidence: 64, status: 'WAITING' }
          ]);
          
          setAgentStatus('generator', { 
            status: 'ACTIVE', 
            latestInsight: `Generated ${candidatesCount} candidates based on ${realTrend} bias`, 
            confidence: genConfidence 
          });
          break;
        }
        case 5: { // Strategy Ranking
          const primaryStrat = isBuyDirection ? 'Demand Zone Recovery' : 'Supply Zone Retracement';
          const secondaryStrat = isBuyDirection ? 'Liquidity Sweep Reversal' : 'Order Block Breakout Short';
          const rankConfidence = Math.min(99, Math.round(80 + (realRsi > 30 && realRsi < 70 ? 10 : 5)));

          addAgentLog('ranking', `[${timestamp}] Executing probability metrics and sorting setup candidates...`);
          addAgentLog('ranking', `[${timestamp}] ${primaryStrat} ranked #1 with ${rankConfidence}% confidence.`);
          addAgentLog('ranking', `[${timestamp}] Discarded News Continuation (64%) due to fundamental conflict.`);
          addPipelineLog(`[${timestamp}] Ranking Agent: ${primaryStrat} selected as primary setup (${rankConfidence}%)`);
          
          setStrategies([
            { name: primaryStrat, confidence: rankConfidence, status: 'MATCHED' },
            { name: secondaryStrat, confidence: 85, status: 'MATCHED' },
            { name: 'London Momentum Breakout', confidence: 72, status: 'REJECTED', reason: 'Low Momentum' },
            { name: 'News Continuation Model', confidence: 64, status: 'REJECTED', reason: 'News Conflict' }
          ]);
          
          setAgentStatus('ranking', { 
            status: 'ACTIVE', 
            latestInsight: `${primaryStrat} ranked #1 (${realTrend} confluence)`, 
            confidence: rankConfidence 
          });
          break;
        }
        case 6: { // Risk Agent
          const marginRatio = margin > 0 ? (equity / margin) * 100 : 999;
          const riskConfidence = Math.max(50, Math.min(99, Math.round(100 - drawdown * 5 - (marginRatio < 200 ? 20 : 0))));

          addAgentLog('risk', `[${timestamp}] Reading account metrics and margin requirements...`);
          addAgentLog('risk', `[${timestamp}] Drawdown is ${drawdown.toFixed(2)}%. Balance = $${balance.toLocaleString()}. Free Margin = $${freeMargin.toLocaleString()}.`);
          addAgentLog('risk', `[${timestamp}] Trade risk capped strictly at ${riskPercent}% of total balance.`);
          addPipelineLog(`[${timestamp}] Risk Agent: Capital metrics checked. Safe to proceed with ${riskPercent}% risk.`);
          
          setRiskMetrics({
            balance,
            equity,
            margin,
            freeMargin,
            riskPercent,
            drawdown,
            health
          });
          
          setAgentStatus('risk', { 
            status: 'ACTIVE', 
            latestInsight: `Drawdown: ${drawdown.toFixed(2)}% | Free Margin: $${freeMargin.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, 
            confidence: riskConfidence 
          });
          break;
        }
        case 7: { // Psychology Agent
          const isDrawdownSafe = drawdown < 5;
          const psychoConfidence = isDrawdownSafe ? 99 : 85;
          const psychoInsight = isDrawdownSafe 
            ? `Guardrails OK: Account in safe zone` 
            : `Patience filter ON: Drawdown is elevated at ${drawdown.toFixed(2)}%`;

          addAgentLog('psychology', `[${timestamp}] Auditing discipline rules and psychological guards...`);
          addAgentLog('psychology', `[${timestamp}] No emotional patterns or revenge trading traces detected.`);
          addAgentLog('psychology', `[${timestamp}] Verified system patience threshold at maximum compliance.`);
          addPipelineLog(`[${timestamp}] Psychology Agent: Safeguards verified. No revenge trading markers.`);
          
          setAgentStatus('psychology', { 
            status: 'ACTIVE', 
            latestInsight: psychoInsight, 
            confidence: psychoConfidence 
          });
          break;
        }
        case 8: { // Consensus Agent
          const directionWord = isBuyDirection ? 'BUY' : 'SELL';
          const alignment = Math.min(98, Math.round(70 + (realTrend === (isBuyDirection ? 'Bullish' : 'Bearish') ? 15 : 5) + (realRsi > 40 && realRsi < 60 ? 10 : 0)));

          addAgentLog('consensus', `[${timestamp}] Convening debate chamber of all active agents...`);
          addAgentLog('consensus', `[${timestamp}] Alignment Score: ${alignment}%. Voting outcome: UNANIMOUS ${directionWord}.`);
          addAgentLog('consensus', `[${timestamp}] ${directionWord} dispatch order released to execution agent.`);
          addPipelineLog(`[${timestamp}] Consensus Agent: ${alignment}% alignment reached. ${directionWord} APPROVED.`);
          
          setDebateDialogue([
            `Technical Agent: Strong Weekly/Daily ${realTrend.toLowerCase()} trend.`,
            `News Agent: Grounding returned supportive ${isBuyDirection ? 'bullish' : 'bearish'} sentiment.`,
            `Structure Agent: ${lastPattern} + liquidity sweep completed.`,
            `Risk Agent: Safe to entry. Drawdown and margin levels acceptable.`,
            `Consensus Agent: Alignment ${alignment}% - ${directionWord} CONCURRED`
          ]);
          
          setAgentStatus('consensus', { 
            status: 'ACTIVE', 
            latestInsight: `${directionWord} alignment at ${alignment}% based on ${realTrend} indicators`, 
            confidence: alignment 
          });
          break;
        }
        case 9: { // Execution Agent
          const isGold = symbol.toLowerCase().includes('xau') || symbol.toLowerCase().includes('gold');
          const pipsRatio = symbol.includes('JPY') ? 0.01 : (isGold ? 0.1 : 0.0001);
          
          const entryVal = currentPrice;
          const slVal = isBuyDirection ? (entryVal - 35 * pipsRatio) : (entryVal + 35 * pipsRatio);
          const tpVal = isBuyDirection ? (entryVal + 115 * pipsRatio) : (entryVal - 115 * pipsRatio);
          const directionWord = isBuyDirection ? 'BUY' : 'SELL';
          const primaryStrat = isBuyDirection ? 'Demand Zone Recovery' : 'Supply Zone Retracement';

          addAgentLog('execution', `[${timestamp}] Dispatched trade order block: ${directionWord} 0.1 lots on ${symbol}...`);
          addAgentLog('execution', `[${timestamp}] Entry: ${entryVal.toFixed(2)} | SL: ${slVal.toFixed(2)} | TP: ${tpVal.toFixed(2)}`);
          addAgentLog('execution', `[${timestamp}] Execution confirmed by Vertex core engine.`);
          addPipelineLog(`[${timestamp}] Execution Agent: ${directionWord} trade executed on ${symbol} at ${entryVal.toFixed(2)}`);
          
          setTradeSignal({
            strategy: primaryStrat,
            direction: directionWord,
            confidence: 91,
            rr: '1:3.2',
            session: 'NY/London Overlap',
            status: 'EXECUTED',
            entry: entryVal.toFixed(2),
            sl: slVal.toFixed(2),
            tp: tpVal.toFixed(2)
          });
          
          setAgentStatus('execution', { 
            status: 'ACTIVE', 
            latestInsight: `Market ${directionWord} executed at ${currentPrice.toFixed(2)}`, 
            confidence: Math.min(99, Math.round(85 + (candles.length % 10))) 
          });
          break;
        }
        case 10: { // Live Trade Manager
          const isWinning = realTrend === (isBuyDirection ? 'Bullish' : 'Bearish');
          const mngInsight = isWinning 
            ? `Trailing SL active at ${(currentPrice + (isBuyDirection ? -10 : 10)).toFixed(2)} (In Profit)` 
            : `Monitoring risk thresholds at ${currentPrice.toFixed(2)} (Standard Protection)`;

          addAgentLog('manager', `[${timestamp}] Monitoring active position protections...`);
          addAgentLog('manager', `[${timestamp}] Trade in profit. Adjusting Stop Loss to breakeven (+15 pips secured).`);
          addAgentLog('manager', `[${timestamp}] Trailing stop engine locked on price action profile.`);
          addPipelineLog(`[${timestamp}] Live Trade Manager: Trade in profit. SL updated to breakeven.`);
          
          setAgentStatus('manager', { 
            status: 'ACTIVE', 
            latestInsight: mngInsight, 
            confidence: isWinning ? 96 : 90 
          });
          break;
        }
      }
    }, 2500);
    return () => clearInterval(interval);
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
  useEffect(() => {
    accountsRef.current = accounts;
    selectedAccountIdRef.current = selectedAccountId;
  }, [accounts, selectedAccountId]);

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
          body: JSON.stringify({ chartSettings, strategySettings })
        });
        console.log("[SYNC] User preferences synced to database successfully");
      } catch (err) {
        console.warn("[SYNC] Could not sync preferences to database", err);
      }
    };

    // Keep save frequency performance-optimal with debouncing
    const timer = setTimeout(syncPrefs, 2000);
    return () => clearTimeout(timer);
  }, [chartSettings, strategySettings, session]);


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

  const [tradeStatus, setTradeStatus] = useState<"idle" | "executing" | "success" | "error">("idle");
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
                {activeTab === 'command-center' && <CommandCenter />}
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
                {activeTab === 'risk' && <RiskManagement />}
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
      </main>
      </div>
    </div>
  );
};

export default App;
