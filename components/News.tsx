import React, { useState, useEffect, useMemo } from 'react';
import { Newspaper, Loader2, ExternalLink, Globe, TrendingUp, TrendingDown, Minus, Activity, ArrowRight, Server, Shield, Search, Zap, Crosshair, BarChart2 } from 'lucide-react';
import { useStore } from '../src/store';

interface NewsProps {
  activeSymbol: string;
  onSymbolChange: (symbol: string) => void;
  availableBrokerSymbols?: string[];
  selectedAccountId?: string;
  selectedTimeframe?: string;
}

const FRED_SERIES = [
  { id: 'FEDFUNDS', name: 'Federal Funds Rate', suffix: '%' },
  { id: 'CPIAUCSL', name: 'US Inflation CPI', suffix: '' },
  { id: 'GS10', name: '10Y Treasury', suffix: '%' },
  { id: 'UNRATE', name: 'Unemployment', suffix: '%' },
  { id: 'GDP', name: 'GDP Growth', suffix: 'B' }
];

const SYMBOL_MACRO_CONFIG: Record<string, {name: string, focus: string, weights: Record<string, number>}> = {
  'EURUSD': { name: 'Euro / US Dollar', focus: 'US Macro Strength vs Eurozone Stability', weights: { FEDFUNDS: -1, CPIAUCSL: -1, GS10: -1, UNRATE: 1, GDP: -1 } },
  'GBPUSD': { name: 'British Pound / US Dollar', focus: 'US Macro Yields vs UK Market Dynamics', weights: { FEDFUNDS: -1, CPIAUCSL: -1, GS10: -1, UNRATE: 1, GDP: -1 } },
  'USDJPY': { name: 'US Dollar / Japanese Yen', focus: 'Fed Rate Track vs Bank of Japan Environment', weights: { FEDFUNDS: 1, CPIAUCSL: 1, GS10: 1.5, UNRATE: -1, GDP: 1 } },
  'AUDUSD': { name: 'Australian Dollar / US Dollar', focus: 'Global Growth & US Dollar Liquidity', weights: { FEDFUNDS: -1, CPIAUCSL: -1, GS10: -1, UNRATE: 1, GDP: -1 } },
  'NZDUSD': { name: 'New Zealand Dollar / US Dollar', focus: 'Global Growth & US Dollar Liquidity', weights: { FEDFUNDS: -1, CPIAUCSL: -1, GS10: -1, UNRATE: 1, GDP: -1 } },
  'USDCAD': { name: 'US Dollar / Canadian Dollar', focus: 'US Economic Strength vs Commodity (Oil)', weights: { FEDFUNDS: 1, CPIAUCSL: 1, GS10: 1, UNRATE: -1, GDP: 1 } },
  'USDCHF': { name: 'US Dollar / Swiss Franc', focus: 'US Yield Advantage vs Safe Haven Flows', weights: { FEDFUNDS: 1, CPIAUCSL: 1, GS10: 1, UNRATE: -1, GDP: 1 } },
  'XAUUSD': { name: 'Gold / US Dollar', focus: 'Real Yields, Inflation Hedge & USD Strength', weights: { FEDFUNDS: -1, CPIAUCSL: 1.5, GS10: -1.5, UNRATE: 1, GDP: -1 } },
  'BTCUSD': { name: 'Bitcoin / US Dollar', focus: 'Global Liquidity, Risk-On Environment', weights: { FEDFUNDS: -1.5, CPIAUCSL: 1, GS10: -1.5, UNRATE: 1, GDP: 1 } }
};

const AVAILABLE_SYMBOLS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'XAUUSD', 'BTCUSD'];

export default function News({ activeSymbol, onSymbolChange, availableBrokerSymbols = [] }: NewsProps) {
  const [news, setNews] = useState<any[]>([]);
  const [loadingNews, setLoadingNews] = useState(true);
  const [errorNews, setErrorNews] = useState<string | null>(null);
  
  const [fredData, setFredData] = useState<Record<string, {current: number, previous: number}>>({});
  const [loadingFred, setLoadingFred] = useState(true);
  
  const [currencyFilter, setCurrencyFilter] = useState('ALL');

  const candles = useStore(state => state.candles) || [];
  
  const displaySymbols = availableBrokerSymbols.length > 0 ? availableBrokerSymbols : AVAILABLE_SYMBOLS;

  const getSymbolConfig = (sym: string) => {
     if (!sym) return SYMBOL_MACRO_CONFIG['EURUSD'];
     const clean = sym.toUpperCase().replace(/[^A-Z]/g, '');
     for (const key in SYMBOL_MACRO_CONFIG) {
       if (clean.includes(key)) return SYMBOL_MACRO_CONFIG[key];
     }
     if (clean.endsWith('USD')) return { name: sym, focus: 'US Macro Yields vs Counterparty', weights: { FEDFUNDS: -1, CPIAUCSL: -1, GS10: -1, UNRATE: 1, GDP: -1 } };
     if (clean.startsWith('USD')) return { name: sym, focus: 'Fed Rate Track vs Counterparty', weights: { FEDFUNDS: 1, CPIAUCSL: 1, GS10: 1, UNRATE: -1, GDP: 1 } };
     return SYMBOL_MACRO_CONFIG['EURUSD'];
  }

  const config = getSymbolConfig(activeSymbol);

  // Fetch FRED data once
  useEffect(() => {
    let mounted = true;
    const fetchFred = async () => {
      try {
        setLoadingFred(true);
        const results: Record<string, {current: number, previous: number}> = {};
        await Promise.all(FRED_SERIES.map(async (s) => {
          try {
            const res = await fetch(`/api/fred?series_id=${s.id}`);
            const data = await res.json();
            if (data && data.observations && data.observations.length >= 2) {
              const current = parseFloat(data.observations[0].value);
              const prev = parseFloat(data.observations[1].value);
              results[s.id] = { current, previous: prev };
            }
          } catch(e) { console.error(`FRED fetch failed for ${s.id}`, e); }
        }));
        if (mounted) setFredData(results);
      } catch(e) {
        console.error("Master FRED fail", e);
      } finally {
        if (mounted) setLoadingFred(false);
      }
    };
    fetchFred();
    return () => { mounted = false; };
  }, []);

  // Fetch News data when activeSymbol changes category
  useEffect(() => {
    let mounted = true;
    const category = activeSymbol.includes('BTC') || activeSymbol.includes('CRYPTO') ? 'crypto' : 'forex';
    
    const fetchNews = async () => {
      try {
        setLoadingNews(true);
        const res = await fetch(`https://finnhub.io/api/v1/news?category=${category}&token=d82220hr01qrojfdmpn0d82220hr01qrojfdmpng`);
        if (!res.ok) {
           const res2 = await fetch(`https://finnhub.io/api/v1/news?category=${category}&token=d82220hr01qrojfdmpn`);
           if (!res2.ok) throw new Error('Failed to fetch news');
           const data = await res2.json();
           if (mounted) setNews(data);
        } else {
           const data = await res.json();
           if (mounted) setNews(data);
        }
      } catch (err: any) {
        if (mounted) setErrorNews(err.message || 'An error occurred fetching news');
      } finally {
        if (mounted) setLoadingNews(false);
      }
    };

    fetchNews();
    return () => { mounted = false; };
  }, [activeSymbol]);

  useEffect(() => {
    // If the active symbol is not in our list, pick the first one
    if (activeSymbol && !displaySymbols.includes(activeSymbol) && displaySymbols.length > 0) {
        onSymbolChange(displaySymbols[0]);
    }
  }, [activeSymbol, displaySymbols, onSymbolChange]);

  const filteredNews = useMemo(() => {
    const symbolBase = activeSymbol.substring(0,3);
    const symbolQuote = activeSymbol.substring(3,6);
    
    return news.filter(n => {
      if (currencyFilter === 'ALL') {
          // Just filter by the active symbol's parts
          const text = ((n.headline || '') + ' ' + (n.summary || '')).toUpperCase();
          if (activeSymbol === 'BTCUSD') return text.includes('BTC') || text.includes('BITCOIN') || text.includes('CRYPTO');
          if (activeSymbol === 'XAUUSD') return text.includes('GOLD') || text.includes('XAU');
          return text.includes(symbolBase) || text.includes(symbolQuote) || text.includes('USD') || text.includes('FED');
      }
      return (n.headline || '').toUpperCase().includes(currencyFilter) || 
             (n.summary || '').toUpperCase().includes(currencyFilter)
    });
  }, [news, currencyFilter, activeSymbol]);

  const macroAnalysis = useMemo(() => {
    let usdScore = 0; 
    let evaluated = 0;
    
    FRED_SERIES.forEach(s => {
      const data = fredData[s.id];
      const weight = config.weights[s.id] || 0;
      if (data && weight !== 0) {
        evaluated += Math.abs(weight);
        const isUp = data.current > data.previous;
        const isDown = data.current < data.previous;
        
        if (isUp) {
          usdScore += weight;
        } else if (isDown) {
          usdScore -= weight;
        }
      }
    });

    const maxPoss = evaluated > 0 ? evaluated : 5;
    const strengthPercent = evaluated > 0 ? Math.round(((usdScore + maxPoss) / (maxPoss * 2)) * 100) : 50;
    
    let biasStr = 'NEUTRAL';
    if (usdScore >= (maxPoss * 0.3)) biasStr = 'BULLISH';
    if (usdScore <= -(maxPoss * 0.3)) biasStr = 'BEARISH';

    return { usdScore, evaluated, strengthPercent, biasStr };
  }, [fredData, activeSymbol, config]);

  const technicalTrend = useMemo(() => {
    if (!candles || candles.length < 10) return { trend: 'NEUTRAL', diff: 0, loading: true };
    const currentPrice = candles[candles.length - 1].close;
    const oldPrice = candles[Math.max(0, candles.length - 20)].close;
    const diff = currentPrice - oldPrice;
    
    let baseTrend = 'NEUTRAL';
    if (diff > 0) baseTrend = 'BULLISH';
    if (diff < 0) baseTrend = 'BEARISH';
    
    return { trend: baseTrend, diff, loading: false };
  }, [candles]);

  const tradeBias = useMemo(() => {
    let conf = 50;
    let signal = 'NEUTRAL';
    
    if (!activeSymbol || activeSymbol === 'No Active Asset') return { signal, conf };
    if (technicalTrend.loading) return { signal: 'ANALYZING...', conf: 0, loading: true };
    
    const { strengthPercent, biasStr } = macroAnalysis;
    const techBullish = technicalTrend.trend === 'BULLISH';
    const techBearish = technicalTrend.trend === 'BEARISH';

    const macroExpectsPairUp = biasStr === 'BULLISH';
    const macroExpectsPairDown = biasStr === 'BEARISH';

    if (macroExpectsPairUp && techBullish) {
      signal = 'BUY';
      conf = 92;
    } else if (macroExpectsPairDown && techBearish) {
      signal = 'SELL';
      conf = 92;
    } else if ((macroExpectsPairUp && techBearish) || (macroExpectsPairDown && techBullish)) {
      signal = 'NEUTRAL';
      conf = 35; 
    } else if (macroExpectsPairUp || macroExpectsPairDown) {
      signal = macroExpectsPairUp ? 'BUY' : 'SELL';
      conf = 65;
    } else if (techBullish || techBearish) {
      signal = techBullish ? 'BUY' : 'SELL';
      conf = 68;
    }

    return { signal, conf };
  }, [activeSymbol, macroAnalysis, technicalTrend]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/20 rounded-xl border border-indigo-500/20">
            <Globe className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white tracking-tight uppercase">Macro Intelligence</h2>
            <p className="text-xs text-slate-400 font-mono">FUNDAMENTALS & ORDER BLOCKS</p>
          </div>
        </div>
        
        {/* SYMBOL SELECTOR */}
        <div className="relative">
          <select 
            value={displaySymbols.includes(activeSymbol) ? activeSymbol : (displaySymbols[0] || 'EURUSD')} 
            onChange={(e) => onSymbolChange(e.target.value)}
            className="appearance-none bg-slate-900 border border-white/10 text-white font-mono font-bold uppercase tracking-widest text-sm rounded-lg px-4 py-3 pr-10 focus:outline-none focus:border-indigo-500/50 shadow-lg"
          >
            {displaySymbols.map(sym => (
              <option key={sym} value={sym}>{sym}</option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
             <Activity className="w-4 h-4" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: MACRO AND BIAS */}
        <div className="xl:col-span-1 space-y-6">
            
          {/* SECTION 5: TRADE BIAS PANEL */}
          <div className="bg-black/40 border border-white/5 rounded-xl p-5 shadow-lg backdrop-blur-md relative overflow-hidden">
            <div className="absolute -right-10 -top-10 text-white/5 pointer-events-none">
                <Crosshair className="w-40 h-40" />
            </div>
            <h3 className="text-[10px] font-mono font-black text-slate-500 uppercase tracking-widest mb-4">Alignment Matrix</h3>
            
            <div className="flex flex-col items-center justify-center p-6 bg-slate-900/50 rounded-lg border border-white/5 mb-4 relative z-10">
                 <p className="text-sm font-bold text-slate-400 mb-2 tracking-widest uppercase">{activeSymbol}</p>
                <div className={`text-4xl font-black uppercase tracking-tighter ${tradeBias.signal === 'BUY' ? 'text-emerald-400' : tradeBias.signal === 'SELL' ? 'text-rose-400' : 'text-slate-400'}`}>
                    {tradeBias.signal}
                </div>
                <div className="flex items-center justify-center gap-2 mt-4 w-full">
                    <div className="flex-1 bg-black/60 h-2.5 rounded-full overflow-hidden border border-white/5">
                        <div 
                            className={`h-full rounded-full transition-all duration-1000 ${tradeBias.signal === 'BUY' ? 'bg-emerald-500' : tradeBias.signal === 'SELL' ? 'bg-rose-500' : 'bg-slate-500'}`}
                            style={{ width: `${tradeBias.conf}%` }}
                        />
                    </div>
                    <span className="text-xs font-mono font-black text-white">{tradeBias.conf}%</span>
                </div>
                <p className="text-[9px] font-mono text-slate-500 uppercase mt-2 text-center leading-tight">
                    Technical/Macro Alignment Score
                </p>
            </div>

            {/* SECTION 4: METAAPI TECHNICAL CONFIRMATION */}
            <div className="space-y-3 relative z-10">
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Asset Tech Trend</span>
                    <div className="flex items-center gap-2">
                        {technicalTrend.trend === 'BULLISH' ? <TrendingUp className="w-3 h-3 text-emerald-400" /> : technicalTrend.trend === 'BEARISH' ? <TrendingDown className="w-3 h-3 text-rose-400" /> : <Minus className="w-3 h-3 text-slate-400" />}
                        <span className={`text-[10px] font-mono font-black uppercase ${technicalTrend.trend === 'BULLISH' ? 'text-emerald-400' : technicalTrend.trend === 'BEARISH' ? 'text-rose-400' : 'text-slate-400'}`}>
                            {technicalTrend.trend}
                        </span>
                    </div>
                </div>
                 <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">{activeSymbol} Macro Bias</span>
                    <div className="flex items-center gap-2">
                        {macroAnalysis.biasStr === 'BULLISH' ? <TrendingUp className="w-3 h-3 text-emerald-400" /> : macroAnalysis.biasStr === 'BEARISH' ? <TrendingDown className="w-3 h-3 text-rose-400" /> : <Minus className="w-3 h-3 text-slate-400" />}
                        <span className={`text-[10px] font-mono font-black uppercase ${macroAnalysis.biasStr === 'BULLISH' ? 'text-emerald-400' : macroAnalysis.biasStr === 'BEARISH' ? 'text-rose-400' : 'text-slate-400'}`}>
                            {macroAnalysis.biasStr}
                        </span>
                    </div>
                </div>
            </div>
          </div>

          {/* SECTION 3: CURRENCY STRENGTH SUMMARY */}
          <div className="bg-black/40 border border-white/5 rounded-xl p-5 shadow-lg backdrop-blur-md">
            <h3 className="text-[10px] font-mono font-black text-slate-500 uppercase tracking-widest mb-4">Sentiment Divergence</h3>
            
            <div className="space-y-4">
              <div>
                 <div className="flex justify-between text-[10px] font-mono uppercase mb-1.5">
                    <span className="text-white">{activeSymbol} Setup</span>
                    <span className={macroAnalysis.strengthPercent >= 50 ? 'text-emerald-400' : 'text-rose-400'}>{macroAnalysis.strengthPercent}%</span>
                 </div>
                 <div className="w-full bg-slate-900/80 h-2 rounded-full overflow-hidden border border-white/5 relative">
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20 z-10" />
                    <div 
                      className={`h-full opacity-80 ${macroAnalysis.strengthPercent >= 50 ? 'bg-emerald-500' : 'bg-rose-500'}`} 
                      style={{ width: `${macroAnalysis.strengthPercent}%` }} 
                    />
                 </div>
              </div>

              <div>
                 <div className="flex justify-between text-[10px] font-mono uppercase mb-1.5">
                    <span className="text-white">Counter-Sentiment</span>
                    <span className="text-slate-400">{100 - macroAnalysis.strengthPercent}%</span>
                 </div>
                 <div className="w-full bg-slate-900/80 h-2 rounded-full overflow-hidden border border-white/5 relative">
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20 z-10" />
                    <div 
                      className="h-full bg-blue-500 opacity-60" 
                      style={{ width: `${100 - macroAnalysis.strengthPercent}%` }} 
                    />
                 </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: LIVE MACRO FUNDAMENTALS DASHBOARD */}
          <div className="bg-black/40 border border-white/5 rounded-xl p-5 shadow-lg backdrop-blur-md">
             <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-mono font-black text-slate-500 uppercase tracking-widest">Macro Indicators</h3>
                <span className="text-[8px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 font-mono tracking-widest uppercase">FRED API</span>
             </div>
             <p className="text-[10px] font-mono text-slate-400 mb-4 tracking-widest uppercase border-b border-white/5 pb-2">{config.focus}</p>
             
             {loadingFred ? (
                 <div className="py-8 flex justify-center text-indigo-500"><Loader2 className="w-5 h-5 animate-spin" /></div>
             ) : (
                 <div className="space-y-3">
                     {FRED_SERIES.map(s => {
                         const data = fredData[s.id];
                         const weight = config.weights[s.id];
                         if (!data || weight === 0 || weight === undefined) return null;
                         
                         const isUp = data.current > data.previous;
                         const isDown = data.current < data.previous;
                         
                         let isBullish = false;
                         let isBearish = false;
                         if (isUp && weight > 0) isBullish = true;
                         if (isDown && weight < 0) isBullish = true;
                         if (isUp && weight < 0) isBearish = true;
                         if (isDown && weight > 0) isBearish = true;
                         
                         return (
                             <div key={s.id} className="p-3 bg-slate-900/50 rounded-lg border border-white/5 flex items-center justify-between group">
                                 <div>
                                     <p className="text-[9px] font-mono text-slate-400 uppercase tracking-tighter mb-1">{s.name}</p>
                                     <div className="flex items-end gap-2">
                                         <span className="text-sm font-black text-white">{data.current}{s.suffix}</span>
                                         <span className="text-[9px] font-mono text-slate-500 mb-0.5 relative group-hover:opacity-100 opacity-50 transition-opacity">
                                             prev: {data.previous}{s.suffix}
                                         </span>
                                     </div>
                                 </div>
                                 <div className={`flex flex-col items-center justify-center p-1.5 rounded-md border ${isBullish ? 'bg-emerald-500/10 border-emerald-500/20' : isBearish ? 'bg-rose-500/10 border-rose-500/20' : 'bg-slate-500/10 border-slate-500/20'}`}>
                                     {isBullish ? <TrendingUp className="w-4 h-4 text-emerald-400 mb-0.5" /> : isBearish ? <TrendingDown className="w-4 h-4 text-rose-400 mb-0.5" /> : <Minus className="w-4 h-4 text-slate-400 mb-0.5" />}
                                     <span className={`text-[7px] font-mono uppercase tracking-widest ${isBullish ? 'text-emerald-400' : isBearish ? 'text-rose-400' : 'text-slate-400'}`}>
                                         {isBullish ? 'PAIR BULL' : isBearish ? 'PAIR BEAR' : 'NEUTRAL'}
                                     </span>
                                 </div>
                             </div>
                         );
                     })}
                 </div>
             )}
          </div>

        </div>

        {/* RIGHT COLUMN: BREAKING NEWS */}
        <div className="xl:col-span-2">
           <div className="bg-black/40 border border-white/5 rounded-xl p-5 shadow-lg backdrop-blur-md h-full flex flex-col">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-[10px] font-mono font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Activity className="w-4 h-4 text-indigo-400" />
                    SECTION 1: Breaking Financial News ({activeSymbol})
                  </h3>
                </div>
                
                {/* Currency Filter */}
                <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 sm:pb-0">
                  {['ALL', 'USD', 'EUR', 'GBP', 'JPY', 'XAU'].map(c => (
                    <button 
                      key={c}
                      onClick={() => setCurrencyFilter(c)}
                      className={`px-3 py-1.5 text-[9px] font-mono font-bold uppercase tracking-widest rounded-md shrink-0 transition-all ${currencyFilter === c ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-slate-900/50 text-slate-400 border border-white/5 hover:text-white hover:bg-slate-800'}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {loadingNews ? (
                <div className="flex flex-col items-center justify-center py-32 text-slate-500 flex-1">
                  <Loader2 className="w-8 h-8 animate-spin mb-4 text-indigo-500" />
                  <p className="text-[10px] font-mono uppercase tracking-widest">Connecting to Finnhub Feed...</p>
                </div>
              ) : errorNews ? (
                <div className="bg-rose-500/10 border border-rose-500/20 p-6 rounded-xl text-center">
                  <p className="text-xs text-rose-400 font-mono tracking-widest">{errorNews}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 content-start">
                  {filteredNews.slice(0, 30).map((item, i) => (
                    <a 
                      key={item.id || i}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-black/20 border border-white/5 rounded-lg overflow-hidden hover:border-indigo-500/30 transition-all group flex flex-col h-full"
                    >
                      {item.image && (
                        <div className="h-32 w-full overflow-hidden bg-slate-900 border-b border-white/5 shrink-0">
                          <img 
                            src={item.image} 
                            alt={item.headline}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 opacity-80 group-hover:opacity-100"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiMxZTI5M2IiLz48L3N2Zz4=';
                            }}
                          />
                        </div>
                      )}
                      
                      <div className="p-4 flex flex-col flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[8px] font-mono font-bold text-indigo-400 uppercase tracking-widest px-1.5 py-0.5 bg-indigo-500/10 rounded border border-indigo-500/20">{item.source}</span>
                          <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">{new Date(item.datetime * 1000).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                        </div>
                        <h3 className="text-xs font-bold text-slate-200 mb-2 line-clamp-2 leading-relaxed tracking-tight group-hover:text-white transition-colors">{item.headline}</h3>
                        <p className="text-[10px] text-slate-400 line-clamp-2 mb-4 leading-relaxed font-sans">{item.summary}</p>
                        
                        <div className="flex items-center gap-1 text-[9px] font-black text-indigo-400 uppercase tracking-widest mt-auto opacity-50 group-hover:opacity-100 transition-opacity">
                          Source Link <ArrowRight className="w-3 h-3 ml-0.5" />
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              )}
           </div>
        </div>

      </div>
    </div>
  );
}
