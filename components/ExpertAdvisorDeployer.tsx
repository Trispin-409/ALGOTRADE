import React, { useState, useEffect } from 'react';
import { TradingAccount } from '../types';
import { safeFetch } from '../src/lib/utils';
import { Terminal, Upload, Play, Loader2, CheckCircle, AlertCircle, RefreshCw, Key, ShieldAlert } from 'lucide-react';

interface ExpertAdvisorDeployerProps {
  accounts: TradingAccount[];
  availableBrokerSymbols?: string[];
  token?: string;
}

const ExpertAdvisorDeployer: React.FC<ExpertAdvisorDeployerProps> = ({ accounts, availableBrokerSymbols = [], token }) => {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [accessKeyInput, setAccessKeyInput] = useState('');
  const [accessError, setAccessError] = useState(false);

  const [status, setStatus] = useState<'idle' | 'deploying' | 'success' | 'error'>('idle');
  const [eaName, setEaName] = useState('MyCustomEA');
  const [accountId, setAccountId] = useState('');
  const [lotSize, setLotSize] = useState<number>(0.1);
  const [maxPositions, setMaxPositions] = useState<number>(1);
  const [eaFile, setEaFile] = useState<File | null>(null);
  const [symbol, setSymbol] = useState('XAUUSD');
  const [period, setPeriod] = useState('15m');
  const [log, setLog] = useState<string[]>([]);

  // Auto-set symbol to first available or mapped variant if possible
  useEffect(() => {
    if (availableBrokerSymbols.length > 0) {
      const mapped = availableBrokerSymbols.find(s => s.startsWith('XAUUSD'));
      if (mapped) setSymbol(mapped);
    }
  }, [availableBrokerSymbols]);

  const addLog = (msg: string) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    const correctKey = import.meta.env.VITE_SYSTEM_LOG || 'vite system log';
    if (accessKeyInput === correctKey) {
      setIsUnlocked(true);
      setAccessError(false);
    } else {
      setAccessError(true);
      setAccessKeyInput('');
    }
  };

  const handleDeploy = async () => {
    if (!accountId) { alert("Select an account."); return; }
    const acc = accounts.find(a => a.id === accountId);
    if (acc && acc.connectionStatus !== 'CONNECTED') {
      alert(`Terminal ${acc.login} is NOT CONNECTED to the broker. Please verify your credentials and server name first.`);
      return;
    }
    if (!eaFile) { alert("Upload EA file."); return; }
    
    // Cloud Execution Requirement: Warn if not using compiled .ex4
    if (eaFile.name.toLowerCase().endsWith('.mq4')) {
      const proceed = window.confirm("WARNING: You are uploading a source code file (.mq4). Cloud terminals strictly require compiled binaries (.ex4) to execute. If this EA is for cloud hosting, it may fail to start. Continue anyway?");
      if (!proceed) return;
    }

      setStatus('deploying');
      setLog([]);
      addLog(`Initiating fresh deployment for ${eaName}...`);

      try {
        // LAYER 2: FRESH START - The server now handles extraction automatically during definition creation
        addLog(`Synchronizing Cloud Hub: Extracting existing EAs & setting definition for ${eaName}...`);
        await safeFetch(`/api/account/${accountId}/ea/${eaName}`, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            symbol: symbol,
            period: period,
            inputs: {
              LotSize: lotSize,
              MaxPositions: maxPositions
            }
          })
        });
        addLog(`Success: Remote terminal cleared and ${eaName} definition registered.`);

      // 3. Upload EA File via SDK Synchronizer
      addLog(`Reading EA file...`);
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(eaFile);
      });

      addLog(`Uploading EA file to cloud via SDK: ${eaFile.name}...`);
      await safeFetch(`/api/account/${accountId}/ea/${eaName}/file`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          fileBase64
        })
      });
      addLog(`EA file uploaded successfully.`);

      // 4. Redeploy Account via SDK Synchronizer
      addLog(`Requesting SDK cloud redeployment...`);
      await safeFetch(`/api/account/${accountId}/redeploy`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      addLog(`Account redeployed. EA is now running in the cloud.`);

      setStatus('success');
      addLog(`SUCCESS: ${eaName} deployed and running on cloud terminal.`);
    } catch (err: any) {
      setStatus('error');
      addLog(`FATAL: ${err.message}`);
    }
  };

  if (!isUnlocked) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 sm:p-8 animate-in fade-in duration-500 w-full">
        <div className="w-full max-w-md glowing-panel p-8 sm:p-12 rounded-[40px] shadow-2xl relative overflow-hidden text-center bg-black/60">
          <div className="absolute top-0 right-0 w-32 h-32 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2 opacity-20" style={{ backgroundColor: 'var(--accent-color)' }}></div>
          
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner border border-white/10 bg-black/40 accent-glow" style={{ color: 'var(--accent-color)' }}>
            <ShieldAlert className="w-10 h-10" />
          </div>
          
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">Restricted Access</h2>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-8">System terminal requires authorization</p>
          
          <form onSubmit={handleUnlock} className="space-y-6">
            <div className="relative">
              <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 opacity-50" style={{ color: 'var(--accent-color)' }} />
              <input 
                type="password" 
                value={accessKeyInput}
                onChange={(e) => setAccessKeyInput(e.target.value)}
                placeholder="ACCESS KEY" 
                className="w-full bg-black/50 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-center text-white font-mono text-sm uppercase tracking-widest outline-none focus:border-white transition-all placeholder:text-slate-700"
              />
            </div>
            
            {accessError && (
              <p className="text-rose-500 text-[10px] font-black uppercase tracking-widest animate-pulse">Invalid Authorization</p>
            )}
            
            <button 
              type="submit" 
              className="w-full py-4 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95"
              style={{ backgroundColor: 'var(--accent-color)', boxShadow: '0 4px 12px -2px var(--accent-color-rgb)' }}
            >
              Authenticate
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
      <div className="glowing-panel rounded-[30px] p-6 sm:p-10 shadow-2xl bg-black/40">
        <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mb-8">System Terminal Deployer</h2>
        
        <div className="space-y-6">
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Target Account</label>
            <select 
              value={accountId} 
              onChange={(e) => setAccountId(e.target.value)} 
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-white outline-none focus:border-white text-sm font-bold appearance-none transition-colors"
            >
              <option value="">Select Account</option>
              {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} ({acc.login})</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Expert Advisor Name</label>
            <input 
              type="text" 
              value={eaName} 
              onChange={(e) => setEaName(e.target.value)} 
              placeholder="e.g. MyStrategyV1"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-white outline-none focus:border-white text-sm font-bold transition-colors"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">EA File (Compiled .ex4/.ex5 Required)</label>
            <input 
              type="file" 
              accept=".ex4,.ex5,.mq4"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setEaFile(file);
                if (file) {
                  // Default EA name to filename without extension
                  const baseName = file.name.replace(/\.[^/.]+$/, "");
                  setEaName(baseName);
                }
              }}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-white outline-none focus:border-white text-sm font-bold transition-colors file:bg-white/5 file:border-0 file:rounded-full file:text-[10px] file:text-white file:font-black file:uppercase file:px-4 file:py-2 file:mr-4"
            />
            <p className="text-[9px] text-slate-600 mt-2 font-mono italic">Note: Cloud strictly executes compiled binaries. EA internal parameters will be used.</p>
          </div>


          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button 
              onClick={handleDeploy}
              disabled={status === 'deploying'}
              className="py-5 rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-widest flex items-center justify-center gap-2 sm:gap-4 text-white transition-all disabled:opacity-50 active:scale-95"
              style={{ backgroundColor: 'var(--accent-color)', boxShadow: '0 4px 12px -2px var(--accent-color-rgb)' }}
            >
              {status === 'deploying' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
              {status === 'deploying' ? 'Deploying...' : 'Deploy EA'}
            </button>

            <button 
              onClick={async () => {
                if (!accountId) return alert("Select account");
                if (window.confirm("Wipe all expert advisors from the cloud terminal? This is irreversible.")) {
                  setStatus('deploying');
                  addLog("Initiating Cloud Wipe...");
                  try {
                    // We call the PUT endpoint with dummy data but it triggers the internal cleanup
                     await safeFetch(`/api/account/${accountId}/ea/cleanup`, { 
                       method: 'DELETE',
                        headers: token ? { Authorization: `Bearer ${token}` } : {}
                     });
                     addLog("SUCCESS: Remote terminal wiped clean.");
                     setStatus('success');
                  } catch (e: any) {
                    addLog(`FAIL: ${e.message}`);
                    setStatus('error');
                  }
                }
              }}
              className="py-5 rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-widest flex items-center justify-center gap-2 sm:gap-4 bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all active:scale-95"
            >
              <RefreshCw className="w-5 h-5" />
              Wipe Terminal
            </button>
          </div>
        </div>
      </div>

      <div className="glowing-panel rounded-[30px] p-6 sm:p-8 h-48 sm:h-64 overflow-y-auto font-mono text-[9px] sm:text-[10px] text-slate-400 custom-scrollbar bg-black/60">
        <div className="flex items-center gap-2 mb-4">
          <Terminal className="w-4 h-4" style={{ color: 'var(--accent-color)' }} />
          <div className="font-black tracking-widest uppercase opacity-50" style={{ color: 'var(--accent-color)' }}>Deployment Trace</div>
        </div>
        {log.map((line, i) => <div key={i} className="mb-1">{line}</div>)}
      </div>
    </div>
  );
};

export default ExpertAdvisorDeployer;
