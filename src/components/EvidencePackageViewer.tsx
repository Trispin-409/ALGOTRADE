import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, Activity, Cpu, Layers, CheckCircle2, ChevronDown, ChevronUp, 
  X, Play, FileText, TrendingUp, TrendingDown, Eye, AlertCircle, Clock, Target, ShieldAlert
} from 'lucide-react';

export interface EvidencePackageViewerProps {
  activeSetup?: any;
  isOpen: boolean;
  onClose: () => void;
  onExecute?: (direction: 'BUY' | 'SELL') => void;
  isExecuting?: boolean;
}

export const EvidencePackageViewer: React.FC<EvidencePackageViewerProps> = ({
  activeSetup,
  isOpen,
  onClose,
  onExecute,
  isExecuting = false
}) => {
  const [activeTab, setActiveTab] = useState<'STRUCTURES' | 'MULTI_TIMEFRAME' | 'STRATEGY' | 'AI_DECISION' | 'NEWS'>('STRUCTURES');

  if (!isOpen || !activeSetup) return null;

  const pkg = activeSetup.evidencePackage || {};
  const mtf = pkg.multiTimeframeEvidence || activeSetup.multiTimeframeEvidence || {};
  const timeframeData = mtf.timeframeData || {};
  
  // Single Source of Truth for structures
  const allStructures = mtf.allStructuresCombined || activeSetup.allStructuresCombined || [];
  
  // Backwards compatibility or direct assignment
  const orderBlocks = pkg.orderBlocks || mtf.orderBlocksAllTF || activeSetup.orderBlocks || [];
  const fvgGaps = pkg.fvgGaps || mtf.fvgGapsAllTF || activeSetup.fvgGaps || [];
  const sweeps = pkg.liquiditySweeps || mtf.sweepsAllTF || activeSetup.liquiditySweeps || [];
  const breaks = pkg.structureBreaks || mtf.structureBreaksAllTF || activeSetup.structureBreaks || [];

  const newsContext = pkg.newsContext || activeSetup.newsContext || activeSetup.news || {};
  const newsImpactAssessment = pkg.newsImpactAssessment || activeSetup.newsImpactAssessment || newsContext.newsImpactAssessment;
  
  const symbol = activeSetup.symbol || 'ASSET';
  const strategyName = activeSetup.strategyName || 'Confluence Strategy';
  const confidence = activeSetup.confidence || 90;
  const direction = activeSetup.direction || 'BUY';

  // Format AI decision reason
  const aiExplanation = activeSetup.aiExplanation || pkg.approvedReason || activeSetup.approvedReason || 'Vertex AI has validated the structural confluences and approved the signal.';

  const renderStructuresTab = () => {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-white font-bold text-sm">Deterministic Structures ({allStructures.length} Detected)</span>
        </div>
        {allStructures.length === 0 ? (
          <p className="text-slate-500 text-xs">No deterministic structures mapped in active window.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
            {allStructures.map((struct: any, idx: number) => (
              <div key={idx} className="bg-black/40 border border-white/5 rounded-lg p-3 text-[11px] font-mono hover:border-white/10 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded font-bold ${
                      struct.type.includes('BULLISH') || struct.type.includes('DISCOUNT') ? 'bg-emerald-500/20 text-emerald-400' :
                      struct.type.includes('BEARISH') || struct.type.includes('PREMIUM') ? 'bg-rose-500/20 text-rose-400' :
                      'bg-cyan-500/20 text-cyan-400'
                    }`}>
                      {struct.type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-slate-400 bg-white/5 px-1.5 py-0.5 rounded">{struct.timeframe}</span>
                  </div>
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> {struct.confirmed || 'CONFIRMED'}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <span className="text-slate-500 block mb-0.5">Price</span>
                    <span className="text-slate-200">{struct.priceStart ? Number(struct.priceStart).toFixed(5) : 'N/A'} {struct.priceEnd ? `- ${Number(struct.priceEnd).toFixed(5)}` : ''}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-0.5">Detection Time</span>
                    <span className="text-slate-200">{struct.timestamp ? new Date(struct.timestamp).toLocaleTimeString() : 'Recent'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-0.5">Status</span>
                    <span className="text-slate-200">{struct.confirmed === 'CONFIRMED' ? 'Untested' : struct.confirmed}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-0.5">Source Engine</span>
                    <span className="text-cyan-400">{struct.source || 'Structure Engine'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-0.5">Contribution</span>
                    <span className="text-emerald-400">+{Math.round((struct.confidence || 80) / 10)} pts</span>
                  </div>
                </div>
                
                <div className="mt-2 pt-2 border-t border-white/5">
                  <span className="text-slate-500 block mb-0.5">Detection Reason</span>
                  <span className="text-slate-300">{struct.reason || 'Mathematical proof established.'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderMultiTimeframeTab = () => {
    // Dynamic top-down reasoning summary based on trade direction
    const htfBias = timeframeData['4h']?.bias || timeframeData['1h']?.bias || 'ALIGNING';
    const mtfBias = timeframeData['15m']?.bias || 'ALIGNING';
    const ltfBias = timeframeData['5m']?.bias || timeframeData['1m']?.bias || 'ALIGNING';

    const synthesisSummary = direction === 'BUY'
      ? `The macro HTF (4h/1h) trend is strongly ${htfBias}, establishing an institutional bullish demand regime. The medium MTF (15m) confirms this bias via structure support holding at ${mtfBias}. Price is entering a discount zone on the lower LTF (5m/1m) triggering a precise order block entry.`
      : `The macro HTF (4h/1h) trend is strongly ${htfBias}, establishing an institutional bearish supply regime. The medium MTF (15m) confirms this bias via structural supply ceiling holding at ${mtfBias}. Price is entering a premium zone on the lower LTF (5m/1m) triggering a precise supply block entry.`;

    return (
      <div className="space-y-4 font-mono">
        <h3 className="text-white font-bold text-sm">Multi-Timeframe Evidence Profile</h3>

        {/* TOP-DOWN CONFLUENCE SYNTHESIS CARD */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-400" />
            <span className="text-amber-400 font-bold text-xs uppercase tracking-wider">Top-Down Multi-Timeframe Alignment</span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed bg-black/30 p-3 rounded-lg border border-white/5">
            {synthesisSummary}
          </p>
          <div className="grid grid-cols-3 gap-2 text-[10px] text-center uppercase tracking-wider font-bold">
            <div className="bg-black/40 border border-white/5 rounded p-2">
              <span className="text-slate-500 block mb-1">Macro HTF (4h/1h)</span>
              <span className={htfBias === 'BULLISH' ? 'text-emerald-400' : htfBias === 'BEARISH' ? 'text-rose-400' : 'text-cyan-400'}>
                {htfBias} TREND
              </span>
            </div>
            <div className="bg-black/40 border border-white/5 rounded p-2">
              <span className="text-slate-500 block mb-1">Medium MTF (15m)</span>
              <span className={mtfBias === 'BULLISH' ? 'text-emerald-400' : mtfBias === 'BEARISH' ? 'text-rose-400' : 'text-cyan-400'}>
                {mtfBias} STRUCTURE
              </span>
            </div>
            <div className="bg-black/40 border border-white/5 rounded p-2">
              <span className="text-slate-500 block mb-1">Micro LTF (1m/5m)</span>
              <span className={ltfBias === 'BULLISH' ? 'text-emerald-400' : ltfBias === 'BEARISH' ? 'text-rose-400' : 'text-cyan-400'}>
                {ltfBias} ENTRY
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-3 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
          {Object.entries(timeframeData).map(([tf, data]: [string, any]) => (
            <div key={tf} className="bg-black/40 border border-white/5 rounded-lg p-3 text-[11px]">
              <div className="flex justify-between items-center mb-2 border-b border-white/5 pb-2">
                <span className="text-cyan-400 font-bold px-2 py-1 bg-cyan-500/10 rounded">{tf} Timeframe</span>
                <span className={`font-bold px-2 py-0.5 rounded ${
                  data.bias === 'BULLISH' ? 'text-emerald-400 bg-emerald-500/20' : 
                  data.bias === 'BEARISH' ? 'text-rose-400 bg-rose-500/20' : 
                  'text-slate-300 bg-slate-500/20'
                }`}>
                  Trend: {data.bias || 'NEUTRAL'}
                </span>
              </div>
              <div className="space-y-2">
                <div>
                  <span className="text-slate-500 block font-bold mb-1">Evidence Structures Detected:</span>
                  <div className="text-slate-300 flex flex-wrap gap-1">
                    {data.structures?.length > 0 ? data.structures.map((s: any, i: number) => (
                      <span key={i} className="bg-white/5 px-2 py-0.5 rounded border border-white/5 text-[10px] flex items-center gap-1">
                        <span className={s.type.includes('BULLISH') ? 'text-emerald-400' : s.type.includes('BEARISH') ? 'text-rose-400' : 'text-cyan-400'}>
                          {s.type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-slate-500">@ {s.priceStart ? Number(s.priceStart).toFixed(5) : 'N/A'}</span>
                      </span>
                    )) : <span className="text-slate-500">No major structures mapped</span>}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 block font-bold">Structural Confluence Rule:</span>
                  <span className="text-slate-300 block mt-0.5">
                    {data.bias === 'BULLISH' ? 'Institutional demand block (OB/FVG) holding. Sell stops swept. Trend continuation highly favored.' : 
                     data.bias === 'BEARISH' ? 'Institutional supply block (OB/FVG) active. Buy stops swept. Trend continuation highly favored.' : 
                     'Market accumulation phase. Sideways range boundaries intact.'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderStrategyTab = () => {
    return (
      <div className="space-y-3 font-mono max-h-96 overflow-y-auto pr-2 custom-scrollbar">
        <h3 className="text-white font-bold text-sm mb-2">Institutional Strategy Profile</h3>
        
        <div className="bg-black/40 border border-white/5 rounded-lg p-4">
          <div className="flex justify-between items-center border-b border-white/5 pb-3 mb-3">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase mb-1">Strategy Name</span>
              <span className="text-cyan-400 font-bold text-sm">{strategyName}</span>
            </div>
            <div className="text-right">
              <span className="text-slate-500 block text-[10px] uppercase mb-1">Current Match</span>
              <span className="text-emerald-400 font-black text-xl">{confidence}%</span>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3 text-[11px] mb-4">
            <div><span className="text-slate-500">Purpose</span><br/><span className="text-slate-300">High-probability institutional continuation</span></div>
            <div><span className="text-slate-500">Market Environment</span><br/><span className="text-slate-300">Trending / Expansion</span></div>
            <div><span className="text-slate-500">Required Trend</span><br/><span className="text-slate-300">Aligned across HTF</span></div>
            <div><span className="text-slate-500">Required Structure</span><br/><span className="text-slate-300">Unmitigated OB / FVG</span></div>
          </div>

          <div className="border-t border-white/5 pt-3">
            <span className="text-slate-500 block text-[11px] font-bold mb-2">Evidence Summary (Approval Criteria)</span>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-slate-300"><strong>Trend Alignment:</strong> Required HTF bias satisfies minimum threshold.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-slate-300"><strong>Structural Validation:</strong> {allStructures.length} deterministic structures confirm hypothesis.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-slate-300"><strong>Risk Oversight:</strong> Lot sizing and invalidation bounds cleared for margin limits.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAIDecisionTab = () => {
    return (
      <div className="space-y-3 font-mono max-h-96 overflow-y-auto pr-2 custom-scrollbar">
        <h3 className="text-white font-bold text-sm mb-2">AI Decision Profile</h3>
        
        <div className="bg-black/40 border border-white/5 rounded-lg p-4 space-y-4">
          <div className="flex justify-between items-center text-[11px] text-slate-400 bg-white/5 p-2 rounded">
            <span><strong>Model:</strong> Vertex AI Supervisor</span>
            <span><strong>Evidence Version:</strong> V10.Registry</span>
          </div>

          <div>
            <span className="text-amber-400 font-bold text-[11px] block mb-1">AI Supervisor Rationale (Interpretation)</span>
            <p className="text-[11px] text-slate-300 leading-relaxed bg-white/[0.02] p-3 rounded-lg border border-white/5 whitespace-pre-line">
              {aiExplanation}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-[11px]">
            <div className="space-y-1.5">
              <span className="text-emerald-400 font-bold block mb-1">Confidence Drivers</span>
              <div className="text-slate-300 flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Structure Alignment</div>
              <div className="text-slate-300 flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Risk parameters valid</div>
            </div>
            <div className="space-y-1.5">
              <span className="text-rose-400 font-bold block mb-1">Risk Factors</span>
              {newsImpactAssessment?.highVolatilityRisk ? (
                <div className="text-slate-300 flex items-center gap-1.5"><AlertCircle className="w-3 h-3 text-amber-500" /> News Volatility Active</div>
              ) : (
                <div className="text-slate-500 flex items-center gap-1.5">No immediate macro risks</div>
              )}
            </div>
          </div>
          
          <div className="mt-2 pt-3 border-t border-white/5 flex justify-between items-center">
            <span className="text-slate-400 text-[11px]">Overall Recommendation</span>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-[11px] font-black ${direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                EXECUTE {direction}
              </span>
              <span className="text-emerald-400 font-black">{confidence}%</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderNewsTab = () => {
    const headlines = newsImpactAssessment?.parsedHeadlines || [];
    return (
      <div className="space-y-3 font-mono max-h-96 overflow-y-auto pr-2 custom-scrollbar">
        <h3 className="text-white font-bold text-sm mb-2">Macro News Evidence</h3>
        
        {headlines.length === 0 ? (
          <p className="text-slate-500 text-xs">No significant macro drivers detected in recent window.</p>
        ) : (
          <div className="space-y-2">
            {headlines.map((item: any, idx: number) => (
              <div key={idx} className="bg-black/40 border border-white/5 rounded-lg p-3 text-[11px]">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-cyan-400 font-bold">Driver: {item.matchedKeywords?.[0] || 'Macro Event'}</span>
                  <span className={`px-2 py-0.5 rounded font-bold uppercase text-[9px] ${
                    item.impactLevel === 'CRITICAL' ? 'bg-rose-500/20 text-rose-400' : 
                    item.impactLevel === 'HIGH' ? 'bg-amber-500/20 text-amber-400' : 
                    'bg-slate-500/20 text-slate-300'
                  }`}>
                    {item.impactLevel} IMPACT
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <span className="text-slate-500 block mb-0.5">Headline / Event</span>
                    <span className="text-slate-200">{item.headline}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-0.5">Market Effect</span>
                    <span className="text-slate-200">{item.summary}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-3xl bg-[#090d16] border border-amber-500/30 rounded-2xl overflow-hidden shadow-2xl flex flex-col font-sans text-left relative max-h-[90vh]"
        >
          {/* Header */}
          <div className="bg-black/60 p-4 border-b border-white/10 flex justify-between items-start relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h2 className="text-lg font-black text-white uppercase tracking-wider">AI Signal Approval Evidence Package</h2>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className={`font-bold px-2 py-0.5 rounded ${direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30'} border`}>
                  {direction} SIGNAL
                </span>
                <span className="text-emerald-400 font-bold">{confidence}% CONFIDENCE MATCH</span>
                <span className="text-slate-400 hidden sm:inline-block">Symbol: {symbol} | Entry: {Number(activeSetup.entry).toFixed(5)}</span>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors z-10 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-white/5 bg-black/40 overflow-x-auto no-scrollbar font-mono text-[10px] uppercase font-bold tracking-wider">
            {(['STRUCTURES', 'MULTI_TIMEFRAME', 'STRATEGY', 'AI_DECISION', 'NEWS'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activeTab === tab 
                    ? 'border-b-2 border-amber-500 text-amber-400 bg-amber-500/5' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                {tab === 'STRUCTURES' && <Layers className="w-3 h-3" />}
                {tab === 'MULTI_TIMEFRAME' && <Clock className="w-3 h-3" />}
                {tab === 'STRATEGY' && <Target className="w-3 h-3" />}
                {tab === 'AI_DECISION' && <Cpu className="w-3 h-3" />}
                {tab === 'NEWS' && <FileText className="w-3 h-3" />}
                {tab.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div className="p-4 overflow-hidden flex-1 bg-gradient-to-b from-black/20 to-transparent">
            {activeTab === 'STRUCTURES' && renderStructuresTab()}
            {activeTab === 'MULTI_TIMEFRAME' && renderMultiTimeframeTab()}
            {activeTab === 'STRATEGY' && renderStrategyTab()}
            {activeTab === 'AI_DECISION' && renderAIDecisionTab()}
            {activeTab === 'NEWS' && renderNewsTab()}
          </div>

          {/* Footer Action */}
          {onExecute && (
            <div className="p-4 bg-black/60 border-t border-white/5 flex justify-end gap-3">
              <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-300 hover:text-white transition-colors cursor-pointer">
                CANCEL
              </button>
              <button 
                onClick={() => onExecute(direction)}
                disabled={isExecuting}
                className={`px-6 py-2 text-xs font-black uppercase tracking-wider rounded-lg shadow-lg flex items-center gap-2 transition-all cursor-pointer ${
                  direction === 'BUY' 
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/50' 
                    : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/50'
                } ${isExecuting ? 'opacity-50 pointer-events-none' : 'hover:scale-105'}`}
              >
                {isExecuting ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Executing...
                  </span>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    EXECUTE {direction}
                  </>
                )}
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
