
import React, { useEffect, useRef, useState } from 'react';
import { Terminal, AlertCircle, Cpu, Activity, Zap, ShieldAlert, Globe, Database, Loader2, Lock as LockIcon } from 'lucide-react';

interface SystemMonitorProps {
  logs: string[];
  isAuthValid: boolean | null;
  lastError: string | null;
  sdkStatus: 'CONNECTED' | 'RECONNECTING' | 'DEGRADED' | 'OFFLINE' | 'BOOTING' | 'SYNCING';
  onLock: () => void;
}

const SystemMonitor: React.FC<SystemMonitorProps> = ({ logs, isAuthValid, lastError, sdkStatus, onLock }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [safeToken, setSafeToken] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/token')
      .then(res => res.json())
      .then(data => setSafeToken(data.token))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [logs]);

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full overflow-x-hidden">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-slate-900/40 border border-white/5 p-6 sm:p-8 rounded-[30px] sm:rounded-[40px] shadow-2xl backdrop-blur-md flex items-center gap-4 sm:gap-6 overflow-hidden">
          <div className="w-10 h-10 sm:w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20 shrink-0">
            <Globe className="text-indigo-400 w-5 h-5 sm:w-6 h-6" />
          </div>
          <div className="truncate">
            <p className="text-[8px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 truncate">Cluster</p>
            <h4 className="text-base sm:text-xl font-black text-white tracking-tighter uppercase truncate">London v1</h4>
          </div>
        </div>
        <div className="bg-slate-900/40 border border-white/5 p-6 sm:p-8 rounded-[30px] sm:rounded-[40px] shadow-2xl backdrop-blur-md flex items-center gap-4 sm:gap-6 overflow-hidden">
          <div className={`w-10 h-10 sm:w-12 h-12 rounded-2xl flex items-center justify-center border shrink-0 ${
            sdkStatus === 'CONNECTED' ? 'bg-emerald-500/10 border-emerald-500/20' :
            sdkStatus === 'BOOTING' ? 'bg-indigo-500/10 border-indigo-500/20 animate-pulse' :
            sdkStatus === 'SYNCING' ? 'bg-blue-500/10 border-blue-500/20' :
            sdkStatus === 'RECONNECTING' ? 'bg-amber-500/10 border-amber-500/20' : 'bg-rose-500/10 border-rose-500/20'
          }`}>
            <Database className={`${
              sdkStatus === 'CONNECTED' ? 'text-emerald-400' :
              sdkStatus === 'BOOTING' ? 'text-indigo-400' :
              sdkStatus === 'SYNCING' ? 'text-blue-400' :
              sdkStatus === 'RECONNECTING' ? 'text-amber-400' : 'text-rose-400'
            } w-5 h-5 sm:w-6 h-6 ${sdkStatus === 'SYNCING' ? 'animate-spin-slow' : ''}`} />
          </div>
          <div className="truncate">
            <p className="text-[8px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 truncate">SDK Lifecycle</p>
            <h4 className={`text-base sm:text-xl font-black tracking-tighter uppercase truncate ${
              sdkStatus === 'CONNECTED' ? 'text-emerald-400' :
              sdkStatus === 'BOOTING' ? 'text-indigo-400' :
              sdkStatus === 'SYNCING' ? 'text-blue-400' :
              sdkStatus === 'RECONNECTING' ? 'text-amber-400' : 'text-rose-400'
            }`}>{sdkStatus === 'BOOTING' ? 'Initializing' : sdkStatus === 'SYNCING' ? 'Syncing' : sdkStatus}</h4>
          </div>
        </div>
        <div className="bg-slate-900/40 border border-white/5 p-6 sm:p-8 rounded-[30px] sm:rounded-[40px] shadow-2xl backdrop-blur-md flex items-center gap-4 sm:gap-6 overflow-hidden sm:col-span-2 lg:col-span-1">
          <div className="w-10 h-10 sm:w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20 shrink-0">
            <Zap className="text-amber-400 w-5 h-5 sm:w-6 h-6" />
          </div>
          <div className="truncate">
            <p className="text-[8px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 truncate">Auth Status</p>
            <h4 className="text-base sm:text-xl font-black text-white tracking-tighter uppercase truncate">{isAuthValid ? 'Verified' : 'Pending'}</h4>
          </div>
        </div>
      </div>

      <div className="bg-[#050505] border border-white/10 rounded-[30px] sm:rounded-[40px] overflow-hidden shadow-2xl flex flex-col h-[400px] sm:h-[600px] w-full">
        <div className="bg-slate-900/50 px-6 sm:px-8 py-4 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <Terminal className="w-3.5 h-3.5 sm:w-4 h-4 text-indigo-500 shrink-0" />
            <span className="text-[8px] sm:text-[10px] font-black text-indigo-400 uppercase tracking-widest truncate">Telemetry Trace</span>
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-4 overflow-hidden">
            <button 
              onClick={onLock}
              className="flex items-center gap-2 px-3 py-1 bg-rose-500/10 border border-rose-500/20 rounded-lg hover:bg-rose-500/20 transition-all group"
            >
              <LockIcon className="w-3 h-3 text-rose-500 group-hover:scale-110 transition-transform" />
              <span className="text-[8px] sm:text-[9px] font-black text-rose-500 uppercase tracking-widest">Lock Logs</span>
            </button>
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-[8px] sm:text-[9px] font-bold text-slate-500 uppercase">Live</span>
            </div>
          </div>
        </div>
        
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 sm:p-10 font-mono text-[10px] sm:text-[11px] leading-relaxed custom-scrollbar flex flex-col gap-1 bg-black/40"
        >
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 opacity-20">
              <Loader2 className="w-6 h-6 sm:w-8 h-8 animate-spin shrink-0" />
              <p className="uppercase tracking-[0.2em] sm:tracking-[0.5em] font-black text-[8px] sm:text-[9px] text-center px-4">Handshake in progress...</p>
            </div>
          ) : (
            logs.map((log, i) => {
              const isPatttern = log.includes('297291718') || log.includes('pattternsignaltrader');
              const isError = log.includes('ERROR') || log.includes('FATAL');
              const isSuccess = log.includes('SUCCESS');
              
              return (
                <div key={i} className={`flex items-start gap-3 sm:gap-4 animate-in slide-in-from-left-2 duration-300 py-1 sm:py-0.5 border-l-2 pl-3 sm:pl-4 transition-all ${
                  isPatttern ? 'border-amber-500/50 bg-amber-500/5' : 
                  isError ? 'border-rose-500/50 bg-rose-500/5' :
                  isSuccess ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-indigo-500/10'
                }`}>
                  <span className="text-slate-700 shrink-0 font-bold select-none text-[8px] sm:text-[10px] w-4">{i + 1}</span>
                  <p className={`${
                    isPatttern ? 'text-amber-400' :
                    isError ? 'text-rose-400' :
                    isSuccess ? 'text-emerald-400' : 'text-slate-400'
                  } break-all leading-tight`}>
                    {log}
                  </p>
                </div>
              );
            })
          )}
        </div>

        <div className="bg-slate-900/50 px-6 sm:px-8 py-3 sm:py-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between text-[7px] sm:text-[9px] font-black text-slate-600 uppercase tracking-widest gap-2 sm:gap-0 shrink-0">
          <div className="flex items-center gap-4 sm:gap-6 w-full sm:w-auto justify-between sm:justify-start">
            <span className="flex items-center gap-1.5">
              <Activity className="w-2.5 h-2.5 sm:w-3 h-3 text-indigo-500/50 shrink-0" />
              <span className="truncate">Synced</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="w-2.5 h-2.5 sm:w-3 h-3 text-indigo-500/50 shrink-0" />
              <span className="truncate">42ms Latency</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-indigo-500/30 truncate">
            <ShieldAlert className="w-2.5 h-2.5 sm:w-3 h-3 shrink-0" />
            <span className="truncate">TLS 1.3 Secure</span>
          </div>
        </div>
      </div>

      {lastError && (
        <div className="bg-rose-500/10 border border-rose-500/20 p-6 sm:p-8 rounded-[30px] sm:rounded-[40px] flex flex-col sm:flex-row items-start gap-4 sm:gap-6 animate-in zoom-in-95 duration-500 shadow-xl overflow-hidden">
          <div className="w-10 h-10 sm:w-12 h-12 bg-rose-500 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-rose-500/30">
            <AlertCircle className="text-white w-5 h-5 sm:w-6 h-6" />
          </div>
          <div className="space-y-1.5 sm:space-y-2 overflow-hidden">
            <h5 className="font-black text-rose-400 text-[10px] sm:text-sm uppercase tracking-widest truncate">Protocol Exception</h5>
            <p className="text-rose-200/60 font-mono text-[10px] sm:text-xs leading-relaxed break-all sm:break-normal">{lastError}</p>
          </div>
        </div>
      )}

      <div className="bg-slate-900/40 border border-white/5 p-6 sm:p-8 rounded-[30px] sm:rounded-[40px] shadow-2xl backdrop-blur-md space-y-6 w-full overflow-hidden">
        <div className="flex items-center justify-between">
          <h5 className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] sm:tracking-[0.3em] truncate">System Metadata</h5>
        </div>
        
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 font-mono text-[8px] sm:text-[10px]">
          <div className="p-3 sm:p-4 bg-black/40 rounded-xl sm:rounded-2xl border border-white/5 overflow-hidden">
            <p className="text-slate-600 mb-1 truncate">DRIVER</p>
            <p className="text-indigo-400 font-bold tracking-widest uppercase truncate">SDK-CORE</p>
          </div>
          <div className="p-3 sm:p-4 bg-black/40 rounded-xl sm:rounded-2xl border border-white/5 overflow-hidden">
            <p className="text-slate-600 mb-1 truncate">STRATEGY</p>
            <p className="text-white font-bold tracking-widest uppercase truncate">STREAM</p>
          </div>
          <div className="p-3 sm:p-4 bg-black/40 rounded-xl sm:rounded-2xl border border-white/5 overflow-hidden">
            <p className="text-slate-600 mb-1 truncate">EXPIRY</p>
            <p className="text-emerald-400 font-bold tracking-widest uppercase truncate">PERSIST</p>
          </div>
          <div className="p-3 sm:p-4 bg-black/40 rounded-xl sm:rounded-2xl border border-white/5 overflow-hidden">
            <p className="text-slate-600 mb-1 truncate">TERMINAL</p>
            <p className="text-indigo-400 font-bold tracking-widest uppercase truncate">{safeToken ? safeToken.slice(0, 8) : '...'}...</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemMonitor;
