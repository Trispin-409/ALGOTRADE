import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Activity, Copy, Check, Cpu, Shield, 
  RefreshCw, CheckCircle2, XCircle 
} from 'lucide-react';
import { connectionManager } from '../src/lib/ConnectionManager';
import { useStore } from '../src/store';

interface ExpertLogPanelProps {
  executionMode?: 'EA' | 'STRATEGY';
}

export const ExpertLogPanel: React.FC<ExpertLogPanelProps> = ({ executionMode = 'EA' }) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'SYSTEM' | 'STRATEGY' | 'AI_DECISION'>('STRATEGY');
  const [logs, setLogs] = useState<any[]>(() => {
    const saved = localStorage.getItem('ea_journal');
    return saved ? JSON.parse(saved) : [];
  });

  const lastDecision = useStore(state => state.lastDecisionIndicators);

  // Sync activeTab to executionMode if mode changes
  useEffect(() => {
    setActiveTab('STRATEGY');
  }, [executionMode]);

  const filteredLogs = logs.filter(log => {
      if (activeTab === 'STRATEGY') {
          return log.source === 'AI_STRATEGY' || log.source === 'NODE_STRATEGY';
      } else {
          return log.source === 'SYSTEM';
      }
  });

  const [position, setPosition] = useState(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
    return {
      x: isMobile ? window.innerWidth - 64 : 20,
      y: isMobile ? 80 : window.innerHeight - 100
    };
  });

  // Keep button in boundaries during window resizing
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => {
        const isMobile = window.innerWidth < 1024;
        const maxX = window.innerWidth - 64;
        const maxY = window.innerHeight - 64;
        
        let newX = prev.x;
        let newY = prev.y;
        
        if (newX > maxX) newX = maxX;
        if (newY > maxY) newY = maxY;
        if (newX < 0) newX = 0;
        if (newY < 0) newY = 0;
        
        return { x: newX, y: newY };
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const isDragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const logsEndRef = useRef<HTMLDivElement>(null);

  const copyToClipboard = () => {
    const textToCopy = filteredLogs
      .map(log => `[${new Date(log.timestamp).toLocaleTimeString()}] [${log.level}] ${log.source}: ${log.message} ${log.metadata ? JSON.stringify(log.metadata) : ''}`)
      .join('\n');
    
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    localStorage.setItem('ea_journal', JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    // Listen for TRADING_JOURNAL and AI_DECISION_UPDATE
    const unsub = connectionManager.subscribe((data) => {
      if (data.type === 'TRADING_JOURNAL') {
        setLogs(prev => {
          const newLogs = [...prev, data.data || data];
          return newLogs.length > 500 ? newLogs.slice(newLogs.length - 500) : newLogs;
        });
      } else if (data.type === 'TRADING_JOURNAL_SNAPSHOT') {
        setLogs(prev => {
          const allLogs = [...(data.data || []), ...prev];
          const uniqueLogs = Array.from(new Map(allLogs.map(item => [item.timestamp + item.message, item])).values());
          return uniqueLogs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()).slice(-500);
        });
      } else if (data.type === 'AI_DECISION_UPDATE') {
        if (data.decision) {
          useStore.getState().setLastDecisionIndicators(data.decision);
        }
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (open && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, open, activeTab]);

  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    startPos.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    setPosition({
      x: e.clientX - startPos.current.x,
      y: e.clientY - startPos.current.y
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'INFO': return 'text-slate-400';
      case 'SIGNAL': return 'text-indigo-400 font-black';
      case 'ANALYSIS': return 'text-slate-500 italic';
      case 'TRADE': return 'text-amber-400 font-black underline';
      case 'EXECUTION': return 'text-amber-400';
      case 'SUCCESS': return 'text-emerald-400 font-bold';
      case 'ERROR': return 'text-rose-400 font-bold';
      case 'WARN': return 'text-orange-400 italic';
      default: return 'text-slate-400';
    }
  };

  const getSourceBadge = (source: string) => {
      switch(source) {
          case 'EA_CLOUD': return <span className="px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-[4px] mr-2 text-[7px] font-black uppercase">Terminal</span>;
          case 'AI_STRATEGY':
          case 'NODE_STRATEGY': return <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-[4px] mr-2 text-[7px] font-black uppercase">AI Strategy Engine</span>;
          case 'SYSTEM': return <span className="px-1.5 py-0.5 bg-slate-500/10 text-slate-400 border border-slate-500/20 rounded-[4px] mr-2 text-[7px] font-black uppercase">System</span>;
          default: return null;
      }
  }

  return (
    <>
      {/* Floating Button / Handle */}
      <div
        className="fixed cursor-grab active:cursor-grabbing hover:scale-105 transition-transform"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          top: position.y,
          left: position.x,
          touchAction: 'none',
          zIndex: 9999
        }}
      >
        <button
          onClick={() => setOpen(prev => !prev)}
          className="w-12 h-12 rounded-full shadow-[0_0_20px_rgba(var(--accent-color-rgb),0.3)] bg-black/40 border border-white/20 flex items-center justify-center backdrop-blur-md accent-glow"
          style={{ borderColor: 'rgba(var(--accent-color-rgb), 0.5)', color: 'var(--accent-color)' }}
        >
          <Activity className="w-6 h-6" />
        </button>
      </div>

      {/* The Panel if Open */}
      {open && (
        <div 
          className="fixed bottom-24 right-4 sm:bottom-24 sm:right-10 w-[90vw] sm:w-[500px] h-[300px] sm:h-[500px] 
            bg-slate-950/95 border rounded-xl shadow-[0_0_40px_rgba(0,0,0,0.8)] flex flex-col backdrop-blur-lg glowing-panel"
          style={{ zIndex: 9998, borderColor: 'rgba(var(--accent-color-rgb), 0.3)' }}
        >
          <div className="flex justify-between items-center p-3 border-b border-white/10 bg-white/5 rounded-t-xl shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--accent-color)' }} />
              <span className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--accent-color)' }}>Strategy Log</span>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={copyToClipboard}
                className="text-slate-400 hover:text-white transition-colors"
                title="Copy all logs"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
              <button 
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* TAB SWITCHER */}
          <div className="flex p-1 bg-black/40 border-b border-white/5 shrink-0">
            {(['SYSTEM', 'STRATEGY', 'AI_DECISION'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-1.5 px-2 text-[9px] font-black uppercase tracking-tighter transition-all border ${activeTab === tab ? 'text-white border-white/20' : 'text-slate-500 border-transparent hover:text-slate-400'}`}
                style={activeTab === tab ? { backgroundColor: 'var(--accent-color)' } : {}}
              >
                {tab === 'AI_DECISION' ? 'Why AI Decided' : tab}
              </button>
            ))}
          </div>

          {activeTab === 'AI_DECISION' ? (
            <div className="flex-1 overflow-y-auto p-3 font-mono text-[10px] sm:text-[11px] space-y-3 custom-scrollbar">
              {!lastDecision ? (
                <div className="text-slate-500 text-center py-10 space-y-2">
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 text-amber-500 animate-spin" />
                    <span className="font-bold text-[10px] uppercase tracking-wider text-amber-400">Pre-Flight Engine Active</span>
                  </div>
                  <p className="text-[9px] text-slate-400 max-w-[280px] mx-auto leading-relaxed">
                    Awaiting live candlestick scan sequence. Deterministic indicator metrics (RSI, ATR, SMC Structure) will render here synchronously upon the next engine decision tick.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Status Banner */}
                  <div className={`p-3 rounded-lg border flex justify-between items-center ${
                    lastDecision.outcome === 'MATCHED'
                      ? 'bg-emerald-950/25 border-emerald-500/20 text-emerald-400'
                      : 'bg-rose-950/20 border-rose-500/20 text-rose-400'
                  }`}>
                    <div className="space-y-0.5">
                      <div className="text-[9px] uppercase tracking-wider font-black text-slate-400">Decision Outcome</div>
                      <div className="text-xs font-black uppercase flex items-center gap-1.5">
                        {lastDecision.outcome === 'MATCHED' ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            ORDER DISPATCHED ({lastDecision.direction})
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5 text-rose-400" />
                            ENTRY BLOCKED (STANDBY)
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] uppercase tracking-wider font-black text-slate-400">Confidence Rating</div>
                      <div className="text-xs font-black">{lastDecision.confidence}%</div>
                    </div>
                  </div>

                  {/* Objective Metrics Grid */}
                  <div className="bg-black/40 p-2.5 rounded-lg border border-white/5 space-y-2">
                    <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                      <h4 className="text-[8.5px] font-black uppercase text-slate-300 flex items-center gap-1">
                        <Cpu className="w-3 h-3 text-[#d4af37]" /> Core Technical Confluences
                      </h4>
                      <span className="text-[7.5px] text-slate-500 uppercase">Synchronous telemetry</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[9px]">
                      {[
                        { 
                          name: "RSI-14 Index", 
                          value: lastDecision.rsi !== null ? `${Number(lastDecision.rsi).toFixed(1)} (${Number(lastDecision.rsi) > 70 ? 'Overbought' : Number(lastDecision.rsi) < 30 ? 'Oversold' : 'Neutral / Stable'})` : 'N/A'
                        },
                        { 
                          name: "ATR-14 Volatility", 
                          value: lastDecision.atr !== null ? `${lastDecision.atr.toFixed(5)}` : 'N/A'
                        },
                        { 
                          name: "H1 Weekly Trend", 
                          value: lastDecision.trend || 'N/A'
                        },
                        { 
                          name: "Market Structure", 
                          value: lastDecision.marketStructure || 'N/A'
                        },
                        { 
                          name: "Fair Value Gap (FVG)", 
                          value: lastDecision.fvg || 'Standby / Scan'
                        },
                        { 
                          name: "Liquidity Sweep Scan", 
                          value: lastDecision.liquiditySweep || 'Standby / Scan'
                        },
                        { 
                          name: "Session Window", 
                          value: lastDecision.session || 'N/A'
                        },
                        { 
                          name: "News Bias Rating", 
                          value: lastDecision.newsBias || 'NEUTRAL'
                        },
                        { 
                          name: "Risk Rating Exposure", 
                          value: lastDecision.riskRating || 'Low Exposure'
                        },
                        { 
                          name: "Win Probability", 
                          value: lastDecision.winProbability > 0 ? `${lastDecision.winProbability}%` : '0% (Below Filter)'
                        }
                      ].map((m, idx) => (
                        <div key={idx} className="bg-black/30 p-1.5 rounded border border-white/[0.02] flex flex-col gap-0.5">
                          <span className="text-slate-500 text-[7.5px] uppercase font-black">{m.name}</span>
                          <span className="text-slate-200 font-bold font-mono">{m.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* AI Cognitive Explainability Card */}
                  <div className="bg-[#d4af37]/5 p-2.5 rounded-lg border border-[#d4af37]/10 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[9px] font-black text-[#d4af37] uppercase">
                      <Shield className="w-3.5 h-3.5" /> Institutional Explainability Log
                    </div>
                    <p className="text-[8.5px] text-slate-300 leading-relaxed font-mono">
                      <span className="text-[#d4af37] font-bold">COGNITIVE SUMMARY:</span> {lastDecision.reason}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-3 font-mono text-[10px] sm:text-xs">
              {filteredLogs.length === 0 ? (
                <div className="text-slate-500 text-center mt-10">
                  <div className="flex items-center justify-center gap-2">
                    {activeTab === 'STRATEGY' ? 
                      <><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></div> Core Strategy Engine Listening...</> : 
                      <><div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse"></div> System Telemetry Standby</>
                    }
                  </div>
                  <p className="mt-2 opacity-50 uppercase text-[8px] font-bold">No logs for {activeTab} yet</p>
                </div>
              ) : (
                filteredLogs.map((log, i) => (
                  <div key={i} className="mb-2 leading-relaxed break-words flex items-start">
                    <span className="text-slate-500 mr-2 shrink-0">[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}]</span>
                    <div className="flex-1">
                      <div className="flex items-center flex-wrap">
                        {getSourceBadge(log.source)}
                        <span className={`${getLevelColor(log.level)} mr-2 font-bold`}>[{(log.level || "INFO").padEnd(9)}]</span>
                      </div>
                      <span className="text-slate-300">{log.message}</span>
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <span className="text-slate-500 ml-1 block mt-0.5 text-[9px] overflow-hidden truncate">
                          {JSON.stringify(log.metadata)}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      )}
    </>
  );
};
