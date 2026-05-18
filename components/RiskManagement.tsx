
import React from 'react';
import { Shield, TrendingUp, DollarSign, Activity, Percent, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useStore } from '../src/store';

const RiskManagement: React.FC = () => {
  const strategySettings = useStore(state => state.strategySettings);
  const setStrategySettings = useStore(state => state.setStrategySettings);
  const { riskConfig, lotSize, maxTrades } = strategySettings;

  if (!riskConfig) return null;

  const handleInputChange = (field: string, value: string | boolean) => {
    let parsedValue: any = value;
    if (typeof value === 'string' && value !== '') {
      // Only parse as float if it's not the currency field
      if (field !== 'currency') {
        parsedValue = parseFloat(value);
        if (isNaN(parsedValue)) return;
      }
    } else if (value === '') {
      parsedValue = 0;
    }

    setStrategySettings({
      riskConfig: {
        [field]: parsedValue
      }
    });
  };

  const riskAmount = (riskConfig.fundedAmount * riskConfig.riskPercentage) / 100;
  const currencySymbol = riskConfig.currency === 'ZAR' ? 'R' : '$';

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="glowing-panel p-8 rounded-[40px] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-6">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner shrink-0 accent-glow bg-black/40 border border-white/5" style={{ color: 'var(--accent-color)' }}>
            <Shield className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight uppercase">Risk Protocol</h2>
            <p className="text-[10px] text-slate-500 font-mono tracking-widest uppercase mt-1">Capital Protection Engine</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 p-1 bg-black/40 rounded-xl border border-white/5 self-end sm:self-auto">
          {['USD', 'ZAR'].map((curr) => (
            <button
              key={curr}
              onClick={() => handleInputChange('currency', curr)}
              className={`px-4 py-2 rounded-lg text-[10px] font-mono font-black transition-all ${
                riskConfig.currency === curr 
                  ? 'text-white border border-white/10' 
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              style={riskConfig.currency === curr ? { backgroundColor: 'var(--accent-color)' } : {}}
            >
              {curr}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main calculation card */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glowing-panel p-8 rounded-[40px] space-y-8">
            <div className="space-y-4">
              <h3 className="text-xs font-black tracking-widest uppercase" style={{ color: 'var(--accent-color)' }}>Core Strategy Execution (Strategy Mode Only)</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black tracking-widest uppercase text-slate-500">Target Symbol</label>
                  <input 
                    type="text" 
                    value={strategySettings.symbol}
                    onChange={e => setStrategySettings({ symbol: e.target.value })}
                    placeholder="XAUUSDm"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-white transition-colors"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-[10px] font-black tracking-widest uppercase text-slate-500">Lot Size</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={strategySettings.lotSize}
                    onChange={e => setStrategySettings({ lotSize: parseFloat(e.target.value) })}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-white transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black tracking-widest uppercase text-slate-500">Max Trades</label>
                  <input 
                    type="number" 
                    value={strategySettings.maxTrades}
                    onChange={e => setStrategySettings({ maxTrades: parseInt(e.target.value) })}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-white transition-colors"
                  />
                </div>
              </div>

              <p className="text-[9px] text-slate-500 italic uppercase font-bold tracking-tight">These settings apply ONLY when Strategy Mode is active. Cloud EA uses its own internal parameters.</p>
            </div>

            <div className="h-px bg-white/5"></div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                  <DollarSign className="w-3 h-3" /> Funded Capital ({riskConfig.currency})
                </label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={riskConfig.fundedAmount}
                    onChange={(e) => handleInputChange('fundedAmount', e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white font-mono font-bold text-xl outline-none focus:border-white transition-all"
                  />
                  <span className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-600 font-mono text-sm font-bold">{riskConfig.currency}</span>
                </div>
                <p className="text-[9px] text-slate-600 font-medium uppercase tracking-tight ml-1">Total money assigned to the strategy.</p>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center ml-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Percent className="w-3 h-3" /> Risk Profile
                  </label>
                  <div className="flex gap-2">
                    {[
                      { label: 'CONS', val: 0.5 },
                      { label: 'MOD', val: 1.0 },
                      { label: 'AGG', val: 2.0 }
                    ].map(profile => (
                      <button
                        key={profile.label}
                        onClick={() => handleInputChange('riskPercentage', profile.val.toString())}
                        className={`text-[8px] font-mono px-2 py-1 rounded border transition-all ${
                          riskConfig.riskPercentage === profile.val 
                            ? 'text-white' 
                            : 'bg-white/5 border-white/10 text-slate-500 hover:text-slate-300'
                        }`}
                        style={riskConfig.riskPercentage === profile.val ? { backgroundColor: 'var(--accent-color)' } : {}}
                      >
                        {profile.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="relative">
                  <input 
                    type="number" 
                    step="0.1"
                    value={riskConfig.riskPercentage}
                    onChange={(e) => handleInputChange('riskPercentage', e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white font-mono font-bold text-xl outline-none focus:border-white transition-all"
                  />
                  <span className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-600 font-mono text-sm font-bold">%</span>
                </div>
                <p className="text-[9px] text-slate-600 font-medium uppercase tracking-tight ml-1">Percentage of capital at risk per setup.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                  <TrendingUp className="w-3 h-3" /> Average Stop Loss
                </label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={riskConfig.stopLossPips}
                    onChange={(e) => handleInputChange('stopLossPips', e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white font-mono font-bold text-xl outline-none focus:border-white transition-all"
                  />
                  <span className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-600 font-mono text-sm font-bold">PIPS</span>
                </div>
                <p className="text-[9px] text-slate-600 font-medium uppercase tracking-tight ml-1">Used to calibrate volume (XAUUSD optimization).</p>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3" /> Execution Lock
                </label>
                <div className="flex items-center justify-between bg-black/40 border border-white/10 rounded-2xl px-6 py-[14px]">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Manual Lot Size</span>
                  <button 
                    onClick={() => handleInputChange('usePreferredLotSize', !riskConfig.usePreferredLotSize)}
                    className="w-12 h-6 rounded-full transition-all relative"
                    style={{ backgroundColor: riskConfig.usePreferredLotSize ? 'var(--accent-color)' : '#1e293b' }}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${riskConfig.usePreferredLotSize ? 'left-7 shadow-lg' : 'left-1'}`}></div>
                  </button>
                </div>
                {riskConfig.usePreferredLotSize && (
                  <input 
                    type="number" 
                    step="0.01"
                    placeholder="Enter Preferred Lot"
                    value={riskConfig.preferredLotSize}
                    onChange={(e) => handleInputChange('preferredLotSize', e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-3 text-white font-mono font-bold text-sm outline-none animate-in slide-in-from-top-2 duration-300"
                    style={{ borderColor: 'var(--accent-color-rgb)', color: 'var(--accent-color)' }}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="glowing-panel p-8 rounded-[40px] flex items-start gap-6 border-white/5">
            <div className="p-3 bg-black/40 rounded-2xl border border-white/10 mt-1 accent-glow" style={{ color: 'var(--accent-color)' }}>
              <Info className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-black text-white uppercase tracking-tight leading-none">Security Note</h4>
              <p className="text-[10px] text-slate-500 font-medium leading-relaxed uppercase tracking-wider">
                This engine uses a fixed pip value assumption optimized for Gold (XAUUSD) and major pairs. The calculated lot size is an approximation based on your funded capital and risk tolerance. Always verify the risk amount in USD before activating the execution cycle.
              </p>
            </div>
          </div>
        </div>

        {/* Results Sidebar */}
        <div className="space-y-6">
          <div className="glowing-panel p-8 rounded-[40px] shadow-2xl space-y-8 bg-black/80">
            <div className="text-center space-y-1">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: 'var(--accent-color)' }}>Projection Summary</h3>
              <p className="text-[9px] text-slate-600 font-mono uppercase tracking-widest">{strategySettings.symbol} Execution</p>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block text-center">Risk Amount ({riskConfig.currency})</span>
                <div className="text-3xl font-mono font-black text-white text-center tabular-nums">
                  {currencySymbol}{riskAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, riskConfig.riskPercentage * 10)}%`, backgroundColor: 'var(--accent-color)' }}></div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="bg-white/5 border border-white/5 p-6 rounded-3xl space-y-1 text-center group hover:border-white/20 transition-all">
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Optimized Lot Size</span>
                  <div className="text-2xl font-mono font-black tabular-nums" style={{ color: 'var(--accent-color)' }}>
                    {lotSize.toFixed(2)}
                  </div>
                </div>

                <div className="bg-white/5 border border-white/5 p-6 rounded-3xl space-y-1 text-center group hover:border-white/20 transition-all">
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Max Concurrent Trades</span>
                  <div className="text-2xl font-mono font-black text-blue-400 tabular-nums">
                    {maxTrades}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-white/5">
              <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-2xl flex items-center gap-4">
                <AlertTriangle className="text-amber-500 w-4 h-4 shrink-0" />
                <span className="text-[8px] font-bold text-amber-200/50 uppercase tracking-widest leading-loose">
                  High volatility detected on {strategySettings.symbol}. Automatic drawdown protection enabled.
                </span>
              </div>
            </div>
          </div>

          <div className="glowing-panel p-6 rounded-[30px] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center border border-white/10 bg-black/40 accent-glow" style={{ color: 'var(--accent-color)' }}>
                <Activity className="w-4 h-4" />
              </div>
              <span className="text-[9px] font-black text-white uppercase tracking-widest leading-none">Telemetry Status</span>
            </div>
            <span className="text-[9px] font-mono font-bold text-emerald-500 uppercase tracking-widest">Optimal</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RiskManagement;
