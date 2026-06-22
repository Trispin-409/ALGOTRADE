import React from 'react';
import { useStore } from '../src/store';
import { Activity, ClipboardList, TrendingUp, TrendingDown, RefreshCw, XCircle } from 'lucide-react';
import { safeFetch } from '../src/lib/utils';
import { TradingAccount } from '../types';

interface OpenPositionsViewProps {
  accounts: TradingAccount[];
  token?: string;
  selectedAccountId?: string;
  addLog?: (msg: string) => void;
}

const OpenPositionsView: React.FC<OpenPositionsViewProps> = ({ accounts, token, selectedAccountId, addLog }) => {
  const globalPositions = useStore(state => state.positions);
  const setPositions = useStore(state => state.setPositions);
  const selectedAccount = accounts?.find(a => a.id === selectedAccountId) || null;

  const handleRefresh = async () => {
    if (!selectedAccountId) return;
    try {
      const data = await safeFetch(`/api/account/${selectedAccountId}/positions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (Array.isArray(data)) {
        setPositions(data);
        if (addLog) addLog(`POSITIONS: Manually refreshed ${data.length} active positions`);
      }
    } catch (err: any) {
      console.error("Failed to refresh active positions:", err);
    }
  };

  const handleClosePosition = async (positionId: string, symbol: string) => {
    if (!selectedAccountId) return;
    if (!window.confirm(`Are you sure you want to close position #${positionId} for ${symbol}?`)) return;

    if (addLog) addLog(`TRADING: Requesting close of position #${positionId} (${symbol})...`);
    try {
      const result = await safeFetch(`/api/trade/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          accountId: selectedAccountId,
          positionId
        })
      });

      if (result.success) {
        if (addLog) addLog(`TRADING: Successfully closed position #${positionId} (${symbol})`);
        
        // Remove from store instantly for snappy feedback
        setPositions(globalPositions.filter(p => p.id !== positionId));
      } else {
        if (addLog) addLog(`TRADING ERROR: Failed to close position #${positionId}: ${result.error}`);
        alert(`Failed to close position: ${result.error}`);
      }
    } catch (err: any) {
      if (addLog) addLog(`TRADING ERROR: Failed to close position #${positionId}: ${err.message}`);
      alert(`Error closing position: ${err.message}`);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-black/40 border border-white/5 rounded-3xl p-4 sm:p-5 font-sans space-y-4">
      {/* Header section inside panel */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <ClipboardList className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-wider">Active Portfolio</h2>
            <p className="text-[10px] font-mono text-slate-500">
              {selectedAccount ? `In Sync: Terminal ${selectedAccount.login}` : "No Account Selected"}
            </p>
          </div>
        </div>

        <button 
          onClick={handleRefresh}
          className="p-2 bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 rounded-xl transition-all cursor-pointer"
          title="Refresh Positions"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>

      {/* Grid of Positions */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-3 min-h-[350px]">
        {globalPositions.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16 border border-dashed border-white/5 rounded-2xl bg-black/20 text-slate-500">
            <Activity className="w-8 h-8 text-slate-600 mb-2 animate-pulse" />
            <span className="text-xs font-mono font-bold uppercase tracking-widest">No Active Positions</span>
            <span className="text-[10px] text-slate-600 max-w-xs mt-1">
              Your automated strategy is monitoring the markets. Start the Algotrade Engine or place a manual order.
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            {globalPositions.map((pos: any, idx: number) => {
              const isBuy = pos.type === 'POSITION_TYPE_BUY' || pos.type?.toLowerCase() === 'buy';
              const profit = Number(pos.unrealizedProfit || pos.profit || 0);
              const isProfit = profit >= 0;
              const entryPrice = Number(pos.openPrice || pos.price || 0);
              const currentPrice = Number(pos.currentPrice || pos.price || entryPrice);
              const stopLoss = pos.stopLoss || pos.sl || '-';
              const takeProfit = pos.takeProfit || pos.tp || '-';
              const volume = pos.volume || pos.lots || pos.qty || '0.00';

              return (
                <div 
                  key={pos.id || idx}
                  className="bg-[#070b13] border border-white/5 rounded-2xl overflow-hidden hover:border-white/10 transition-all flex flex-col relative"
                >
                  {/* Card head bar */}
                  <div className="bg-gradient-to-r from-slate-950 to-slate-900 border-b border-white/5 py-2 px-3 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-white tracking-wide uppercase font-mono">{pos.symbol}</span>
                      <span className={`text-[8px] font-mono font-black uppercase px-2 py-0.5 rounded ${
                        isBuy ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}>
                        {isBuy ? 'BUY' : 'SELL'}
                      </span>
                      <span className="text-[9px] font-mono text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-white/5 font-bold uppercase">
                        {pos.comment || 'SYS'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-black text-slate-400">{volume} Lots</span>
                      <button 
                        onClick={() => handleClosePosition(pos.id, pos.symbol)}
                        className="p-1 hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 rounded transition-all cursor-pointer"
                        title="Close Position"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Card body params */}
                  <div className="p-3 grid grid-cols-2 xs:grid-cols-4 gap-3 bg-black/30 font-mono text-left">
                    <div>
                      <span className="text-[8px] text-slate-500 block uppercase font-bold tracking-wider">Entry</span>
                      <span className="text-xs font-black text-slate-300">{entryPrice.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[8px] text-slate-500 block uppercase font-bold tracking-wider">Current</span>
                      <span className="text-xs font-black text-white">{currentPrice.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[8px] text-slate-500 block uppercase font-bold tracking-wider">Stop Loss</span>
                      <span className="text-xs font-black text-rose-400/80">{typeof stopLoss === 'number' ? stopLoss.toFixed(2) : stopLoss}</span>
                    </div>
                    <div>
                      <span className="text-[8px] text-slate-500 block uppercase font-bold tracking-wider">Take Profit</span>
                      <span className="text-xs font-black text-emerald-400/80">{typeof takeProfit === 'number' ? takeProfit.toFixed(2) : takeProfit}</span>
                    </div>
                  </div>

                  {/* Card bottom PnL */}
                  <div className="border-t border-white/5 bg-slate-950/40 p-2.5 flex items-center justify-between">
                    <span className="text-[9px] font-mono text-slate-500 font-bold uppercase tracking-widest pl-1">
                      Unrealized Return
                    </span>
                    <span className={`text-sm font-black font-mono tracking-tight mr-1 ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isProfit ? '+' : ''}{profit.toFixed(2)} USD
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default OpenPositionsView;
