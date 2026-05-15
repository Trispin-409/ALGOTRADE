
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white/5 p-8 rounded-[40px] border border-white/5 backdrop-blur-md gap-4">
        <div className="flex items-center gap-6">
          <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20 shadow-inner shrink-0">
            <Shield className="text-emerald-400 w-7 h-7" />
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
                  ? 'bg-indigo-600 text-white border border-indigo-400/30' 
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {curr}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main calculation card */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900/40 border border-white/5 p-8 rounded-[40px] backdrop-blur-md space-y-8">
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
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white font-mono font-bold text-xl outline-none focus:border-indigo-500 transition-all font-mono"
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
                            ? 'bg-indigo-500 border-indigo-400 text-white' 
                            : 'bg-white/5 border-white/10 text-slate-500 hover:text-slate-300'
                        }`}
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
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white font-mono font-bold text-xl outline-none focus:border-indigo-500 transition-all"
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
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white font-mono font-bold text-xl outline-none focus:border-indigo-500 transition-all"
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
                    className={`w-12 h-6 rounded-full transition-all relative ${riskConfig.usePreferredLotSize ? 'bg-indigo-600' : 'bg-slate-800'}`}
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
                    className="w-full bg-black/40 border border-indigo-500/30 rounded-2xl px-6 py-3 text-indigo-400 font-mono font-bold text-sm outline-none animate-in slide-in-from-top-2 duration-300"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="bg-indigo-600/5 border border-indigo-500/10 p-8 rounded-[40px] flex items-start gap-6">
            <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 mt-1">
              <Info className="text-indigo-400 w-5 h-5" />
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
          <div className="bg-black/60 border border-white/10 p-8 rounded-[40px] shadow-2xl space-y-8">
            <div className="text-center space-y-1">
              <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">Projection Summary</h3>
              <p className="text-[9px] text-slate-600 font-mono uppercase tracking-widest">{strategySettings.symbol} Execution</p>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block text-center">Risk Amount ({riskConfig.currency})</span>
                <div className="text-3xl font-mono font-black text-white text-center tabular-nums">
                  {currencySymbol}{riskAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, riskConfig.riskPercentage * 10)}%` }}></div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="bg-white/5 border border-white/5 p-6 rounded-3xl space-y-1 text-center group hover:border-emerald-500/30 transition-all">
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Optimized Lot Size</span>
                  <div className="text-2xl font-mono font-black text-emerald-400">
                    {lotSize.toFixed(2)}
                  </div>
                </div>

                <div className="bg-white/5 border border-white/5 p-6 rounded-3xl space-y-1 text-center group hover:border-blue-500/30 transition-all">
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Max Concurrent Trades</span>
                  <div className="text-2xl font-mono font-black text-blue-400">
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

          <div className="bg-slate-900/40 border border-white/5 p-6 rounded-[30px] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-indigo-500/10 rounded-lg flex items-center justify-center border border-indigo-500/20">
                <Activity className="text-indigo-400 w-4 h-4" />
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
