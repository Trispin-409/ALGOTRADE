import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useStore } from '../src/store';

interface Candle {
  time: string | Date | number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface Tick {
  bid?: number;
  ask?: number;
}

interface Props {
  data: Candle[];
  latestTick?: Tick | null;
  height?: number;
  deals?: any[];
  positions?: any[];
  executionMode?: 'EA' | 'STRATEGY';
  marketAnalysis?: {
    bins: number[];
    zones: any[];
    detections: any[];
  } | null;
  showAnalysis?: boolean;
  upColor?: string;
  downColor?: string;
  bgImageUrl?: string;
  activeSetup?: {
    symbol: string;
    strategyName: string;
    direction: 'BUY' | 'SELL';
    entry: number;
    stopLoss: number;
    takeProfit: number;
    confidence: number;
    sessionName: string;
    horizon?: string;
    riskZone?: { low: number; high: number };
    rewardZone?: { low: number; high: number };
    liquidityAreas?: { price: number; label: string }[];
    support?: number;
    resistance?: number;
  } | null;
  lotSize?: number;
  setLotSize?: (val: number) => void;
}

const getPatternColor = (pattern: string, polarity: number) => {
  const pStr = String(pattern || '');
  const hash = pStr.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  if (polarity > 0) {
    const hues = [140, 160, 180, 200];
    return `hsl(${hues[hash % hues.length]}, 80%, 65%)`; // Bullish: Greens/Cyans
  } else if (polarity < 0) {
    const hues = [340, 0, 20, 300];
    return `hsl(${hues[hash % hues.length]}, 85%, 65%)`; // Bearish: Reds/Magentas/Oranges
  }
  return '#cbd5e1';
};

export default function CandlestickChart({ 
  data, 
  latestTick, 
  height = 400, 
  deals = [], 
  positions = [], 
  executionMode = 'EA',
  marketAnalysis = null,
  showAnalysis = false,
  upColor = '#10b981',
  downColor = '#f43f5e',
  bgImageUrl = '',
  activeSetup = null,
  lotSize,
  setLotSize
}: Props) {
  console.log("[CHART_MOUNTED]");
  console.log("[CHART_RENDER_DATA]", data?.length);

  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [dynamicHeight, setDynamicHeight] = useState(height);
  const [mouse, setMouse] = useState<{ x: number, y: number } | null>(null);

  const storeLotSize = useStore(state => state.strategySettings.lotSize) ?? 0.01;
  const activeLotSize = lotSize !== undefined ? lotSize : storeLotSize;

  const handleChg = useCallback((val: number) => {
    const clamped = Math.max(0.01, Math.min(10.0, Number(val.toFixed(2)) || 0.01));
    if (setLotSize) {
      setLotSize(clamped);
    } else {
      useStore.getState().setStrategySettings({ lotSize: clamped });
    }
  }, [setLotSize]);

  // Auto layout sizing
  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      if (entries[0]) {
        setWidth(entries[0].contentRect.width);
        setDynamicHeight(entries[0].contentRect.height);
      }
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const effectiveHeight = dynamicHeight || height;

  // Merge latest tick into final candle for live updating
  const chartData = useMemo(() => {
    console.log("[CHART_RENDER_DATA]", data?.length);
    if (!data || !data.length) return [];
    const arr = [...data];
    if (latestTick?.bid) {
      const last = { ...arr[arr.length - 1] };
      last.close = latestTick.bid;
      last.high = Math.max(last.high, latestTick.bid);
      last.low = Math.min(last.low, latestTick.bid);
      arr[arr.length - 1] = last;
    }
    return arr;
  }, [data, latestTick]);

  const rightPadding = 65;
  const mainW = Math.max(0, width - rightPadding);

  // Visible number of candles representing the ZOOM LEVEL (MT5 style)
  const [visibleCount, setVisibleCount] = useState<number>(65);

  const clampedVisibleCount = useMemo(() => {
    if (!chartData.length) return 65;
    return Math.max(10, Math.min(180, Math.min(chartData.length, visibleCount)));
  }, [chartData.length, visibleCount]);

  // MT5-style price scaling and vertical offset state variables to allow users to drag/zoom/squeeze the price y-axis
  const [priceScale, setPriceScale] = useState<number>(1.0);
  const [vOffset, setVOffset] = useState<number>(0);

  // Index of the rightmost visible candle in chartData.
  // When null, we focus on the end of the history (scrolled to the right)
  const [storedEndIndex, setStoredEndIndex] = useState<number | null>(null);

  const endIndex = useMemo(() => {
    if (!chartData.length) return 0;
    const defaultEnd = chartData.length;
    if (storedEndIndex === null) return defaultEnd;
    // MT5-style scroll restriction:
    // Allow scrolling into empty space on the front (future, up to +75% of visible count)
    // Avoid scrolling into empty space in the past (startIndex >= 0, so endIndex >= clampedVisibleCount)
    const maxEnd = chartData.length + Math.round(clampedVisibleCount * 0.75);
    const minEnd = clampedVisibleCount;
    return Math.max(minEnd, Math.min(maxEnd, storedEndIndex));
  }, [chartData.length, storedEndIndex, clampedVisibleCount]);

  const startIndex = useMemo(() => {
    return Math.max(0, endIndex - clampedVisibleCount);
  }, [endIndex, clampedVisibleCount]);

  // Actual candle width dynamically derived so the visible segment stretches perfectly across mainW
  const candleW = useMemo(() => {
    if (clampedVisibleCount <= 0 || mainW <= 0) return 6;
    return mainW / clampedVisibleCount;
  }, [clampedVisibleCount, mainW]);

  // Direct physical coordinate calculator
  const getX = useCallback((i: number) => {
    return (i - startIndex) * candleW + candleW / 2;
  }, [startIndex, candleW]);

  // Drag interaction states (manipulating ending index and vertical price pan/scaling)
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ 
    x: number; 
    y: number; 
    endIndex: number; 
    vOffset: number; 
    priceScale: number; 
    mode: 'none' | 'pan' | 'y-scale' 
  } | null>(null);

  // Gesture Touch zoom states
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartVisibleCountRef = useRef<number | null>(null);

  const handleDragStart = (clientX: number, clientY: number) => {
    setIsDragging(true);
    const isYScale = clientX >= mainW;
    const mode = isYScale ? 'y-scale' : 'pan';
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      endIndex: endIndex,
      vOffset: vOffset,
      priceScale: priceScale,
      mode: mode
    };
  };

  const handleDragMove = (clientX: number, clientY: number) => {
    if (!isDragging || !dragStartRef.current || !chartData.length) return;
    const start = dragStartRef.current;

    if (start.mode === 'y-scale') {
      // MT5 y-axis drag scale: compress or stretch the vertical price range
      const dy = clientY - start.y;
      const scaleMultiplier = Math.exp(-dy / 180);
      const targetScale = Math.max(0.05, Math.min(20, start.priceScale * scaleMultiplier));
      setPriceScale(targetScale);
    } else {
      // General chart dragging: supports BOTH horizontal timeline scrolling and vertical price offset panning
      const dx = clientX - start.x;
      const dy = clientY - start.y;

      // 1. Horizontal Index Shift
      const indexShift = -Math.round(dx / candleW);
      const targetEndIndex = start.endIndex + indexShift;
      const maxEnd = chartData.length + Math.round(clampedVisibleCount * 0.75);
      const minEnd = clampedVisibleCount;
      const clampedEndIndex = Math.max(minEnd, Math.min(maxEnd, targetEndIndex));
      setStoredEndIndex(clampedEndIndex);

      // 2. Vertical Price Panning (drag candle space up and down smoothly)
      // Estimate active viewport price range to accurately match pixels to real price unit shifts
      const lows = visibleCandles.length ? visibleCandles.map(d => d.low) : chartData.map(d => d.low);
      const highs = visibleCandles.length ? visibleCandles.map(d => d.high) : chartData.map(d => d.high);
      const minVal = lows.length ? Math.min(...lows.filter(v => v !== undefined && !isNaN(v))) : 1;
      const maxVal = highs.length ? Math.max(...highs.filter(v => v !== undefined && !isNaN(v))) : 2;
      const baseRange = (maxVal - minVal) || 0.1;
      const currentRange = (baseRange * 1.30) / priceScale; // incorporates vertical padding
      
      const dPrice = (dy / effectiveHeight) * currentRange;
      setVOffset(start.vOffset + dPrice);
    }
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  // Zoom dispatch functions
  const handleZoom = useCallback((direction: 'in' | 'out') => {
    setVisibleCount(prev => {
      const step = Math.max(3, Math.round(prev * 0.15));
      const target = direction === 'in' ? prev - step : prev + step;
      return Math.max(10, Math.min(180, target));
    });
  }, []);

  // Sync / Reset view on symbol/history length variations
  useEffect(() => {
    setStoredEndIndex(null);
    setPriceScale(1.0);
    setVOffset(0);
  }, [chartData.length]);

  // Mouse Wheel zooming with native event listener to bypass passive scroll trap
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    
    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      const direction = e.deltaY < 0 ? 'in' : 'out';
      handleZoom(direction);
    };
    
    el.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleNativeWheel);
    };
  }, [handleZoom]);

  // Slice visible candles block with zero gap and 100% exact boundary scaling
  const visibleCandles = useMemo(() => {
    if (!chartData.length) return [];
    return chartData.slice(startIndex, endIndex);
  }, [chartData, startIndex, endIndex]);

  const { minP, maxP, range } = useMemo(() => {
    if (!chartData.length) return { minP: 0, maxP: 1, range: 1 };
    
    const targets = visibleCandles.length ? visibleCandles : chartData;
    const lows = targets.map(d => d.low).filter(v => v !== undefined && !isNaN(v));
    const highs = targets.map(d => d.high).filter(v => v !== undefined && !isNaN(v));
    
    let minVal = lows.length ? Math.min(...lows) : 1;
    let maxVal = highs.length ? Math.max(...highs) : 2;
    
    let diff = (maxVal - minVal) || 0.1;
    
    // Setup strategic padding so candles are beautifully vertically centered & roomy
    let minP_base = minVal - diff * 0.15;
    let maxP_base = maxVal + diff * 0.15;
    
    const baseRange = maxP_base - minP_base;
    const midP = (maxP_base + minP_base) / 2;
    
    // Apply manual price scale and vertical panning offset (MT5 Style)
    // Decreasing scale flattens/compresses ("minimizes"), increasing stretches.
    const finalMinP = midP - (baseRange / 2) / priceScale + vOffset;
    const finalMaxP = midP + (baseRange / 2) / priceScale + vOffset;
    const finalRange = finalMaxP - finalMinP;
    
    return { minP: finalMinP, maxP: finalMaxP, range: finalRange };
  }, [chartData, visibleCandles, priceScale, vOffset]);

  // Axis Coordinate Helpers
  const getY = useCallback((p: number) => effectiveHeight - ((p - minP) / range) * effectiveHeight, [minP, range, effectiveHeight]);
  const getPrice = useCallback((y: number) => maxP - (y / effectiveHeight) * range, [maxP, range, effectiveHeight]);

  const handleMove = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  // Convert generic trade timestamps directly into physical canvas X coordinates
  const matchTimeX = useCallback((timeStr: any) => {
    const t = new Date(timeStr).getTime();
    const idx = chartData.findIndex(c => c && c.time && new Date(c.time).getTime() >= t);
    return idx !== -1 ? getX(idx) : getX(chartData.length - 1);
  }, [chartData, getX]);

  // Calculate raw Y positions and staggered labels for Bid/Ask
  let askLabelY = latestTick?.ask ? getY(latestTick.ask) : null;
  let bidLabelY = latestTick?.bid ? getY(latestTick.bid) : null;
  
  if (askLabelY !== null && bidLabelY !== null && Math.abs(askLabelY - bidLabelY) < 22) {
    if (askLabelY < bidLabelY) {
      askLabelY -= 11;
      bidLabelY += 11;
    } else {
      askLabelY += 11;
      bidLabelY -= 11;
    }
  }

  return (
    <div 
      ref={containerRef} 
      className="select-none touch-none"
      style={{ 
          height: '100%', 
          width: '100%', 
          position: 'relative', 
          overflow: 'hidden', 
          backgroundColor: 'transparent',
          cursor: isDragging ? 'grabbing' : 'crosshair', 
          borderRadius: '12px', 
          border: '1px solid #1e293b'
      }}
      onDoubleClick={() => {
        // Quick double-click reset to restore default MT5 auto-fit visual framing
        setPriceScale(1.0);
        setVOffset(0);
        setStoredEndIndex(null);
      }}
      onMouseDown={(e) => {
        if (e.button !== 0) return; // Only left-click drag
        handleDragStart(e.clientX, e.clientY);
      }}
      onMouseMove={(e) => {
        handleMove(e);
        handleDragMove(e.clientX, e.clientY);
      }}
      onMouseUp={() => handleDragEnd()}
      onMouseLeave={() => {
        setMouse(null);
        handleDragEnd();
      }}
      onTouchStart={(e) => {
        if (e.cancelable) e.preventDefault();
        if (e.touches.length === 1) {
          handleDragStart(e.touches[0].clientX, e.touches[0].clientY);
        } else if (e.touches.length === 2) {
          const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          touchStartDistRef.current = dist;
          touchStartVisibleCountRef.current = clampedVisibleCount;
        }
      }}
      onTouchMove={(e) => {
        if (e.cancelable) e.preventDefault();
        if (e.touches.length === 1) {
          handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
        } else if (e.touches.length === 2 && touchStartDistRef.current && touchStartVisibleCountRef.current) {
          const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          const ratio = dist / touchStartDistRef.current;
          const targetCount = Math.round(touchStartVisibleCountRef.current / ratio);
          const newCount = Math.max(10, Math.min(180, targetCount));
          setVisibleCount(newCount);
        }
      }}
      onTouchEnd={() => {
        handleDragEnd();
        touchStartDistRef.current = null;
        touchStartVisibleCountRef.current = null;
      }}
    >
      {bgImageUrl && (
        <img 
          src={bgImageUrl} 
          alt="Chart Background" 
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover" 
          crossOrigin="anonymous"
        />
      )}
      {bgImageUrl && <div className="absolute inset-0 bg-slate-950/70" /> /* overlay to dim background */}
      <svg width={width} height={effectiveHeight} style={{ position: 'absolute', top: 0, left: 0, userSelect: 'none' }}>
        <defs>
          <marker id="arrow-green" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L5,3 Z" fill="#22c55e" />
          </marker>
          <marker id="arrow-red" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L5,3 Z" fill="#ef4444" />
          </marker>
          <marker id="arrow-blue" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L5,3 Z" fill="#3b82f6" />
          </marker>
        </defs>
        
        {/* Background Grid */}
        {[0.2, 0.4, 0.6, 0.8].map(ratio => {
          const p = maxP - range * ratio;
          const y = getY(p);
          return (
            <g key={ratio}>
              <line x1={0} x2={mainW} y1={y} y2={y} stroke="#1e293b" strokeDasharray="4 4" />
              <text x={mainW + 8} y={y + 4} fill="#64748b" fontSize="10" fontFamily="monospace">{p.toFixed(5)}</text>
            </g>
          );
        })}

        {/* ANALYSIS LAYER: Pristine, Elegant & Non-Cluttering Overlay Indicators */}
        {showAnalysis && marketAnalysis && (
          <g>
            {/* Zones - Placed dynamically as thin clean markers on the right edge to avoid overrunning candles */}
            {marketAnalysis.zones.map((z, i) => {
              const yLow = getY(z.low);
              const yHigh = getY(z.high);
              const yMid = (yLow + yHigh) / 2;
              let color = z.isSupport ? '#10b981' : '#f43f5e';
              if (z.isConsolidation) color = '#94a3b8';

              const indicatorStartX = mainW * 0.75;
              return (
                <g key={`zone-${i}`} opacity={0.35}>
                  <line 
                    x1={indicatorStartX} 
                    x2={mainW} 
                    y1={yMid} 
                    y2={yMid} 
                    stroke={color} 
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                  {!z.isConsolidation && (
                    <text 
                      x={indicatorStartX + 6} 
                      y={yMid - 4} 
                      fill={color} 
                      fontSize="7" 
                      fontWeight="bold" 
                      className="font-mono uppercase tracking-wider select-none"
                    >
                      {z.isSupport ? 'SUPP' : 'RESIST'}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Recent Detections - Small sleek reference dots with high contrast */}
            {marketAnalysis.detections.map((d: any, i: number) => {
               const x = matchTimeX(d.time);
               const y = getY(d.price);
               const color = getPatternColor(d.pattern, d.polarity);
               return (
                 <g key={`det-${i}`}>
                   <circle cx={x} cy={y} r={3} fill={color} stroke="#090d16" strokeWidth={1} opacity={0.7} />
                 </g>
               );
            })}

            {/* High-Fidelity Deterministic Levels & Labels (SMC V10 Upgrade) */}
            {(marketAnalysis as any).structures && (marketAnalysis as any).structures.map((s: any, idx: number) => {
              const yStart = getY(s.priceStart);
              const yEnd = getY(s.priceEnd);
              const isBullish = s.type.includes('BULLISH') || s.type.includes('EQL') || s.type.includes('DISCOUNT');
              const color = isBullish ? '#10b981' : '#f43f5e';
              
              if (s.type.startsWith('BOS') || s.type.startsWith('CHOCH') || s.type.startsWith('MSS') || s.type.startsWith('SWEEP') || s.type.startsWith('EQ') || s.type.startsWith('PREMIUM') || s.type.startsWith('DISCOUNT')) {
                return (
                  <g key={`struct-level-${idx}`} opacity={0.95}>
                    <line 
                      x1={0} 
                      x2={mainW} 
                      y1={yStart} 
                      y2={yStart} 
                      stroke={color} 
                      strokeWidth={1.5}
                      strokeDasharray={s.type.startsWith('MSS') ? 'none' : '4 3'}
                    />
                    <rect 
                      x={mainW - 215} 
                      y={yStart - 18} 
                      width={205} 
                      height={30} 
                      fill="#02040a" 
                      stroke={color} 
                      strokeWidth={1} 
                      rx={3}
                    />
                    <text 
                      x={mainW - 210} 
                      y={yStart - 5} 
                      fill={color} 
                      fontSize="9" 
                      fontWeight="black" 
                      className="font-mono uppercase tracking-wider"
                    >
                      {s.type.replace('_BULLISH', ' ↗').replace('_BEARISH', ' ↘')} [{s.timeframe}]
                    </text>
                    <text x={mainW - 210} y={yStart + 7} fill="#94a3b8" fontSize="8" className="font-mono">
                      {Number(s.priceStart).toFixed(5)} | {s.source || 'SMC'} | CONF:{s.confidence || 90}%
                    </text>
                  </g>
                );
              }
              
              if (s.type.startsWith('OB') || s.type.startsWith('FVG')) {
                const heightBox = Math.abs(yStart - yEnd);
                const yTop = Math.min(yStart, yEnd);
                return (
                  <g key={`struct-box-${idx}`}>
                    <rect 
                      x={mainW * 0.1} 
                      y={yTop} 
                      width={mainW * 0.9} 
                      height={Math.max(4, heightBox)} 
                      fill={color} 
                      fillOpacity={0.08}
                      stroke={color}
                      strokeWidth={1}
                      strokeOpacity={0.4}
                      strokeDasharray="2 2"
                    />
                    <rect
                      x={mainW * 0.12}
                      y={yTop - 10}
                      width={200}
                      height={24}
                      fill="#02040a"
                      rx={2}
                      opacity={0.9}
                      stroke={color}
                      strokeWidth={0.5}
                    />
                    <text 
                      x={mainW * 0.13} 
                      y={yTop} 
                      fill={color} 
                      fontSize="8" 
                      fontWeight="bold" 
                      className="font-mono uppercase tracking-widest"
                    >
                      {s.type.replace('_BULLISH', '').replace('_BEARISH', '')} [{s.timeframe}] {Number(Math.min(s.priceStart, s.priceEnd)).toFixed(5)}-{Number(Math.max(s.priceStart, s.priceEnd)).toFixed(5)}
                    </text>
                    <text x={mainW * 0.13} y={yTop + 10} fill="#94a3b8" fontSize="7" className="font-mono">
                      CONF:{s.confidence || 90}% | {s.confirmed || 'CONFIRMED'} | {s.source || 'SMC Engine'}
                    </text>
                  </g>
                );
              }
              return null;
            })}
          </g>
        )}

        {/* Candlesticks Layer */}
        {chartData.map((d, i) => {
          const x = getX(i);
          if (x < -20 || x > mainW + 20) return null; // Outside viewport cull buffer
          
          const isGreen = d.close >= d.open;
          const color = isGreen ? upColor : downColor;
          
          return (
            <g key={i}>
              <line x1={x} x2={x} y1={getY(d.high)} y2={getY(d.low)} stroke={color} strokeWidth={1} />
              <rect 
                x={x - candleW * 0.4} 
                y={getY(Math.max(d.open, d.close))} 
                width={Math.max(1, candleW * 0.8)} 
                height={Math.max(1, Math.abs(getY(d.open) - getY(d.close)))} 
                fill={color} 
                rx={1}
              />
            </g>
          );
        })}

        {/* EA Pending Positions Level Layer */}
        {positions.map((p, i) => {
          const y = getY(p.openPrice);
          const ySL = p.stopLoss ? getY(p.stopLoss) : null;
          const yTP = p.takeProfit ? getY(p.takeProfit) : null;
          
          const isBuy = p.type === 'POSITION_TYPE_BUY';
          const color = isBuy ? '#3b82f6' : '#f43f5e';
          
          return (
            <g key={`pos-${i}`}>
              {/* Entry */}
              <line x1={0} x2={mainW} y1={y} y2={y} stroke={color} strokeWidth={1} strokeDasharray="6 4" />
              <rect x={10} y={y - 12} width={180} height={24} fill="#02040a" stroke={color} rx={4} />
              <text x={18} y={y + 3} fill={color} fontSize="10" fontWeight="bold">
                {isBuy ? 'BUY' : 'SELL'} {p.volume} • {executionMode === 'STRATEGY' ? 'STRAT' : 'EA'} • P/L: {p.unrealizedProfit ? p.unrealizedProfit.toFixed(2) : '0.00'}
              </text>
              
              {/* Arrows at entry */}
              {ySL && <line x1={0} x2={mainW} y1={ySL} y2={ySL} stroke="#f43f5e" strokeWidth={1} strokeDasharray="2 2" />}
              {yTP && <line x1={0} x2={mainW} y1={yTP} y2={yTP} stroke="#10b981" strokeWidth={1} strokeDasharray="2 2" />}
            </g>
          );
        })}

        {/* ACTIVE STRATEGY SETUP LAYER (TRADINGVIEW RISK/REWARD STYLE) */}
        {showAnalysis && activeSetup && (
          <g>
            {(() => {
              const yEntry = getY(activeSetup.entry);
              const ySL = getY(activeSetup.stopLoss);
              const yTP = getY(activeSetup.takeProfit);
              
              const isBuy = activeSetup.direction === 'BUY';
              
              const formatPrice = (val: number) => {
                const n = Number(val);
                if (isNaN(n)) return '0.00';
                if (n < 10) return n.toFixed(5);
                if (n < 10000) return n.toFixed(2);
                return Math.round(n).toString();
              };
              
              const entryColor = '#3b82f6'; // Blue
              const slColor = '#ef4444'; // Red
              const tpColor = isBuy ? '#10b981' : '#ef4444'; // BUY: Green. SELL: Red
              const structColor = '#64748b'; // Gray
              const srColor = '#eab308'; // Yellow Support/Resistance
              const liqColor = '#ffffff'; // White Liquidity
              
              const yRiskTop = Math.min(yEntry, ySL);
              const riskH = Math.abs(yEntry - ySL);
              const yRewardTop = Math.min(yEntry, yTP);
              const rewardH = Math.abs(yEntry - yTP);
              
              const strategyNameUpper = (activeSetup.strategyName || '').toUpperCase();
              let strategyType: 'ORDER_BLOCK' | 'LIQUIDITY_SWEEP' | 'FVG' | 'RANGE_REVERSAL' = 'ORDER_BLOCK';
              
              if (strategyNameUpper.includes('LIQUIDITY') || strategyNameUpper.includes('SWEEP') || strategyNameUpper.includes('ENGULFING') || strategyNameUpper.includes('MICRO-SCAN')) {
                strategyType = 'LIQUIDITY_SWEEP';
              } else if (strategyNameUpper.includes('FAIR VALUE') || strategyNameUpper.includes('FVG') || strategyNameUpper.includes('GAP')) {
                strategyType = 'FVG';
              } else if (strategyNameUpper.includes('RANGE') || strategyNameUpper.includes('REVERSAL') || strategyNameUpper.includes('FIBONACCI') || strategyNameUpper.includes('GAUGES')) {
                strategyType = 'RANGE_REVERSAL';
              } else {
                strategyType = 'ORDER_BLOCK';
              }
              
              const blockStartIdx = Math.max(0, chartData.length - 12);
              const blockEndIdx = chartData.length - 1;
              const xStart = getX(blockStartIdx);
              const xEnd = getX(blockEndIdx);
              const blockWidth = Math.max(10, xEnd - xStart);

              // TradingView risk/reward box limits: extends from the entry candle to the absolute right of the chart workspace (mainW)
              const xBoxStart = getX(Math.max(0, chartData.length - 15));
              const boxWidth = Math.max(10, mainW - xBoxStart);

              return (
                <g>
                  {/* SL Zone (Risk) */}
                  <rect 
                    x={xBoxStart} 
                    y={yRiskTop} 
                    width={boxWidth} 
                    height={riskH} 
                    fill="#ef4444" 
                    opacity={0.06} 
                  />
                  
                  {/* TP Zone (Reward) */}
                  <rect 
                    x={xBoxStart} 
                    y={yRewardTop} 
                    width={boxWidth} 
                    height={rewardH} 
                    fill={isBuy ? "#10b981" : "#ef4444"} 
                    opacity={0.06} 
                  />

                  {/* 1. ORDER BLOCK BREAKOUT SPECIFIC DRAWINGS */}
                  {strategyType === 'ORDER_BLOCK' && (
                    <g>
                      {/* Order Block demand/supply rectangle */}
                      {isBuy ? (
                        <g>
                          <rect 
                            x={xStart} 
                            y={yEntry} 
                            width={blockWidth} 
                            height={Math.abs(ySL - yEntry) * 0.7} 
                            fill={structColor} 
                            fillOpacity={0.15} 
                            stroke={structColor} 
                            strokeWidth={1} 
                            strokeDasharray="3 3"
                          />
                          <text x={Math.max(8, xStart + 8)} y={yEntry + 15} fill={structColor} fontSize="8" fontWeight="bold" className="font-mono uppercase tracking-wider">ORDER BLOCK (BULLISH DEMAND ZONE)</text>
                        </g>
                      ) : (
                        <g>
                          <rect 
                            x={xStart} 
                            y={yEntry - Math.abs(yEntry - ySL) * 0.7} 
                            width={blockWidth} 
                            height={Math.abs(yEntry - ySL) * 0.7} 
                            fill={structColor} 
                            fillOpacity={0.15} 
                            stroke={structColor} 
                            strokeWidth={1} 
                            strokeDasharray="3 3"
                          />
                          <text x={Math.max(8, xStart + 8)} y={yEntry - Math.abs(yEntry - ySL) * 0.7 + 15} fill={structColor} fontSize="8" fontWeight="bold" className="font-mono uppercase tracking-wider">ORDER BLOCK (BEARISH SUPPLY ZONE)</text>
                        </g>
                      )}

                      {/* BOS (Break Of Structure) Line */}
                      {(() => {
                        const bosY = isBuy ? yEntry - (yEntry - yTP) * 0.3 : yEntry + (yTP - yEntry) * 0.3;
                        const bosXStart = getX(Math.max(0, chartData.length - 10));
                        const bosXEnd = getX(chartData.length - 1);
                        return (
                          <g>
                            <line x1={bosXStart} x2={bosXEnd} y1={bosY} y2={bosY} stroke={structColor} strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
                            <circle cx={bosXStart} cy={bosY} r={3} fill={structColor} />
                            <text x={Math.max(8, bosXStart + 8)} y={bosY - 4} fill={structColor} fontSize="8" fontWeight="black" className="font-sans tracking-widest uppercase">BOS [CONFIRMED STRUCTURE BREAK]</text>
                          </g>
                        );
                      })()}
                    </g>
                  )}

                  {/* 2. LIQUIDITY SWEEP REVERSAL SPECIFIC DRAWINGS */}
                  {strategyType === 'LIQUIDITY_SWEEP' && (
                    <g>
                      {/* Swipe level marker line with White coloring */}
                      {(() => {
                        const sweepY = isBuy ? ySL + Math.abs(yEntry - ySL) * 0.1 : ySL - Math.abs(yEntry - ySL) * 0.1;
                        const sweepXStart = getX(Math.max(0, chartData.length - 12));
                        const sweepXEnd = getX(chartData.length - 1);
                        const sweepCenterX = sweepXStart + Math.abs(sweepXEnd - sweepXStart) * 0.4;
                        return (
                          <g>
                            <line x1={sweepXStart} x2={sweepXEnd} y1={sweepY} y2={sweepY} stroke={liqColor} strokeWidth={1.2} strokeDasharray="2 4" />
                            <circle cx={sweepCenterX} cy={sweepY} r={5} stroke={liqColor} strokeWidth={1.5} fill="none" className="animate-pulse" />
                            <text x={Math.max(8, sweepXStart + 8)} y={sweepY - 5} fill={liqColor} fontSize="8" fontWeight="black" className="font-mono tracking-widest uppercase">LIQUIDITY SWEEP (EQL/EQH HUNT COMPLETE) ✘</text>
                            
                            {/* Rejection Arrow */}
                            <path 
                              d={isBuy ? `M ${sweepCenterX} ${sweepY} L ${sweepCenterX} ${sweepY - 25}` : `M ${sweepCenterX} ${sweepY} L ${sweepCenterX} ${sweepY + 25}`} 
                              stroke={isBuy ? "#22c55e" : "#ef4444"} 
                              strokeWidth={1.5} 
                              markerEnd={isBuy ? "url(#arrow-green)" : "url(#arrow-red)"} 
                            />
                            <text x={Math.max(8, sweepCenterX + 8)} y={isBuy ? sweepY - 12 : sweepY + 16} fill={isBuy ? "#22c55e" : "#ef4444"} fontSize="8" fontWeight="black" className="font-sans uppercase">REJECTION</text>
                          </g>
                        );
                      })()}
                    </g>
                  )}

                  {/* 3. FAIR VALUE GAP CONTINUATION SPECIFIC DRAWINGS */}
                  {strategyType === 'FVG' && (
                    <g>
                      {/* FVG imbalance box */}
                      {(() => {
                        const fvgYTop = isBuy ? yEntry + Math.abs(yEntry - ySL) * 0.15 : yEntry - Math.abs(yEntry - ySL) * 0.7;
                        const fvgH = Math.abs(yEntry - ySL) * 0.55;
                        const fvgXStart = getX(Math.max(0, chartData.length - 10));
                        const fvgXEnd = getX(chartData.length - 3);
                        const fvgWidth = Math.max(10, fvgXEnd - fvgXStart);
                        return (
                          <g>
                            <rect 
                              x={fvgXStart} 
                              y={fvgYTop} 
                              width={fvgWidth} 
                              height={fvgH} 
                              fill="#818cf8" 
                              fillOpacity={0.1} 
                              stroke="#818cf8" 
                              strokeWidth={1} 
                              strokeDasharray="4 4"
                            />
                            <text x={Math.max(8, fvgXStart + 8)} y={fvgYTop + fvgH / 2 + 3} fill="#818cf8" fontSize="8" fontWeight="black" className="font-sans tracking-widest uppercase">FAIR VALUE GAP (FVG IMBALANCE ZONE)</text>
                          </g>
                        );
                      })()}
                    </g>
                  )}

                  {/* 4. RANGE REVERSAL SPECIFIC DRAWINGS */}
                  {strategyType === 'RANGE_REVERSAL' && (
                    <g>
                      {/* Range High yellow boundary */}
                      {(() => {
                        const rhY = isBuy ? yEntry - Math.abs(yEntry - yTP) * 0.6 : yEntry - Math.abs(yEntry - ySL) * 0.6;
                        const rXStart = getX(Math.max(0, chartData.length - 16));
                        const rXEnd = getX(chartData.length - 1);
                        return (
                          <g>
                            <line x1={rXStart} x2={rXEnd} y1={rhY} y2={rhY} stroke={srColor} strokeWidth={1} />
                            <text x={Math.max(8, rXStart + 8)} y={rhY - 4} fill={srColor} fontSize="8" fontWeight="black" className="font-sans tracking-widest uppercase">RANGE HIGH BOUNDARY (STRONG CEILING)</text>
                          </g>
                        );
                      })()}

                      {/* Range Low yellow boundary */}
                      {(() => {
                        const rlY = isBuy ? yEntry + Math.abs(yEntry - ySL) * 0.6 : yEntry + Math.abs(yEntry - yTP) * 0.6;
                        const rXStart = getX(Math.max(0, chartData.length - 16));
                        const rXEnd = getX(chartData.length - 1);
                        return (
                          <g>
                            <line x1={rXStart} x2={rXEnd} y1={rlY} y2={rlY} stroke={srColor} strokeWidth={1} />
                            <text x={Math.max(8, rXStart + 8)} y={rlY + 10} fill={srColor} fontSize="8" fontWeight="black" className="font-sans tracking-widest uppercase">RANGE LOW BOUNDARY (STRONG FLOOR)</text>
                          </g>
                        );
                      })()}
                    </g>
                  )}

                  {/* Direction Arrow path */}
                  {(() => {
                    const arrowStartX = getX(Math.max(0, chartData.length - 10));
                    const arrowEndX = getX(chartData.length - 2);
                    const arrowStartY = yEntry;
                    const arrowEndY = isBuy ? yTP + Math.abs(yEntry - yTP) * 0.35 : yTP - Math.abs(yEntry - yTP) * 0.35;
                    const arrowCtrlX = (arrowStartX + arrowEndX) / 2 + 15;
                    
                    return (
                      <g>
                        <path 
                          d={`M ${arrowStartX} ${arrowStartY} Q ${arrowCtrlX} ${(arrowStartY + arrowEndY)/2} ${arrowEndX} ${arrowEndY}`} 
                          stroke={isBuy ? "#22c55e" : "#ef4444"} 
                          strokeWidth={2} 
                          fill="none" 
                          strokeDasharray="4 2" 
                          markerEnd={isBuy ? "url(#arrow-green)" : "url(#arrow-red)"} 
                        />
                      </g>
                    );
                  })()}

                  {/* Horizontal Guide Lines */}
                  {/* Clean blue entry line */}
                  <line x1={xBoxStart} x2={mainW} y1={yEntry} y2={yEntry} stroke={entryColor} strokeWidth={1.2} />

                  {/* Dynamic TP1, TP2, TP3 targets within Take Profit zone */}
                  {(() => {
                    const diff = activeSetup.takeProfit - activeSetup.entry;
                    const tp1Price = activeSetup.entry + diff * 0.33;
                    const tp2Price = activeSetup.entry + diff * 0.66;
                    const tp3Price = activeSetup.takeProfit;

                    const yTP1 = getY(tp1Price);
                    const yTP2 = getY(tp2Price);

                    return (
                      <g>
                        {/* Dynamic TP targets guide lines */}
                        <line x1={xBoxStart} x2={mainW} y1={yTP} y2={yTP} stroke="#10b981" strokeWidth={0.8} strokeDasharray="2 3" opacity={0.6} />
                        <line x1={xBoxStart} x2={mainW} y1={yTP1} y2={yTP1} stroke="#10b981" strokeWidth={0.6} strokeDasharray="2 4" opacity={0.4} />
                        <line x1={xBoxStart} x2={mainW} y1={yTP2} y2={yTP2} stroke="#10b981" strokeWidth={0.6} strokeDasharray="2 4" opacity={0.4} />

                        {/* TP1, TP2, TP3 label positioning */}
                        <text x={8} y={yTP1 - 4} textAnchor="start" fill="#10b981" fontSize="7" fontWeight="bold" className="font-mono tracking-wider opacity-60 uppercase select-none pointer-events-none">
                          TP1 {formatPrice(tp1Price)}
                        </text>
                        <text x={8} y={yTP2 - 4} textAnchor="start" fill="#10b981" fontSize="7" fontWeight="bold" className="font-mono tracking-wider opacity-60 uppercase select-none pointer-events-none">
                          TP2 {formatPrice(tp2Price)}
                        </text>
                        <text x={8} y={yTP - 4} textAnchor="start" fill="#10b981" fontSize="8" fontWeight="black" className="font-mono tracking-widest opacity-90 uppercase select-none pointer-events-none">
                          TP3 (FINAL TARGET)
                        </text>
                      </g>
                    );
                  })()}

                  {/* Stop Loss label - thin guiding boundary only, no thick solid lines */}
                  <line x1={xBoxStart} x2={mainW} y1={ySL} y2={ySL} stroke={slColor} strokeWidth={0.5} strokeDasharray="3 6" opacity={0.4} />
                  <text x={8} y={ySL - 4} textAnchor="start" fill={slColor} fontSize="8" fontWeight="black" className="font-mono tracking-widest opacity-90 uppercase select-none pointer-events-none">
                    STOP LOSS (RISK AREA BOUNDARY)
                  </text>

                  {/* Blue entry trigger label */}
                  <text x={8} y={yEntry - 4} textAnchor="start" fill={entryColor} fontSize="8" fontWeight="black" className="font-mono tracking-widest opacity-95 uppercase select-none pointer-events-none">
                    {activeSetup.direction} ENTRY
                  </text>

                  {/* TradingView-Style Price Scale Tag Pills rendered on the right-hand price axis bar */}
                  <rect x={mainW + 2} y={yTP - 8} width={rightPadding - 4} height={16} fill={isBuy ? "#10b981" : "#ef4444"} rx={2} />
                  <text x={mainW + rightPadding / 2} y={yTP + 3} textAnchor="middle" fill="#090d16" fontSize="8" fontWeight="black" fontFamily="monospace">
                    TP {formatPrice(activeSetup.takeProfit)}
                  </text>

                  <rect x={mainW + 2} y={ySL - 8} width={rightPadding - 4} height={16} fill="#ef4444" rx={2} />
                  <text x={mainW + rightPadding / 2} y={ySL + 3} textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="black" fontFamily="monospace">
                    SL {formatPrice(activeSetup.stopLoss)}
                  </text>

                  <rect x={mainW + 2} y={yEntry - 8} width={rightPadding - 4} height={16} fill="#3b82f6" rx={2} />
                  <text x={mainW + rightPadding / 2} y={yEntry + 3} textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="black" fontFamily="monospace">
                    ENT {formatPrice(activeSetup.entry)}
                  </text>
                </g>
              );
            })()}
          </g>
        )}

        {/* EA Executed Deals Array Layer */}
        {deals.map((d, i) => {
          const x = matchTimeX(d.time);
          const y = getY(d.price);
          
          const isBuy = d.type === 'DEAL_TYPE_BUY';
          const color = isBuy ? '#3b82f6' : '#f43f5e';
          return (
            <g key={`deal-${i}`}>
               {/* Custom Draw Up/Down Arrows matching MT4 exactly */}
               <polygon points={isBuy ? `${x-5},${y+15} ${x+5},${y+15} ${x},${y+5}` : `${x-5},${y-15} ${x+5},${y-15} ${x},${y-5}`} fill={color} />
               <text x={x + 8} y={isBuy ? y + 15 : y - 10} fill={color} fontSize="10" fontWeight="bold">{d.volume}</text>
            </g>
          );
        })}

        {/* Live Active Bid/Ask Layer */}
        {latestTick?.bid && bidLabelY !== null && (
            <g>
                <line x1={0} x2={width} y1={getY(latestTick.bid)} y2={getY(latestTick.bid)} stroke="#cbd5e1" strokeDasharray="3 3" />
                <rect x={mainW} y={bidLabelY - 10} width={rightPadding} height={20} fill="#cbd5e1" />
                <text x={mainW + 5} y={bidLabelY + 4} fill="#0f172a" fontSize="11" fontWeight="bold" fontFamily="monospace">{latestTick.bid.toFixed(5)}</text>
            </g>
        )}
        {latestTick?.ask && askLabelY !== null && (
            <g>
                <line x1={0} x2={width} y1={getY(latestTick.ask)} y2={getY(latestTick.ask)} stroke="#f43f5e" />
                <rect x={mainW} y={askLabelY - 10} width={rightPadding} height={20} fill="#f43f5e" />
                <text x={mainW + 5} y={askLabelY + 4} fill="#ffffff" fontSize="11" fontWeight="bold" fontFamily="monospace">{latestTick.ask.toFixed(5)}</text>
            </g>
        )}

        {/* Realtime User Crosshair Layer */}
        {mouse && mouse.x < mainW && (
          <g>
            <line x1={mouse.x} x2={mouse.x} y1={0} y2={effectiveHeight} stroke="#818cf8" strokeDasharray="4 4" opacity={0.6} />
            <line x1={0} x2={mainW} y1={mouse.y} y2={mouse.y} stroke="#818cf8" strokeDasharray="4 4" opacity={0.6} />
            <rect x={mainW} y={mouse.y - 10} width={rightPadding} height={20} fill="#818cf8" />
            <text x={mainW + 5} y={mouse.y + 4} fill="#ffffff" fontSize="11" fontWeight="bold" fontFamily="monospace">{getPrice(mouse.y).toFixed(5)}</text>
          </g>
        )}

        {/* Right Axis Isolator */}
        <line x1={mainW} x2={mainW} y1={0} y2={effectiveHeight} stroke="#1e293b" />
      </svg>
      
      {/* Strategy Header in top-left corner - Very small, minimal, professional */}
      {showAnalysis && activeSetup && (
        <div className="absolute top-4 left-4 z-20 bg-slate-950/95 border border-white/5 rounded p-2 shadow-2xl backdrop-blur-sm select-none font-sans text-[8px] sm:text-[9px] text-slate-400 flex flex-col gap-0.5 pointer-events-none">
          <div className="font-black text-slate-100 text-[9px] sm:text-[10px] uppercase tracking-wider mb-0.5">
            {activeSetup.strategyName.replace(/\[RANKED #1\]/gi, '').split('[')[0].trim()}
          </div>
          <div>Confidence: <span className="font-bold text-[#face6f]">{activeSetup.confidence}%</span></div>
          <div>Session: <span className="font-bold text-slate-100 uppercase">{activeSetup.sessionName || 'London'}</span></div>
          <div>Timeframe: <span className="font-bold text-slate-100 uppercase">H1 → M15 → M5</span></div>
        </div>
      )}
      
      {/* Sleek Floating MT5-style Zoom Buttons */}
      <div 
        className="absolute bottom-4 right-[85px] flex gap-1.5 z-30 select-none pointer-events-auto"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <button 
          onClick={() => handleZoom('out')}
          className="flex items-center justify-center w-7 h-7 bg-[#0b1329]/95 hover:bg-slate-800 border border-white/10 active:scale-95 text-slate-300 hover:text-white rounded-lg backdrop-blur-md transition-all shadow-lg cursor-pointer"
          title="Zoom Out (More candles)"
        >
          <Minus className="w-4 h-4 text-slate-400" />
        </button>
        <button 
          onClick={() => handleZoom('in')}
          className="flex items-center justify-center w-7 h-7 bg-[#0b1329]/95 hover:bg-slate-800 border border-white/10 active:scale-95 text-slate-300 hover:text-white rounded-lg backdrop-blur-md transition-all shadow-lg cursor-pointer"
          title="Zoom In (Fewer candles)"
        >
          <Plus className="w-4 h-4 text-slate-400" />
        </button>
      </div>
    </div>
  );
}
