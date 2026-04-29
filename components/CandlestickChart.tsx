import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

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
  upColor?: string;
  downColor?: string;
  bgImageUrl?: string;
}

export default function CandlestickChart({ 
  data, 
  latestTick, 
  height = 400, 
  deals = [], 
  positions = [], 
  executionMode = 'EA',
  upColor = '#10b981',
  downColor = '#f43f5e',
  bgImageUrl = ''
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [mouse, setMouse] = useState<{ x: number, y: number } | null>(null);

  // Auto layout sizing
  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      if (entries[0]) setWidth(entries[0].contentRect.width);
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Merge latest tick into final candle for live updating
  const chartData = useMemo(() => {
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
  const mainW = width - rightPadding;
  
  // Calculate spatial layout
  const baseCandleW = Math.max(mainW / chartData.length, 4);
  const candleW = baseCandleW;
  const totalW = chartData.length * candleW;
  
  // Align right edge organically (no panning allowed)
  const currentPan = mainW - totalW - 20;

  // Calculate rendering constraints dynamically based on visible data bounds
  const minP = chartData.length ? Math.min(...chartData.map(d => d.low)) * 0.9995 : 0;
  const maxP = chartData.length ? Math.max(...chartData.map(d => d.high)) * 1.0005 : 1;
  const range = (maxP - minP) || 1;

  // Axis Coordinate Helpers
  const getY = useCallback((p: number) => height - ((p - minP) / range) * height, [minP, range, height]);
  const getX = useCallback((i: number) => currentPan + i * candleW + candleW / 2, [currentPan, candleW]);
  const getPrice = useCallback((y: number) => maxP - (y / height) * range, [maxP, range, height]);

  const handleMove = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  // Convert generic trade timestamps directly into physical canvas X coordinates
  const matchTimeX = useCallback((timeStr: any) => {
    const t = new Date(timeStr).getTime();
    const idx = chartData.findIndex(c => new Date(c.time).getTime() >= t);
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
      style={{ 
          height, 
          width: '100%', 
          position: 'relative', 
          overflow: 'hidden', 
          backgroundColor: 'transparent',
          cursor: 'crosshair', 
          borderRadius: '12px', 
          border: '1px solid #1e293b',
          backgroundImage: bgImageUrl ? `url(${bgImageUrl})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
      }}
      onMouseLeave={() => setMouse(null)} 
      onMouseMove={handleMove} 
    >
      {bgImageUrl && <div className="absolute inset-0 bg-slate-950/70" /> /* overlay to dim background */}
      <svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0, userSelect: 'none' }}>
        
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
            <line x1={mouse.x} x2={mouse.x} y1={0} y2={height} stroke="#818cf8" strokeDasharray="4 4" opacity={0.6} />
            <line x1={0} x2={mainW} y1={mouse.y} y2={mouse.y} stroke="#818cf8" strokeDasharray="4 4" opacity={0.6} />
            <rect x={mainW} y={mouse.y - 10} width={rightPadding} height={20} fill="#818cf8" />
            <text x={mainW + 5} y={mouse.y + 4} fill="#ffffff" fontSize="11" fontWeight="bold" fontFamily="monospace">{getPrice(mouse.y).toFixed(5)}</text>
          </g>
        )}

        {/* Right Axis Isolator */}
        <line x1={mainW} x2={mainW} y1={0} y2={height} stroke="#1e293b" />
      </svg>
    </div>
  );
}
