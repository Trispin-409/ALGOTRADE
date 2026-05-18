
import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Users, ShieldAlert, Cpu, Database, Terminal, Key, X, Settings, Layers, Workflow, Cloud, MessageCircle, Download, Newspaper, Shield, LogOut, Copy } from 'lucide-react';
import { useStore } from '../src/store';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onTabChange?: (tab: string, subTab?: string) => void;
  subscriptionPlan?: string;
  licenseKey?: string;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, onTabChange, subscriptionPlan, licenseKey }) => {
  const [isLogsLocked, setIsLogsLocked] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  
  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    });

    window.addEventListener('appinstalled', () => {
      setIsInstallable(false);
      setDeferredPrompt(null);
    });
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
      setDeferredPrompt(null);
    }
  };

  const chartSettings = useStore(state => state.chartSettings);
  const menuItems = [
    { id: 'accounts', label: 'Accounts', icon: Users },
    { id: 'risk', label: 'Risk Management', icon: ShieldAlert },
    { id: 'settings', label: 'Chart Settings', icon: Settings },
    { id: 'news', label: 'Fundamentals Analysis', icon: Newspaper },
  ];

  if (subscriptionPlan === 'Developer' || subscriptionPlan === 'admin') {
     menuItems.push({ id: 'logs', label: 'Logs', icon: Terminal });
     menuItems.push({ id: 'admin', label: 'Admin Dashboard', icon: Shield });
     if (subscriptionPlan === 'Developer') {
        menuItems.push({ id: 'admin-logs', label: 'Admin Logs', icon: Database });
     }
  }

  const handleMenuClick = (id: string) => {
    if (id === 'admin-logs') {
       setActiveTab('admin-logs');
       return;
    }
    setActiveTab(id);
  };

  return (
    <aside className="w-64 bg-black border-r border-white/5 flex flex-col h-full shadow-2xl relative z-10">
      <div className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center shadow-lg shrink-0 overflow-hidden glowing-frame">
            <img 
              src={chartSettings.bgImageUrl && chartSettings.bgImageUrl !== "https://storage.googleapis.com/aida-uploads/default/14cb5da6-8f37-4d9e-bdb3-fc14b74bbde8/image.webp" ? chartSettings.bgImageUrl : "/bot-logo.png?v=2"} 
              alt="ALGOTRADE Logo" 
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="truncate">
            <h2 className="font-black text-white tracking-tighter truncate text-lg">ALGOTRADE</h2>
            <p className="text-[10px] terminal-glow font-black uppercase tracking-widest truncate" style={{ color: 'var(--accent-color)' }}>Production</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1 mt-4 overflow-y-auto custom-scrollbar">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => handleMenuClick(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 group active:scale-95 ${
              activeTab === item.id 
                ? 'text-white shadow-lg' 
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
            style={activeTab === item.id ? { 
              backgroundColor: 'var(--accent-color)', 
              boxShadow: '0 10px 20px -10px var(--accent-color)' 
            } : {}}
          >
            <item.icon className={`w-5 h-5 shrink-0 ${activeTab === item.id ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
            <span className="font-medium text-sm truncate">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-4 mt-auto space-y-3">
        {isInstallable && (
          <button 
            onClick={handleInstallClick}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl transition-all duration-200 group active:scale-95 font-bold text-sm"
          >
            <Download className="w-4 h-4" />
            Install App
          </button>
        )}
        <a 
          href="https://wa.me/27678172189" 
          target="_blank" 
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl transition-all duration-200 group active:scale-95 font-bold text-sm shadow-lg shadow-green-600/20"
        >
          <MessageCircle className="w-5 h-5" />
          WhatsApp Support
        </a>
        <button 
          onClick={async () => {
            const { supabase } = await import('../src/lib/supabase');
            localStorage.clear();
            await supabase.auth.signOut();
            window.location.reload();
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 rounded-xl transition-all duration-200 font-bold text-sm"
        >
          <LogOut className="w-4 h-4" />
          Log Out
        </button>

        {licenseKey && (
          <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Key className="w-3 h-3 text-emerald-500" />
                <span className="text-[10px] font-bold text-slate-400 uppercase">License Key</span>
              </div>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(licenseKey);
                  alert('Key copied to clipboard');
                }}
                className="p-1 hover:bg-white/10 rounded transition-colors"
                title="Copy Key"
              >
                <Copy className="w-3 h-3 text-slate-500 hover:text-emerald-400" />
              </button>
            </div>
            <div className="font-mono text-[9px] text-emerald-400/70 truncate bg-black/40 p-2 rounded border border-emerald-500/10 flex justify-between items-center group/key">
              <span className="truncate">{licenseKey}</span>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(licenseKey);
                  alert('Key copied to clipboard');
                }}
                className="opacity-0 group-hover/key:opacity-100 transition-opacity text-slate-500 hover:text-white"
              >
                <Copy className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>
        )}

        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent-color)' }}></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase">System Load</span>
          </div>
          <div className="w-full bg-slate-700 h-1 rounded-full overflow-hidden">
            <div className="w-[24%] h-full" style={{ backgroundColor: 'var(--accent-color)' }}></div>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;

