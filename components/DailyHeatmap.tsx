import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { formatCurrency } from '../src/lib/utils';
import { Activity, Flame, Award, Calendar } from 'lucide-react';

interface DailyHeatmapProps {
  trades: any[];
  currency: string;
}

export default function DailyHeatmap({ trades = [], currency = 'USD' }: DailyHeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredDay, setHoveredDay] = useState<any | null>(null);

  // Generate last 30 days of performance buckets
  const heatmapData = useMemo(() => {
    const data: { dateStr: string; dateLabel: string; pnl: number; count: number; won: number; winRate: number }[] = [];
    
    // Create base 30 days from 29 days ago up to today
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      data.push({
        dateStr,
        dateLabel,
        pnl: 0,
        count: 0,
        won: 0,
        winRate: 0,
      });
    }

    // Accumulate trades
    trades.forEach(t => {
      const profit = Number(t.profit);
      if (isNaN(profit)) return;

      const dateVal = t.time || t.closeTime || t.openTime;
      if (!dateVal) return;

      const d = new Date(dateVal);
      const dateStr = d.toISOString().split('T')[0];
      
      const dayBucket = data.find(item => item.dateStr === dateStr);
      if (dayBucket) {
        dayBucket.pnl += profit;
        dayBucket.count += 1;
        if (profit > 0) {
          dayBucket.won += 1;
        }
      }
    });

    // Compute win rates
    data.forEach(item => {
      if (item.count > 0) {
        item.winRate = (item.won / item.count) * 100;
      }
    });

    return data;
  }, [trades]);

  // Overall heatmap statistics
  const stats = useMemo(() => {
    const profitableDays = heatmapData.filter(d => d.pnl > 0).length;
    const losingDays = heatmapData.filter(d => d.pnl < 0).length;
    const maxDailyProfit = Math.max(...heatmapData.map(d => d.pnl), 0);
    const maxDailyLoss = Math.min(...heatmapData.map(d => d.pnl), 0);
    const totalPnl = heatmapData.reduce((sum, d) => sum + d.pnl, 0);

    return {
      profitableDays,
      losingDays,
      maxDailyProfit,
      maxDailyLoss,
      totalPnl
    };
  }, [heatmapData]);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    // Clear previous drawings
    d3.select(svgRef.current).selectAll('*').remove();

    const parentWidth = containerRef.current.getBoundingClientRect().width || 480;
    const margin = { top: 10, right: 10, bottom: 10, left: 10 };
    const width = parentWidth - margin.left - margin.right;
    const height = 150 - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current)
      .attr('width', parentWidth)
      .attr('height', 150)
      .append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // Sizing calculations for a 10x3 grid
    const cols = 10;
    const rows = 3;
    const cellSpacing = 6;
    const cellWidth = (width - (cols - 1) * cellSpacing) / cols;
    const cellHeight = (height - (rows - 1) * cellSpacing) / rows;

    // Define color bounds based on max profit/loss values
    const maxPnl = Math.max(Math.abs(stats.maxDailyProfit), Math.abs(stats.maxDailyLoss), 10);

    // Color Scales
    // Profitable: Sage/Teal to emerald
    const profitColorScale = d3.scaleLinear<string>()
      .domain([0, maxPnl])
      .range(['#134e4a', '#059669']);

    // Losing: Amber to bright red-rose
    const lossColorScale = d3.scaleLinear<string>()
      .domain([0, maxPnl])
      .range(['#4c0519', '#e11d48']);

    const cellGroups = svg.selectAll('.day-group')
      .data(heatmapData)
      .enter()
      .append('g')
      .attr('class', 'day-group')
      .attr('transform', (d, i) => `translate(${(i % cols) * (cellWidth + cellSpacing)}, ${Math.floor(i / cols) * (cellHeight + cellSpacing)})`)
      .style('cursor', 'pointer');

    const cells = cellGroups
      .append('rect')
      .attr('class', 'day-cell')
      .attr('width', cellWidth)
      .attr('height', cellHeight)
      .attr('rx', 4)
      .attr('ry', 4)
      .attr('fill', d => {
        if (d.count === 0) return '#0D131F'; // Charcoal background if no trades
        return d.pnl >= 0 ? profitColorScale(d.pnl) : lossColorScale(Math.abs(d.pnl));
      })
      .attr('stroke', d => d.count > 0 ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.03)')
      .attr('stroke-width', 1)
      .style('opacity', 0); // Start with 0 opacity for transition

    const tooltips = cellGroups
      .append('text')
      .attr('class', 'day-text')
      .attr('x', cellWidth / 2)
      .attr('y', cellHeight / 2)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', 'white')
      .attr('font-size', '10px')
      .attr('font-family', 'monospace')
      .attr('font-weight', 'bold')
      .style('pointer-events', 'none')
      .style('opacity', 1)
      .text(d => d.count > 0 ? `${d.pnl >= 0 ? '+' : ''}${Math.round(d.pnl)}` : '');

    // Add entry fade-in transition
    cells.transition()
      .duration(350)
      .delay((d, i) => i * 15)
      .style('opacity', 1);

    // Dynamic hover effects and state management
    cellGroups.on('mouseover', function (event, d: any) {
      d3.select(this).select('rect')
        .transition()
        .duration(100)
        .attr('stroke', 'rgba(250, 206, 111, 0.7)')
        .attr('stroke-width', 1.5)
        .style('filter', 'drop-shadow(0px 0px 4px rgba(250, 206, 111, 0.45))');
      
      setHoveredDay(d);
    })
    .on('mouseout', function (event, d: any) {
      d3.select(this).select('rect')
        .transition()
        .duration(150)
        .attr('stroke', d.count > 0 ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.03)')
        .attr('stroke-width', 1)
        .style('filter', 'none');

      setHoveredDay(null);
    });

  }, [heatmapData, stats]);

  return (
    <div className="bg-[#0A0D14]/90 border border-white/5 rounded-2xl p-5 relative overflow-hidden group hover:border-white/10 transition-all duration-300">
      
      {/* Background Decorative Gridlines */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/5 via-transparent to-transparent pointer-none" />

      {/* Header and Details Row */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-4 mb-4 relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Calendar className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">30-Day Daily performance heatmap</h3>
            <p className="text-[9px] text-slate-500 font-mono uppercase tracking-widest mt-0.5">D3 Algorithmic Visualizer</p>
          </div>
        </div>

        {/* Total Heatmap Performance Stats */}
        <div className="flex items-center gap-4 text-[10px] font-mono text-slate-400">
          <div className="flex items-center gap-1">
            <Award className="w-3 h-3 text-emerald-400" />
            <span>Green Days: <strong className="text-emerald-400 font-bold">{stats.profitableDays}</strong></span>
          </div>
          <div className="flex items-center gap-1">
            <Flame className="w-3 h-3 text-rose-400" />
            <span>Red Days: <strong className="text-rose-400 font-bold">{stats.losingDays}</strong></span>
          </div>
          <div className="flex items-center gap-1">
            <Activity className="w-3 h-3 text-sky-400" />
            <span>Net: <strong className={`font-bold ${stats.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {stats.totalPnl >= 0 ? '+' : ''}{formatCurrency(stats.totalPnl, currency)}
            </strong></span>
          </div>
        </div>
      </div>

      {/* Main Heatmap Container */}
      <div className="flex flex-col lg:flex-row gap-5 items-center justify-between relative z-10">
        
        {/* Heatmap Grid canvas */}
        <div ref={containerRef} className="w-full lg:flex-1 min-w-0">
          <svg ref={svgRef} className="max-w-full overflow-visible" />
          
          {/* Label Legends */}
          <div className="flex justify-between items-center text-[8px] text-slate-500 font-mono tracking-widest mt-1 uppercase">
            <span>30 days ago</span>
            <div className="flex items-center gap-1.5">
              <span>Max Loss</span>
              <div className="w-2.5 h-2.5 bg-[#e11d48] rounded" />
              <div className="w-2.5 h-2.5 bg-[#4c0519] rounded" />
              <div className="w-2.5 h-2.5 bg-[#0D131F] rounded" />
              <div className="w-2.5 h-2.5 bg-[#134e4a] rounded" />
              <div className="w-2.5 h-2.5 bg-[#059669] rounded" />
              <span>Max Gain</span>
            </div>
            <span>Today</span>
          </div>
        </div>

        {/* Dynamic Details / Tooltip Panel */}
        <div className="w-full lg:w-48 shrink-0 bg-[#070a0f]/90 border border-white/5 rounded-xl p-3.5 min-h-[110px] flex flex-col justify-center text-left relative overflow-hidden">
          {hoveredDay ? (
            <div className="space-y-1.5 animate-fade-in font-mono">
              <div className="flex justify-between items-center text-[10px] text-amber-400 font-bold border-b border-white/5 pb-1 uppercase tracking-wider">
                <span>{hoveredDay.dateLabel}</span>
                <span className="text-[8px] bg-white/5 text-slate-400 px-1 py-0.2 rounded font-normal">Active</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-500">P/L:</span>
                <strong className={`font-black ${hoveredDay.count === 0 ? 'text-slate-400' : (hoveredDay.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400')}`}>
                  {hoveredDay.count === 0 ? '0.00' : (hoveredDay.pnl >= 0 ? '+' : '') + formatCurrency(hoveredDay.pnl, currency)}
                </strong>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500">Trades:</span>
                <span className="text-slate-300 font-bold">{hoveredDay.count}</span>
              </div>
              {hoveredDay.count > 0 && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-500">Win Rate:</span>
                  <span className="text-emerald-400 font-bold">{hoveredDay.winRate.toFixed(1)}%</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center font-mono my-auto py-2">
              <Activity className="w-5 h-5 mx-auto text-slate-700 animation-pulse mb-1" />
              <span className="text-[9px] text-slate-600 uppercase font-black tracking-widest block">Hover a Day</span>
              <span className="text-[8px] text-slate-600 block mt-0.5">to analyze metrics details</span>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
