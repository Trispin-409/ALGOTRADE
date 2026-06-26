import React from 'react';
import { 
  Cpu, Globe, BarChart3, Newspaper, BrainCircuit, Activity, 
  MessageSquareText, TrendingUp, AlertCircle, ShieldCheck, Zap,
  Smile, CheckCircle, ArrowRight, Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useStore } from '../src/store';

export const AGENTS_CONFIG = [
  { id: 'news', name: 'News Agent', icon: <Newspaper className="w-3.5 h-3.5" />, description: 'Google Grounding & Sentiment Analysis' },
  { id: 'technical', name: 'Technical Agent', icon: <TrendingUp className="w-3.5 h-3.5" />, description: 'Multi-Timeframe Confluence Check' },
  { id: 'structure', name: 'Structure Agent', icon: <Cpu className="w-3.5 h-3.5" />, description: 'SMC, Liquidity & Pattern Scan' },
  { id: 'session', name: 'Session Agent', icon: <Globe className="w-3.5 h-3.5" />, description: 'Global Market Session & Volatility Multiplier' },
  { id: 'generator', name: 'Strategy Gen', icon: <BrainCircuit className="w-3.5 h-3.5" />, description: 'Dynamic Trade Setup Synthesis' },
  { id: 'ranking', name: 'Ranking Agent', icon: <BarChart3 className="w-3.5 h-3.5" />, description: 'Strategy Sorter & Probability Grader' },
  { id: 'risk', name: 'Risk Agent', icon: <ShieldCheck className="w-3.5 h-3.5" />, description: 'Leverage, Equity & Drawdown Guard' },
  { id: 'psychology', name: 'Psychology Agent', icon: <Smile className="w-3.5 h-3.5" />, description: 'Impatience Safeguard & Discipline Audit' },
  { id: 'consensus', name: 'Consensus Agent', icon: <CheckCircle className="w-3.5 h-3.5" />, description: 'Multi-Agent Voting Alignment' },
  { id: 'execution', name: 'Execution Agent', icon: <Zap className="w-3.5 h-3.5" />, description: 'Vertex Core Broker Trade Dispatcher' },
  { id: 'manager', name: 'Trade Manager', icon: <Activity className="w-3.5 h-3.5" />, description: 'Trailing Stop & Partial profit locking' }
];

const CommandCenter: React.FC = () => {
  const { 
    isAutoTrade, 
    setIsAutoTrade,
    autoTradeConfirmationOpen,
    setAutoTradeConfirmationOpen,
    agentStatus, 
    agentLogs, 
    strategies, 
    marketSession, 
    timeframeAnalysis, 
    newsImpact, 
    riskMetrics,
    activeStepIndex,
    pipelineLogs,
    debateDialogue,
    tradeSignal,
    strategySettings,
    account
  } = useStore();

  const activeSymbol = strategySettings?.symbol || 'XAUUSDm';

  const liveBalance = account?.balance ?? riskMetrics.balance ?? 10000;
  const liveEquity = account?.equity ?? riskMetrics.equity ?? 10050;
  const liveMargin = account?.margin ?? riskMetrics.margin ?? 0;
  const liveFreeMargin = account?.freeMargin ?? riskMetrics.freeMargin ?? (liveBalance - liveMargin);
  const liveDrawdown = liveBalance > 0 ? Math.max(0, ((liveBalance - liveEquity) / liveBalance) * 100) : 0;
  const liveHealth = liveDrawdown > 5 ? 'High Risk' : (liveDrawdown > 2 ? 'Warning' : 'Protected');
  const liveRiskPercent = strategySettings.riskConfig?.riskPercentage || riskMetrics.riskPercent || 0.7;

  const toggleAutoTradeMode = () => {
    if (!isAutoTrade) {
      setAutoTradeConfirmationOpen(true);
    } else {
      setIsAutoTrade(false);
      localStorage.setItem('auto_trade_mode', 'false');
    }
  };

  const confirmEnableAutoTrade = () => {
    setIsAutoTrade(true);
    localStorage.setItem('auto_trade_mode', 'true');
    setAutoTradeConfirmationOpen(false);
  };

  const cancelEnableAutoTrade = () => {
    setAutoTradeConfirmationOpen(false);
  };

  return (
    <div className="p-4 bg-[#050608] min-h-screen text-slate-200 font-sans space-y-4 select-none relative">
      
      {/* HEADER SECTION */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-4">
        <div>
          <h1 className="text-xl font-black text-white uppercase tracking-tighter flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse inline-block" />
            Command Center
          </h1>
          <p className="text-slate-500 font-mono text-[9px] uppercase tracking-wider">
            CHATRADE AUTONOMOUS BRAIN • REAL-TIME MULTI-AGENT STATE ENGINE
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Active symbol badge */}
          <div className="bg-white/5 border border-white/10 px-3 py-1 rounded-full font-mono text-[10px] text-slate-300">
            SYMBOL: <span className="text-[#d4af37] font-bold">{activeSymbol}</span>
          </div>

          {/* Autonomous Trading toggle pill (EXACTLY MATCHING CHATRADE AI) */}
          <div 
            className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500/10 to-[#d4af37]/5 border border-[#d4af37]/30 px-3 py-1.5 rounded-full text-[10px] shadow-[0_0_10px_rgba(212,175,55,0.05)] cursor-pointer select-none active:scale-95 transition-all" 
            onClick={toggleAutoTradeMode}
          >
            <span className="text-[#d4af37] font-black uppercase tracking-wider text-[8px] sm:text-[9px]">AUTONOMOUS TRADE:</span>
            <button
              type="button"
              className={`relative inline-flex h-3.5 w-6 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isAutoTrade ? 'bg-[#d4af37]' : 'bg-slate-700'}`}
            >
              <span
                className={`pointer-events-none inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isAutoTrade ? 'translate-x-2.5' : 'translate-x-0'}`}
              />
            </button>
          </div>
        </div>
      </header>

      {/* PIPELINE PROGRESS TIMELINE MONITOR */}
      <div className="bg-[#080a0f] p-4 rounded-xl border border-white/5 space-y-4">
        {/* Progress Header & Track */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-1 border-b border-white/[0.03]">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isAutoTrade ? 'bg-amber-400 animate-ping' : 'bg-slate-600'}`} />
            <span className="text-[10px] font-black text-white uppercase tracking-wider">
              Autonomous Cognitive Pipeline Process
            </span>
            {isAutoTrade && (
              <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded font-mono font-bold animate-pulse">
                STEP {activeStepIndex + 1} OF 11: {AGENTS_CONFIG[activeStepIndex]?.name.toUpperCase()}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-3 flex-1 md:max-w-md">
            <div className="relative flex-1 h-1.5 bg-slate-900 rounded-full overflow-hidden border border-white/[0.02]">
              <motion.div 
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-[#d4af37] via-amber-400 to-[#d4af37] shadow-[0_0_8px_rgba(212,175,55,0.4)]"
                initial={{ width: '0%' }}
                animate={{ width: `${isAutoTrade ? Math.round((activeStepIndex / 10) * 100) : 0}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
            <span className="text-[10px] font-mono font-bold text-slate-400 min-w-[32px] text-right">
              {isAutoTrade ? Math.round((activeStepIndex / 10) * 100) : 0}%
            </span>
          </div>
        </div>

        {/* Horizontal Timeline Scroll Container */}
        <div className="overflow-x-auto custom-scrollbar pb-2">
          <div className="flex items-center min-w-[1100px] justify-between px-3 py-2 relative">
            
            {/* Background alignment line */}
            <div className="absolute left-10 right-10 top-[26px] h-[1px] bg-white/[0.03] -z-1" />
            
            {AGENTS_CONFIG.map((agent, index) => {
              const isActive = activeStepIndex === index && isAutoTrade;
              const isCompleted = index < activeStepIndex && isAutoTrade;
              const statusInfo = agentStatus[agent.id] || { status: 'IDLE', confidence: 0 };
              
              return (
                <React.Fragment key={agent.id}>
                  {/* Agent Timeline Node */}
                  <div className="flex flex-col items-center gap-2 w-24 relative z-10 select-none group">
                    {/* Node circle */}
                    <div className="relative">
                      {isActive && (
                        <span className="absolute -inset-1.5 rounded-full bg-amber-500/15 animate-ping -z-1" />
                      )}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 border ${
                        isActive 
                          ? 'border-[#d4af37] text-[#d4af37] bg-gradient-to-r from-amber-500/20 to-[#d4af37]/15 scale-110 shadow-[0_0_15px_rgba(212,175,55,0.35)]'
                          : isCompleted
                            ? 'border-emerald-500 text-emerald-400 bg-emerald-950/20'
                            : 'border-white/5 text-slate-600 bg-[#050608] group-hover:border-white/10 group-hover:text-slate-400'
                      }`}>
                        {agent.icon}
                      </div>
                      
                      {/* Numeric step overlay */}
                      <span className={`absolute -top-1 -right-1 w-4 h-4 rounded-full text-[8px] font-black flex items-center justify-center border ${
                        isActive
                          ? 'bg-amber-500 text-slate-950 border-[#d4af37]'
                          : isCompleted
                            ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                            : 'bg-slate-900 text-slate-500 border-white/5'
                      }`}>
                        {index + 1}
                      </span>
                    </div>

                    {/* Meta info */}
                    <div className="flex flex-col items-center text-center">
                      <span className={`text-[8px] font-black uppercase tracking-tight leading-none ${
                        isActive ? 'text-[#d4af37]' : isCompleted ? 'text-emerald-400' : 'text-slate-500'
                      }`}>
                        {agent.name}
                      </span>
                      <span className={`text-[6.5px] font-mono mt-1 px-1 py-0.2 rounded-sm ${
                        isActive 
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/10 animate-pulse'
                          : isCompleted
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-white/[0.02] text-slate-600'
                      }`}>
                        {isActive ? 'COMPUTING' : isCompleted ? 'RESOLVED' : 'STANDBY'}
                      </span>
                    </div>
                  </div>

                  {/* Connecting Timeline Segments */}
                  {index < AGENTS_CONFIG.length - 1 && (
                    <div className="flex-1 px-1 relative h-1 min-w-[20px] flex items-center">
                      <div className={`w-full h-[2px] rounded transition-all duration-300 ${
                        isCompleted 
                          ? 'bg-emerald-500/70 shadow-[0_0_5px_rgba(16,185,129,0.3)]' 
                          : isActive 
                            ? 'bg-gradient-to-r from-amber-500/50 to-white/5' 
                            : 'bg-white/5'
                      }`} />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Dynamic Spotlight Active Agent Card (Driven by live event stream) */}
        <AnimatePresence mode="wait">
          {isAutoTrade && AGENTS_CONFIG[activeStepIndex] && (
            <motion.div 
              key={activeStepIndex}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="bg-gradient-to-r from-[#0a0d14] to-[#07090e] border border-[#d4af37]/15 rounded-lg p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
            >
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-[#d4af37]/10 text-[#d4af37] rounded-lg border border-[#d4af37]/20 flex items-center justify-center">
                  {AGENTS_CONFIG[activeStepIndex].icon}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-white uppercase tracking-wider">
                      {AGENTS_CONFIG[activeStepIndex].name} Spotlight
                    </span>
                    <span className="text-[7.5px] bg-[#d4af37]/10 text-[#d4af37] px-1.5 py-0.2 rounded uppercase font-bold tracking-wider">
                      Active Processing Node
                    </span>
                  </div>
                  <p className="text-[9px] font-mono text-slate-300 leading-relaxed">
                    {agentStatus[AGENTS_CONFIG[activeStepIndex].id]?.latestInsight || 'Establishing websocket link and grounding indicators...'}
                  </p>
                </div>
              </div>

              <div className="flex sm:flex-col items-end gap-2 sm:gap-1 w-full sm:w-auto border-t sm:border-t-0 border-white/5 pt-2 sm:pt-0 shrink-0">
                <div className="flex justify-between sm:justify-start items-center gap-1.5 w-full sm:w-auto">
                  <span className="text-[8px] text-slate-500 font-mono uppercase">Node Confidence:</span>
                  <span className="text-[10px] font-mono font-black text-emerald-400 bg-emerald-950/20 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                    {agentStatus[AGENTS_CONFIG[activeStepIndex].id]?.confidence || 88}%
                  </span>
                </div>
                <span className="text-[7px] text-slate-600 font-mono uppercase text-right hidden sm:inline-block">
                  AISTUDIO VERTEXT CORE CONNECTED
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* MAIN DATA GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        
        {/* LEFT COLUMN: 11 COLLABORATING AGENTS PANELS */}
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-[#080a0f] p-4 rounded-xl border border-white/5 space-y-3">
            <h3 className="text-[10px] font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-[#d4af37]" /> Collaborative Multi-Agent Network
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[550px] overflow-y-auto pr-1 custom-scrollbar">
              {AGENTS_CONFIG.map((agent, index) => {
                const isActive = activeStepIndex === index && isAutoTrade;
                const status = agentStatus[agent.id] || { status: 'IDLE', latestInsight: 'Waiting for pipeline step...', confidence: 0 };
                const logs = agentLogs[agent.id] || [];
                
                return (
                  <div 
                    key={agent.id} 
                    className={`p-3 rounded-lg border transition-all ${
                      isActive 
                        ? 'bg-gradient-to-br from-[#0e131d] to-[#141b29] border-[#d4af37]/40 shadow-[0_0_15px_rgba(212,175,55,0.05)]' 
                        : 'bg-[#090b10] border-white/5'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`p-1 rounded ${isActive ? 'bg-[#d4af37]/10 text-[#d4af37]' : 'bg-white/5 text-slate-400'}`}>
                          {agent.icon}
                        </span>
                        <div className="flex flex-col">
                          <span className="text-[9px] font-bold text-white leading-tight">{agent.name}</span>
                          <span className="text-[7px] text-slate-500 leading-tight">{agent.description}</span>
                        </div>
                      </div>
                      
                      <span className={`text-[7px] font-mono px-1.5 py-0.5 rounded uppercase ${
                        isActive 
                          ? 'bg-amber-950 text-amber-300 font-bold border border-amber-500/20' 
                          : status.status === 'ACTIVE' 
                            ? 'bg-emerald-950/40 text-emerald-400' 
                            : 'bg-slate-900 text-slate-500'
                      }`}>
                        {isActive ? 'COMPUTING' : status.status}
                      </span>
                    </div>

                    {/* Agent insights & stream log */}
                    <div className="text-[8px] font-mono h-24 overflow-y-auto custom-scrollbar space-y-1 bg-black/40 p-2 rounded border border-white/[0.02]">
                      {logs.length > 0 ? (
                        logs.map((log, i) => (
                          <div key={i} className={i === 0 ? 'text-slate-200' : 'text-slate-500'}>
                            {log}
                          </div>
                        ))
                      ) : (
                        <div className="text-slate-600 italic">Waiting for pipeline scan...</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* MIDDLE COLUMN: INTELLIGENCE PANELS */}
        <div className="space-y-4">
          
          {/* NEWS INTELLIGENCE */}
          <div className="bg-[#080a0f] p-4 rounded-xl border border-white/5 space-y-3">
            <h3 className="text-[10px] font-black text-white uppercase tracking-wider flex items-center gap-1.5">
              <Newspaper className="w-3.5 h-3.5 text-sky-400" /> Grounding & News Intel
            </h3>
            
            <div className="bg-black/45 p-3 rounded-lg border border-white/[0.02] space-y-2.5 font-mono text-[9px]">
              <div className="flex justify-between items-center border-b border-white/[0.03] pb-1.5">
                <span className="text-slate-400">Vertex Grounded Articles:</span>
                <span className="text-white font-bold">{newsImpact.articleCount || 0} items</span>
              </div>
              <div className="flex justify-between items-center border-b border-white/[0.03] pb-1.5">
                <span className="text-slate-400">Economic Calendar Volatility:</span>
                <span className={`font-bold uppercase ${newsImpact.impact === 'HIGH' ? 'text-rose-500' : 'text-amber-500'}`}>
                  {newsImpact.impact} IMPACT
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-white/[0.03] pb-1.5">
                <span className="text-slate-400">USD Sentiment Score:</span>
                <span className={`font-bold ${newsImpact.sentimentScore && newsImpact.sentimentScore < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {newsImpact.sentimentScore || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">News Sentiment Bias:</span>
                <span className="text-[#d4af37] font-bold uppercase">{newsImpact.bias}</span>
              </div>
            </div>
          </div>

          {/* RISK AGENT */}
          <div className="bg-[#080a0f] p-4 rounded-xl border border-white/5 space-y-3">
            <h3 className="text-[10px] font-black text-white uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Risk & Margin Safeguards
            </h3>
            
            <div className="bg-black/45 p-3 rounded-lg border border-white/[0.02] space-y-2 font-mono text-[9px] text-slate-400">
              <div className="flex justify-between items-center border-b border-white/[0.03] pb-1.5">
                <span className="text-slate-400">Portfolio Bal / Eq:</span>
                <span className="text-white font-bold">
                  ${liveBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / ${liveEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-white/[0.03] pb-1.5">
                <span className="text-slate-400">Margin / Free Margin:</span>
                <span className="text-slate-300">
                  ${liveMargin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / ${liveFreeMargin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-white/[0.03] pb-1.5">
                <span className="text-slate-400">Allocated Risk:</span>
                <span className="text-[#d4af37] font-bold">{liveRiskPercent}% Per Trade</span>
              </div>
              <div className="flex justify-between items-center border-b border-white/[0.03] pb-1.5">
                <span className="text-slate-400">Current Floating Drawdown:</span>
                <span className="text-rose-400 font-bold">{liveDrawdown.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Capital Health Status:</span>
                <span className="text-emerald-400 font-extrabold uppercase animate-pulse">{liveHealth}</span>
              </div>
            </div>
          </div>

          {/* DEBATE CHAMBER */}
          <div className="bg-[#080a0f] p-4 rounded-xl border border-white/5 space-y-3">
            <h3 className="text-[10px] font-black text-white uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquareText className="w-3.5 h-3.5 text-indigo-400" /> Debate & Alignment Chamber
            </h3>
            
            <div className="bg-black/45 p-3 rounded-lg border border-white/[0.02] h-40 overflow-y-auto custom-scrollbar font-mono text-[8px] text-slate-400 space-y-2">
              {debateDialogue.length > 0 ? (
                debateDialogue.map((line, idx) => {
                  const isConsensus = line.includes("Consensus");
                  return (
                    <div 
                      key={idx} 
                      className={`p-1.5 rounded leading-relaxed border border-transparent ${
                        isConsensus 
                          ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-400 font-bold' 
                          : 'bg-white/[0.01]'
                      }`}
                    >
                      {line}
                    </div>
                  );
                })
              ) : (
                <div className="text-slate-600 italic text-center pt-8">
                  Waiting for Consensus phase...
                </div>
              )}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: MARKET PROFILE & STRATEGY LAB */}
        <div className="space-y-4">
          
          {/* SMC TIME FRAME ANALYSIS MATRIX */}
          <div className="bg-[#080a0f] p-4 rounded-xl border border-white/5 space-y-3">
            <h3 className="text-[10px] font-black text-white uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-[#d4af37]" /> Multi-Timeframe SMC Matrix
            </h3>
            
            <div className="bg-black/40 rounded-lg overflow-hidden border border-white/[0.03]">
              <div className="grid grid-cols-5 gap-1 bg-white/[0.03] p-1.5 text-[8px] font-bold uppercase tracking-wider text-slate-500 text-center">
                <div>TF</div>
                <div>TREND</div>
                <div>STRUCTURE</div>
                <div>MOMENTUM</div>
                <div>BIAS</div>
              </div>
              
              <div className="divide-y divide-white/[0.03] font-mono text-[8px] text-center">
                {['W1','D1','H4','H1','M15','M5','M1'].map(tf => {
                  const data = timeframeAnalysis[tf] || { trend: '-', structure: '-', momentum: '-', bias: '-' };
                  return (
                    <div key={tf} className="grid grid-cols-5 gap-1 p-1.5 items-center hover:bg-white/[0.02] transition-colors">
                      <div className="font-bold text-slate-300 text-left pl-1">{tf}</div>
                      <div className={data.trend?.includes('Bullish') ? 'text-emerald-400 font-bold' : 'text-rose-400'}>
                        {data.trend}
                      </div>
                      <div className="text-slate-400">{data.structure}</div>
                      <div className="text-slate-400">{data.momentum}</div>
                      <div className="text-sky-400 font-bold">{data.bias}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* STRATEGY LAB */}
          <div className="bg-[#080a0f] p-4 rounded-xl border border-white/5 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-[10px] font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                <BrainCircuit className="w-3.5 h-3.5 text-[#d4af37]" /> Strategy Lab Candidates
              </h3>
              <span className="text-[8px] font-mono font-bold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20 uppercase">
                {marketSession || 'NY/London'}
              </span>
            </div>
            
            <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
              {strategies.length > 0 ? (
                strategies.map((s, i) => (
                  <div 
                    key={i} 
                    className={`text-[9px] font-mono p-2 rounded border flex justify-between items-center transition-all ${
                      s.status === 'MATCHED' 
                        ? 'bg-emerald-950/25 border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.05)]' 
                        : s.status === 'REJECTED'
                          ? 'bg-rose-950/5 border-rose-500/10'
                          : 'bg-black/30 border-white/[0.02]'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="text-white font-bold">{s.name}</span>
                      <span className="text-[8px] text-slate-500">Intraday SMC</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className={s.status === 'MATCHED' ? 'text-emerald-400 font-bold' : s.status === 'REJECTED' ? 'text-rose-500' : 'text-slate-400'}>
                        {s.confidence}% {s.status}
                      </span>
                      {s.reason && <span className="text-rose-400 text-[7px] leading-none mt-0.5">{s.reason}</span>}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-slate-600 italic text-[9px] text-center py-6 font-mono">
                  Scanning candidates...
                </div>
              )}
            </div>
          </div>

          {/* ACTIVE DISPATCHED SETUP */}
          <div className="bg-[#080a0f] p-4 rounded-xl border border-[#d4af37]/10 space-y-3 shadow-[0_0_20px_rgba(212,175,55,0.02)]">
            <h3 className="text-[10px] font-black text-white uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-[#d4af37]" /> Active Trade Dispatch
            </h3>
            
            {tradeSignal ? (
              <div className="space-y-2 font-mono text-[9px]">
                <div className="flex justify-between items-center bg-[#d4af37]/5 p-2 rounded border border-[#d4af37]/25">
                  <span className="text-slate-400">Winning Setup:</span>
                  <span className="text-[#d4af37] font-extrabold">{tradeSignal.strategy}</span>
                </div>
                
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <div className="bg-black/40 p-1.5 rounded border border-white/[0.02] flex flex-col items-center">
                    <span className="text-slate-500 text-[8px]">DIRECTION</span>
                    <span className="text-emerald-400 font-black text-[11px]">{tradeSignal.direction}</span>
                  </div>
                  <div className="bg-black/40 p-1.5 rounded border border-white/[0.02] flex flex-col items-center">
                    <span className="text-slate-500 text-[8px]">RISK REWARD</span>
                    <span className="text-sky-400 font-bold text-[11px]">{tradeSignal.rr || '1:3.2'}</span>
                  </div>
                </div>

                <div className="bg-black/40 p-2 rounded border border-white/[0.02] space-y-1 text-slate-400">
                  <div className="flex justify-between"><span>Entry Target:</span> <span className="text-white font-bold">{tradeSignal.entry}</span></div>
                  <div className="flex justify-between"><span>Stop Loss (SL):</span> <span className="text-rose-500">{tradeSignal.sl}</span></div>
                  <div className="flex justify-between"><span>Take Profit (TP):</span> <span className="text-emerald-400">{tradeSignal.tp}</span></div>
                </div>

                <div className="flex justify-center items-center gap-1.5 bg-emerald-950/20 text-emerald-400 px-3 py-1.5 rounded border border-emerald-500/20 text-[8px] font-bold animate-pulse">
                  <CheckCircle className="w-3 h-3" />
                  LIVE AUTONOMOUS trade ACTIVE
                </div>
              </div>
            ) : (
              <div className="text-slate-600 italic text-[9px] text-center py-8 font-mono">
                Monitoring market confluence...
              </div>
            )}
          </div>

        </div>

      </div>

      {/* FOOTER TIMELINE VIEW */}
      <div className="bg-[#080a0f] p-4 rounded-xl border border-white/5 space-y-3">
        <h3 className="text-[10px] font-black text-white uppercase tracking-wider flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-emerald-400" /> Live Autonomous Execution Timeline
        </h3>
        
        <div className="bg-black/50 p-3 rounded-lg border border-white/[0.02] h-48 overflow-y-auto custom-scrollbar font-mono text-[9px] text-slate-400 space-y-1.5">
          {pipelineLogs.length > 0 ? (
            pipelineLogs.map((log, index) => (
              <div key={index} className="flex gap-2 items-start border-b border-white/[0.01] pb-1 hover:bg-white/[0.01] transition-colors px-1">
                <span className="text-slate-500 whitespace-nowrap">{log.slice(0, 10)}</span>
                <span className="text-slate-300">{log.slice(10)}</span>
              </div>
            ))
          ) : (
            <div className="text-slate-600 italic text-center pt-16">
              Waiting for trade dispatch pipeline events...
            </div>
          )}
        </div>
      </div>

      {/* AUTONOMOUS TRADE CONFIRMATION MODAL (EXACTLY MATCHING CHATRADE AI) */}
      <AnimatePresence>
        {autoTradeConfirmationOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg bg-[#070b13] border border-amber-500/30 rounded-3xl overflow-hidden shadow-2xl flex flex-col font-sans relative"
            >
              <div className="p-6 space-y-5 text-center">
                <div className="w-16 h-16 mx-auto bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20 mb-4">
                  <Cpu className="w-8 h-8 text-amber-400" />
                </div>
                <h3 className="text-xl font-black text-white">Enable Autonomous Trading</h3>
                <p className="text-sm text-slate-400">
                  Chatrade AI will monitor markets, generate strategies, and execute trades automatically according to your risk profile.
                </p>

                <div className="flex items-center gap-3 mt-8">
                  <button 
                    onClick={cancelEnableAutoTrade}
                    className="flex-1 py-3 px-4 rounded-xl font-bold border border-white/10 text-white hover:bg-white/5 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={confirmEnableAutoTrade}
                    className="flex-1 py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold shadow-lg transition-all cursor-pointer"
                  >
                    Understood, Enable
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default CommandCenter;
