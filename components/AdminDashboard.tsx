import React, { useState, useEffect } from 'react';
import { safeFetch } from '../src/lib/utils';
import { Key, Plus, Trash2, Smartphone, Shield, Clock, RefreshCw } from 'lucide-react';

export const AdminDashboard: React.FC<{ session: any, initialTab?: 'keys' | 'users' | 'logs' }> = ({ session, initialTab }) => {
  const [keys, setKeys] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [planType, setPlanType] = useState('Starter');
  const [activeTab, setActiveTab] = useState<'keys' | 'users' | 'logs'>(initialTab || 'keys');
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

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

  useEffect(() => {
    if (activeTab === 'keys') fetchKeys();
    else if (activeTab === 'users') fetchUsers();
    else fetchLogs();
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
        navigator.clipboard.writeText(res.key);
        alert(`New Unassigned Key Generated and Copied: ${res.key}\n\nYou can now send this key to a user for activation.`);
      }
      fetchKeys();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const approveUser = async (targetUserId: string) => {
    if (!confirm('Generate a new Access Key bound to this email account? This will grant immediate access.')) return;
    try {
      setLoadingUsers(true);
      const res = await safeFetch('/api/admin/approve-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ targetUserId, planType })
      });
      if (res.message) alert(res.message);
      await Promise.all([fetchUsers(), fetchKeys()]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingUsers(false);
    }
  };

  const suspendKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to suspend this key? This will revoke access for the bound email account.')) return;
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
    if (!confirm('Are you sure you want to renew this subscription for 30 days?')) return;
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
            <Shield className="w-6 h-6 sm:w-8 h-8 text-emerald-500" />
            Admin Control Panel
          </h2>
          <div className="flex flex-wrap gap-4 mt-4 items-center">
             <div className="flex gap-2">
                <button 
                  onClick={() => setActiveTab('keys')}
                  className={`px-3 py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'keys' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  Manage Keys
                </button>
                <button 
                  onClick={() => setActiveTab('users')}
                  className={`px-3 py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'users' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  Manage Users
                </button>
                <button 
                  onClick={() => setActiveTab('logs')}
                  className={`px-3 py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'logs' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  Admin Logs
                </button>
             </div>
             <button 
               onClick={activeTab === 'keys' ? fetchKeys : activeTab === 'users' ? fetchUsers : fetchLogs}
               className="p-2 hover:bg-white/5 rounded-lg text-slate-500 hover:text-white transition-all"
               title="Refresh List"
             >
               <RefreshCw className={`w-4 h-4 ${(loading || loadingUsers) ? 'animate-spin' : ''}`} />
             </button>
          </div>
        </div>
        <div className="flex gap-4 items-center w-full md:w-auto justify-between md:justify-end">
          <div className="flex flex-col items-start md:items-end w-full md:w-auto">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Select Plan Level</span>
            <select 
                value={planType} 
                onChange={(e) => setPlanType(e.target.value)}
                className="bg-slate-900 border border-white/10 text-white rounded-lg px-4 py-2 uppercase tracking-widest text-sm focus:outline-none focus:border-emerald-500 appearance-none min-w-[120px] w-full md:w-auto"
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
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-lg font-bold uppercase tracking-widest text-sm transition-all flex items-center gap-2 disabled:opacity-50 mt-4"
            >
                {generating ? 'Generating...' : <><Plus className="w-4 h-4" /> Generate Key</>}
            </button>
          )}
        </div>
      </div>

      {error && <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 p-4 rounded-lg mb-6 text-sm">{error}</div>}

      <div className="bg-slate-900/50 border border-white/5 rounded-xl overflow-x-auto overflow-y-hidden backdrop-blur-xl custom-scrollbar">
        {activeTab === 'keys' ? (
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-800/50 border-b border-white/5 text-slate-400 uppercase tracking-widest text-[10px]">
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
                    <td className="px-6 py-4 font-mono text-emerald-400 font-bold text-xs tracking-tighter flex items-center gap-2">
                        <span className="truncate max-w-[120px]" title={k.access_key}>{k.access_key}</span>
                        <button 
                            onClick={() => {
                                navigator.clipboard.writeText(k.access_key);
                                alert('Key copied to clipboard');
                            }}
                            className="p-1 hover:bg-white/10 rounded transition-colors"
                            title="Copy Key"
                        >
                            <Key className="w-3 h-3 text-slate-500 hover:text-emerald-400" />
                        </button>
                    </td>
                    <td className="px-6 py-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border bg-slate-500/10 text-slate-400 border-slate-500/20">
                            Pre-Assigned
                        </span>
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      <span className="truncate max-w-[180px] block font-medium" title={k.email}>{k.email}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-[0.1em] ${
                        !k.used ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                        'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                      }`}>
                        {k.used ? 'Used' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400 flex items-center gap-2 text-xs">
                       <Clock className="w-3 h-3" /> {new Date(k.expires_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        {k.used && (
                          <button 
                            onClick={() => renewSubscription(k.id)}
                            className="text-[10px] uppercase tracking-widest text-emerald-400 hover:text-emerald-300 font-bold border border-emerald-400/20 rounded px-2 py-1 transition-all hover:bg-emerald-400/5"
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
        ) : (
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-800/50 border-b border-white/5 text-slate-400 uppercase tracking-widest text-[10px]">
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
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500 italic font-medium">Scanning identity service...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500 italic font-medium">No registered users yet.</td></tr>
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
                            <div className="flex items-center gap-2 font-mono text-[10px] text-emerald-400 font-bold">
                                <span>{u.access_key}</span>
                                <button 
                                    onClick={() => {
                                        navigator.clipboard.writeText(u.access_key);
                                        alert('Key copied to clipboard');
                                    }}
                                    className="p-1 hover:bg-white/10 rounded transition-colors"
                                >
                                    <Key className="w-3 h-3 text-slate-500 hover:text-emerald-400" />
                                </button>
                            </div>
                        ) : (
                            <span className="text-slate-600 text-[10px] italic">No Key</span>
                        )}
                    </td>
                    <td className="px-6 py-4">
                      {u.has_access ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
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
                                onClick={() => approveUser(u.id)}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-900/20"
                            >
                                Generate Key ({planType})
                            </button>
                        ) : (
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => {
                                        if (confirm('Renew this users subscription for 30 days?')) {
                                            safeFetch('/api/admin/renew-subscription', {
                                                method: 'POST',
                                                headers: {
                                                    'Content-Type': 'application/json',
                                                    'Authorization': `Bearer ${session?.access_token}`
                                                },
                                                body: JSON.stringify({ userId: u.id })
                                            }).then(() => fetchUsers()).catch(err => setError(err.message));
                                        }
                                    }}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-widest transition-all shadow-lg"
                                >
                                    Renew
                                </button>
                                <button 
                                    onClick={() => approveUser(u.id)}
                                    className="text-slate-500 hover:text-white border border-white/10 px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-widest transition-all"
                                >
                                    Change Plan
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
        )}

        {activeTab === 'logs' && (
          <div className="bg-slate-900 shadow-xl overflow-hidden rounded-xl border border-white/5">
            <div className="p-4 border-b border-white/5 flex justify-between items-center text-[10px] font-black uppercase tracking-[0.2em]">
              <span className="text-slate-500">Operation Audit Trail</span>
              {loadingLogs && <RefreshCw className="w-3 h-3 animate-spin text-indigo-500" />}
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
                          <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-black uppercase text-[9px] tracking-widest border border-indigo-500/20">
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
        )}
      </div>
    </div>
  );
};
