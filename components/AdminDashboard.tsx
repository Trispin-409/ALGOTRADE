import React, { useState, useEffect } from 'react';
import { safeFetch } from '../src/lib/utils';
import { Key, Plus, Trash2, Smartphone, Shield, Clock, RefreshCw } from 'lucide-react';

export const AdminDashboard: React.FC<{ session: any, initialTab?: 'keys' | 'users' | 'logs' | 'ai' }> = ({ session, initialTab }) => {
  const [keys, setKeys] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [planType, setPlanType] = useState('Starter');
  const [activeTab, setActiveTab] = useState<'keys' | 'users' | 'logs' | 'ai'>(initialTab || 'keys');
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const [aiStats, setAiStats] = useState<any | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const data = await safeFetch('/api/admin/keys', {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });
      setKeys(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const data = await safeFetch('/api/admin/users', {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });
      setUsers(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const data = await safeFetch('/api/admin/audit-logs', {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });
      setAuditLogs(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingLogs(false);
    }
  };

  const fetchAiStats = async () => {
    setLoadingAi(true);
    try {
      const data = await safeFetch('/api/admin/ai-analytics', {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });
      if (data.success && data.stats) {
        setAiStats(data.stats);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingAi(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'keys') fetchKeys();
    else if (activeTab === 'users') fetchUsers();
    else if (activeTab === 'logs') fetchLogs();
    else fetchAiStats();
  }, [session, activeTab]);

  const generateKey = async () => {
    setGenerating(true);
    try {
      const res = await safeFetch('/api/admin/generate-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ planType })
      });
      if (res.key) {
        try {
          await navigator.clipboard.writeText(res.key);
          alert(`New Unassigned Key Generated and Copied: ${res.key}\n\nYou can now send this key to a user for activation.`);
        } catch (e) {
          alert(`New Unassigned Key Generated: ${res.key}\n\nPlease copy this key manually.`);
        }
      }
      fetchKeys();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const generateUserKey = async (targetUserId: string) => {
    try {
      setLoadingUsers(true);
      setError(null);
      const res = await safeFetch('/api/admin/approve-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ targetUserId, planType })
      });
      // Don't rely on alert since it might be blocked. Just fetch users so the key shows up.
      await Promise.all([fetchUsers(), fetchKeys()]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingUsers(false);
    }
  };

  const suspendKey = async (keyId: string) => {
    try {
      await safeFetch('/api/admin/suspend-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ keyId })
      });
      fetchKeys();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const renewSubscription = async (keyId: string) => {
    try {
      await safeFetch('/api/admin/renew-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ keyId })
      });
      fetchKeys();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto text-slate-200">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b border-white/10 pb-6 gap-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-widest flex items-center gap-3">
            <Shield className="w-6 h-6 sm:w-8 h-8" style={{ color: 'var(--accent-color)' }} />
            Admin Control Panel
          </h2>
          <div className="flex flex-wrap gap-4 mt-4 items-center">
             <div className="flex gap-2">
                <button 
                  onClick={() => setActiveTab('keys')}
                  className={`px-3 py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'keys' ? 'text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                  style={activeTab === 'keys' ? { backgroundColor: 'var(--accent-color)', boxShadow: '0 4px 12px -2px var(--accent-color-rgb)' } : {}}
                >
                  Manage Keys
                </button>
                <button 
                  onClick={() => setActiveTab('users')}
                  className={`px-3 py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'users' ? 'text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                  style={activeTab === 'users' ? { backgroundColor: 'var(--accent-color)', boxShadow: '0 4px 12px -2px var(--accent-color-rgb)' } : {}}
                >
                  Manage Users
                </button>
                <button 
                  onClick={() => setActiveTab('logs')}
                  className={`px-3 py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'logs' ? 'text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                  style={activeTab === 'logs' ? { backgroundColor: 'var(--accent-color)', boxShadow: '0 4px 12px -2px var(--accent-color-rgb)' } : {}}
                >
                  Admin Logs
                </button>
                <button 
                  onClick={() => setActiveTab('ai')}
                  className={`px-3 py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'ai' ? 'text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                  style={activeTab === 'ai' ? { backgroundColor: 'var(--accent-color)', boxShadow: '0 4px 12px -2px var(--accent-color-rgb)' } : {}}
                >
                  AI Analytics
                </button>
             </div>
             <button 
               onClick={activeTab === 'keys' ? fetchKeys : activeTab === 'users' ? fetchUsers : activeTab === 'logs' ? fetchLogs : fetchAiStats}
               className="p-2 hover:bg-white/5 rounded-lg text-slate-500 hover:text-white transition-all"
               title="Refresh List"
             >
               <RefreshCw className={`w-4 h-4 ${(loading || loadingUsers || loadingAi) ? 'animate-spin' : ''}`} />
             </button>
          </div>
        </div>
        <div className="flex gap-4 items-center w-full md:w-auto justify-between md:justify-end">
          <div className="flex flex-col items-start md:items-end w-full md:w-auto">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Select Plan Level</span>
            <select 
                value={planType} 
                onChange={(e) => setPlanType(e.target.value)}
                className="bg-black/40 border border-white/10 text-white rounded-lg px-4 py-2 uppercase tracking-widest text-sm focus:outline-none focus:border-white transition-colors appearance-none min-w-[120px] w-full md:w-auto"
            >
                <option value="Starter">Starter</option>
                <option value="Pro">Pro</option>
                <option value="Elite">Elite</option>
            </select>
          </div>
          {activeTab === 'keys' && (
            <button 
                onClick={generateKey}
                disabled={generating}
                className="text-white px-6 py-2.5 rounded-lg font-bold uppercase tracking-widest text-sm transition-all flex items-center gap-2 disabled:opacity-50 mt-4 active:scale-95"
                style={{ backgroundColor: 'var(--accent-color)', boxShadow: '0 4px 12px -2px var(--accent-color-rgb)' }}
            >
                {generating ? 'Generating...' : <><Plus className="w-4 h-4" /> Generate Key</>}
            </button>
          )}
        </div>
      </div>

      {error && <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 p-4 rounded-lg mb-6 text-sm">{error}</div>}

      <div className="glowing-panel rounded-xl overflow-x-auto overflow-y-hidden backdrop-blur-xl custom-scrollbar border-white/5 bg-black/60">
        {activeTab === 'keys' ? (
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-black/40 border-b border-white/5 text-slate-400 uppercase tracking-widest text-[10px]">
              <tr>
                <th className="px-6 py-4 font-black">Key</th>
                <th className="px-6 py-4 font-black">Plan</th>
                <th className="px-6 py-4 font-black">User Details</th>
                <th className="px-6 py-4 font-black">Status</th>
                <th className="px-6 py-4 font-black">Expires</th>
                <th className="px-6 py-4 text-right font-black">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500 italic">Synchronizing database...</td></tr>
              ) : keys.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500 italic">No access keys found.</td></tr>
              ) : (
                keys.map(k => (
                  <tr key={k.id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-6 py-4 font-mono font-bold text-xs tracking-tighter flex items-center gap-2">
                        <span className="truncate max-w-[120px]" title={k.access_key} style={{ color: 'var(--accent-color)' }}>{k.access_key}</span>
                        <button 
                            onClick={() => {
                                navigator.clipboard.writeText(k.access_key);
                                alert('Key copied to clipboard');
                            }}
                            className="p-1 hover:bg-white/10 rounded transition-colors"
                            title="Copy Key"
                        >
                            <Key className="w-3 h-3 text-slate-500 hover:text-white" />
                        </button>
                    </td>
                    <td className="px-6 py-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border border-white/10 bg-white/5 text-slate-400">
                            {k.plan || 'Starter'}
                        </span>
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      <span className="truncate max-w-[180px] block font-medium" title={k.email}>{k.email === 'unassigned@local' ? 'Unassigned' : k.email}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-[0.1em] border ${
                        !k.used ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                        'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                      }`}>
                        {k.used ? 'Used' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400 flex items-center gap-2 text-xs">
                       <Clock className="w-3 h-3" /> {k.expires_at ? new Date(k.expires_at).toLocaleDateString() : 'Upon Activation'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        {k.used && (
                          <button 
                            onClick={() => renewSubscription(k.id)}
                            className="text-[10px] uppercase tracking-widest hover:opacity-80 font-black border border-white/10 rounded px-3 py-1.5 transition-all text-white bg-white/5"
                            style={{ backgroundColor: 'var(--accent-color-rgb)' }}
                          >
                            Renew
                          </button>
                        )}
                        <button 
                          onClick={() => suspendKey(k.id)}
                          className="text-[10px] uppercase tracking-widest text-rose-400 hover:text-rose-300 font-bold border border-rose-400/20 rounded px-2 py-1 flex items-center gap-1 transition-all hover:bg-rose-400/5"
                        >
                          <Trash2 className="w-3 h-3" /> Revoke
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : activeTab === 'users' ? (
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-black/40 border-b border-white/5 text-slate-400 uppercase tracking-widest text-[10px]">
              <tr>
                <th className="px-6 py-4 font-black">User Email</th>
                <th className="px-6 py-4 font-black">Account Created</th>
                <th className="px-6 py-4 font-black">Last Active</th>
                <th className="px-6 py-4 font-black">Key</th>
                <th className="px-6 py-4 font-black">Plan Status</th>
                <th className="px-6 py-4 text-right font-black">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loadingUsers ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500 italic font-medium">Scanning identity service...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500 italic font-medium">No registered users yet.</td></tr>
              ) : (
                users.map(u => (
                  <tr key={u.id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-6 py-4 font-bold text-white tracking-tight">{u.email}</td>
                    <td className="px-6 py-4 text-slate-400 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-slate-400 text-xs">
                        {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-6 py-4">
                        {u.access_key ? (
                            <div className="flex items-center gap-2 font-mono text-[10px] font-bold" style={{ color: 'var(--accent-color)' }}>
                                <span>{u.access_key}</span>
                                <button 
                                    onClick={() => {
                                        navigator.clipboard.writeText(u.access_key);
                                        alert('Key copied to clipboard');
                                    }}
                                    className="p-1 hover:bg-white/10 rounded transition-colors"
                                >
                                    <Key className="w-3 h-3 text-slate-500 hover:text-white" />
                                </button>
                            </div>
                        ) : (
                            <span className="text-slate-600 text-[10px] italic">No Key</span>
                        )}
                    </td>
                    <td className="px-6 py-4">
                      {u.has_access ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-white/5 text-white border border-white/10" style={{ color: 'var(--accent-color)' }}>
                          {u.plan} Active
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-slate-500/10 text-slate-500 border border-slate-500/20">
                          No Active Plan
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!u.has_access ? (
                            <button 
                                onClick={() => generateUserKey(u.id)}
                                className="text-white px-4 py-1.5 rounded text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95"
                                style={{ backgroundColor: 'var(--accent-color)', boxShadow: '0 4px 12px -2px var(--accent-color-rgb)' }}
                            >
                                Generate Key ({planType})
                            </button>
                        ) : (
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => {
                                        safeFetch('/api/admin/renew-subscription', {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json',
                                                'Authorization': `Bearer ${session?.access_token}`
                                            },
                                            body: JSON.stringify({ userId: u.id })
                                        }).then(() => fetchUsers()).catch(err => setError(err.message));
                                    }}
                                    className="text-white px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95"
                                    style={{ backgroundColor: 'var(--accent-color)', boxShadow: '0 4px 12px -2px var(--accent-color-rgb)' }}
                                >
                                    Renew
                                </button>
                                <button 
                                    onClick={() => generateUserKey(u.id)}
                                    className="text-slate-500 hover:text-white border border-white/10 px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
                                >
                                    Regenerate Key
                                </button>
                            </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : activeTab === 'logs' ? (
          <div className="bg-black/20 shadow-xl overflow-hidden rounded-xl border-white/5 font-mono">
            <div className="p-4 border-b border-white/5 flex justify-between items-center text-[10px] font-black uppercase tracking-[0.2em]">
              <span className="text-slate-500">Operation Audit Trail</span>
              {loadingLogs && <RefreshCw className="w-3 h-3 animate-spin" style={{ color: 'var(--accent-color)' }} />}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-black/50 text-slate-500 uppercase font-bold text-[9px] tracking-widest border-b border-white/5">
                  <tr>
                    <th className="px-6 py-4">Timestamp</th>
                    <th className="px-6 py-4">Action</th>
                    <th className="px-6 py-4">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-10 text-center text-slate-600 font-mono italic">No audit records found</td>
                    </tr>
                  ) : (
                    auditLogs.map((log: any) => (
                      <tr key={log.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 text-[10px] text-slate-400">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 rounded bg-white/5 font-black uppercase text-[9px] tracking-widest border border-white/10" style={{ color: 'var(--accent-color)' }}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-6 py-4 space-y-1">
                          <code className="text-[9px] text-slate-300 block max-w-lg overflow-x-auto">
                            {JSON.stringify(log.details)}
                          </code>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-6 bg-slate-950/40 border border-white/5 rounded-2xl">
            <h3 className="text-sm font-black font-mono uppercase tracking-widest text-emerald-400">
              Chatrade AI Infrastructure & Quota Analytics
            </h3>
            
            {loadingAi ? (
              <div className="p-10 font-mono text-center text-xs text-slate-500 animate-pulse">
                AGGREGATING REAL-TIME USAGE METRICS...
              </div>
            ) : aiStats ? (
              <div className="space-y-6 text-slate-300">
                
                {/* 1. Global Metrics Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-black/40 border border-white/5 rounded-xl space-y-1">
                    <span className="text-[9px] font-mono text-slate-400 uppercase">Estimated Gemini API Cost</span>
                    <p className="text-xl font-black font-mono text-white">${(aiStats.totalCost || 0).toFixed(6)} USD</p>
                  </div>
                  <div className="p-4 bg-black/40 border border-white/5 rounded-xl space-y-1">
                    <span className="text-[9px] font-mono text-slate-400 uppercase">Active Subscriptions</span>
                    <div className="flex gap-2 text-[10px] font-mono mt-1">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">STARTER: {aiStats.planCounts?.STARTER || 0}</span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500">PRO: {aiStats.planCounts?.PRO || 0}</span>
                      <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-455">ELITE: {aiStats.planCounts?.ELITE || 0}</span>
                    </div>
                  </div>
                  <div className="p-4 bg-black/40 border border-white/5 rounded-xl space-y-1">
                    <span className="text-[9px] font-mono text-slate-400 uppercase">Total Logged AI Requests</span>
                    <p className="text-xl font-black font-mono text-emerald-400">{aiStats.recentLogs?.length || 0} calls</p>
                  </div>
                </div>

                {/* 2. Top Resource Consumers */}
                <div className="space-y-2">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block font-bold">Highest Resource Consumers</span>
                  <div className="border border-white/5 rounded-xl overflow-hidden bg-black/20 text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-black/50 text-slate-500 text-[9px] tracking-widest uppercase border-b border-white/5 font-mono">
                        <tr>
                          <th className="px-5 py-3">Trader Email</th>
                          <th className="px-5 py-3">Active Plan</th>
                          <th className="px-5 py-3 text-center">Light Chats</th>
                          <th className="px-5 py-3 text-center">Deep Analyses</th>
                          <th className="px-5 py-3 text-right">Est. Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-mono">
                        {(!aiStats.highestConsumers || aiStats.highestConsumers.length === 0) ? (
                          <tr><td colSpan={5} className="px-5 py-4 text-center text-slate-500 italic">No usage recorded</td></tr>
                        ) : (
                          aiStats.highestConsumers.map((c: any, index: number) => (
                            <tr key={index} className="hover:bg-white/5 transition-colors">
                              <td className="px-5 py-3 font-semibold text-white">{c.email}</td>
                              <td className="px-5 py-3">
                                <span className="px-2 py-0.5 rounded text-[9px] bg-slate-800 border border-white/10">{c.plan || 'STARTER'}</span>
                              </td>
                              <td className="px-5 py-3 text-center text-slate-400">{c.chats || 0}</td>
                              <td className="px-5 py-3 text-center text-slate-400">{c.deeps || 0}</td>
                              <td className="px-5 py-3 text-right text-emerald-400">${(c.cost || 0).toFixed(5)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 3. Model Utilization */}
                <div className="space-y-2 pt-2">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block font-bold">LLM Model Distribution</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                    {Object.entries(aiStats.modelsUsed || {}).map(([model, count]: any) => (
                      <div key={model} className="p-3 bg-black/20 border border-white/5 rounded-lg flex justify-between items-center">
                        <span className="truncate text-slate-400 text-[10px]" title={model}>{model}</span>
                        <span className="text-white font-extrabold">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. Recent AI Transaction Logs */}
                <div className="space-y-2 pt-2">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block font-bold">Recent AI Transaction Logs</span>
                  <div className="border border-white/5 rounded-xl overflow-hidden bg-black/30 max-h-60 overflow-y-auto">
                    <table className="w-full text-left font-mono text-[10px] text-slate-300">
                      <thead className="bg-black/80 text-slate-500 font-bold tracking-wider uppercase border-b border-white/5 animate-pulse">
                        <tr>
                          <th className="px-4 py-3">Time</th>
                          <th className="px-4 py-3">Trader</th>
                          <th className="px-4 py-3 text-center">Mode</th>
                          <th className="px-4 py-3 text-center">Status</th>
                          <th className="px-4 py-3">Model</th>
                          <th className="px-4 py-3 text-right">Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {(!aiStats.recentLogs || aiStats.recentLogs.length === 0) ? (
                          <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500 italic">No recent AI transactions logged.</td></tr>
                        ) : (
                          aiStats.recentLogs.map((log: any, idx: number) => (
                            <tr key={idx} className="hover:bg-white/5 transition-all">
                              <td className="px-4 py-2.5 text-slate-400">{new Date(log.timestamp).toLocaleTimeString()}</td>
                              <td className="px-4 py-2.5 font-bold text-white max-w-[120px] truncate" title={log.email}>{log.email}</td>
                              <td className="px-4 py-2.5 text-center">
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${log.mode === 'DEEP' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/25' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'}`}>
                                  {log.mode}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${log.success ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/15'}`}>
                                  {log.success ? 'SUCCESS' : 'FALLBACK'}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-slate-400 truncate max-w-[100px]" title={log.modelUsed}>{log.modelUsed}</td>
                              <td className="px-4 py-2.5 text-right text-emerald-400 font-bold">${(log.estimatedCost || 0).toFixed(5)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            ) : (
              <div className="p-8 text-center text-xs font-mono text-slate-500 italic">
                Failed to load systemic AI usage statistics.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
