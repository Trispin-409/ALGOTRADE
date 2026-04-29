import React, { useState } from 'react';
import { useStore } from '../src/store';
import { Save, Upload, X } from 'lucide-react';

const ChartSettings: React.FC = () => {
  const chartSettings = useStore(state => state.chartSettings);
  const setChartSettings = useStore(state => state.setChartSettings);

  const strategySettings = useStore(state => state.strategySettings);
  const setStrategySettings = useStore(state => state.setStrategySettings);

  const [localSettings, setLocalSettings] = useState(chartSettings);
  const [localStrategy, setLocalStrategy] = useState(strategySettings);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = () => {
    setIsSaving(true);
    setChartSettings(localSettings);
    setStrategySettings(localStrategy);
    // Simulate save duration for better UX
    setTimeout(() => setIsSaving(false), 500);
  };

  return (
    <div className="p-4 sm:p-8 pb-24 lg:pb-8 max-w-2xl mx-auto space-y-6 w-full custom-scrollbar overflow-y-auto max-h-full">
      <div>
        <h2 className="text-2xl font-black text-white tracking-tighter">Chart Settings</h2>
        <p className="text-sm text-slate-400 mt-1">Customize the appearance of your trading charts.</p>
      </div>

      <div className="bg-slate-900 border border-white/5 rounded-2xl p-4 sm:p-6 space-y-6">
        <h3 className="text-xs font-black tracking-widest uppercase text-indigo-500">Core Strategy Execution (Strategy Mode Only)</h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-black tracking-widest uppercase text-slate-500">Target Symbol</label>
            <input 
              type="text" 
              value={localStrategy.symbol}
              onChange={e => setLocalStrategy(s => ({ ...s, symbol: e.target.value }))}
              placeholder="XAUUSDm"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-indigo-500"
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-xs font-black tracking-widest uppercase text-slate-500">Lot Size</label>
            <input 
              type="number" 
              step="0.01"
              value={localStrategy.lotSize}
              onChange={e => setLocalStrategy(s => ({ ...s, lotSize: parseFloat(e.target.value) }))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black tracking-widest uppercase text-slate-500">Max Trades</label>
            <input 
              type="number" 
              value={localStrategy.maxTrades}
              onChange={e => setLocalStrategy(s => ({ ...s, maxTrades: parseInt(e.target.value) }))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <p className="text-[10px] text-slate-500 italic uppercase font-bold tracking-tight">These settings apply ONLY when Strategy Mode is active. Cloud EA uses its own internal parameters.</p>
      </div>

      <div className="bg-slate-900 border border-white/5 rounded-2xl p-4 sm:p-6 space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-black tracking-widest uppercase text-slate-500">Bullish Color</label>
            <div className="flex items-center gap-4">
              <input 
                type="color" 
                value={localSettings.upColor} 
                onChange={e => setLocalSettings(s => ({ ...s, upColor: e.target.value }))} 
                className="w-12 h-12 rounded-lg cursor-pointer bg-transparent border-0 p-0" 
              />
              <span className="text-sm font-mono text-slate-300 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">{localSettings.upColor}</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black tracking-widest uppercase text-slate-500">Bearish Color</label>
            <div className="flex items-center gap-4">
              <input 
                type="color" 
                value={localSettings.downColor} 
                onChange={e => setLocalSettings(s => ({ ...s, downColor: e.target.value }))} 
                className="w-12 h-12 rounded-lg cursor-pointer bg-transparent border-0 p-0" 
              />
              <span className="text-sm font-mono text-slate-300 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">{localSettings.downColor}</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black tracking-widest uppercase text-slate-500">Background Image</label>
            <div className="flex flex-col gap-3">
              {localSettings.bgImageUrl && (
                <div className="relative w-full h-32 rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
                  <img src={localSettings.bgImageUrl} alt="Background Preview" className="w-full h-full object-cover opacity-50" />
                  <button 
                     onClick={() => setLocalSettings(s => ({ ...s, bgImageUrl: '' }))}
                     className="absolute top-2 right-2 bg-rose-500/80 hover:bg-rose-500 p-1.5 rounded-lg text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              {!localSettings.bgImageUrl?.startsWith('data:image') && (
                <input 
                  type="text" 
                  value={localSettings.bgImageUrl || ''}
                  onChange={e => setLocalSettings(s => ({ ...s, bgImageUrl: e.target.value }))}
                  placeholder="Image URL (https://...)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-600"
                />
              )}
              <div className="flex flex-col gap-2 p-4 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                <label className="text-sm font-medium text-indigo-400 mb-1 flex items-center gap-2">
                  <Upload className="w-4 h-4" /> Upload from Device
                </label>
                <input 
                  type="file"
                  accept="image/*"
                    onChange={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const file = e.target.files?.[0];
                    if (file) {
                      e.target.value = '';
                      try {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          const img = new Image();
                          img.onload = () => {
                            try {
                              const canvas = document.createElement('canvas');
                              let width = img.width;
                              let height = img.height;
                              const MAX_SIZE = 800; // slightly higher quality

                              if (width > height) {
                                if (width > MAX_SIZE) {
                                  height *= MAX_SIZE / width;
                                  width = MAX_SIZE;
                                }
                              } else {
                                if (height > MAX_SIZE) {
                                  width *= MAX_SIZE / height;
                                  height = MAX_SIZE;
                                }
                              }

                              canvas.width = width;
                              canvas.height = height;
                              const ctx = canvas.getContext('2d');
                              if (ctx) {
                                 ctx.drawImage(img, 0, 0, width, height);
                                 // Compressing aggressively for mobile localStorage compatibility
                                 const dataUrl = canvas.toDataURL('image/jpeg', 0.4);
                                 setLocalSettings(s => ({ ...s, bgImageUrl: dataUrl }));
                              }
                            } catch (err) {
                              console.error("Canvas draw error", err);
                              alert("Error parsing image. Please try a different dimension/format.");
                            }
                          };
                          img.onerror = () => {
                             alert("The uploaded file could not be read as an image.");
                          };
                          img.src = reader.result as string;
                        };
                        reader.readAsDataURL(file);
                      } catch (err) {
                        alert("Error reading file.");
                      }
                    }
                  }}
                  className="w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-slate-800 flex justify-end">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isSaving ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChartSettings;
