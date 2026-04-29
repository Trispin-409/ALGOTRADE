
import React, { useState } from 'react';
import { LayoutDashboard, Users, ShieldAlert, Cpu, Database, Terminal, X, Settings, Layers, Workflow, Cloud } from 'lucide-react';
import { useStore } from '../src/store';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const [isLogsLocked, setIsLogsLocked] = useState(true);
  
  const chartSettings = useStore(state => state.chartSettings);
  const menuItems = [
    { id: 'accounts', label: 'Accounts', icon: Users },
    { id: 'settings', label: 'Chart Settings', icon: Settings },
    { id: 'logs', label: 'Logs', icon: Terminal },
  ];

  const handleMenuClick = (id: string) => {
    if (id === 'logs' && isLogsLocked) {
       const key = prompt("Enter Access Key for System Logs:");
       const validKey = import.meta.env.VITE_SYSTEM_LOG || "vite system log";
       if (key === validKey) {
         setIsLogsLocked(false);
         setActiveTab(id);
       } else {
         alert("Invalid Access Key");
       }
       return;
    }
    setActiveTab(id);
  };

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-full shadow-2xl">
      <div className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center shadow-lg shadow-white/5 shrink-0 overflow-hidden">
            <img 
              src={chartSettings.bgImageUrl || "/api/attachments/86"} 
              alt="AlgoTrade Logo" 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="truncate">
            <h2 className="font-black text-white tracking-tighter truncate text-lg">ALGOTRADE</h2>
            <p className="text-[10px] text-indigo-500 font-black uppercase tracking-widest truncate">Production</p>
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
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <item.icon className={`w-5 h-5 shrink-0 ${activeTab === item.id ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
            <span className="font-medium text-sm truncate">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-4 mt-auto">
        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase">System Load</span>
          </div>
          <div className="w-full bg-slate-700 h-1 rounded-full overflow-hidden">
            <div className="bg-blue-500 w-[24%] h-full"></div>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 truncate">API Latency: <span className="text-emerald-400">42ms</span></p>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;

