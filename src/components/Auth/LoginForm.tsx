import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Cpu, Terminal, Fingerprint, LogIn, UserPlus, Lock } from 'lucide-react';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    console.log("LOGIN ATTEMPT:", email);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    console.log("LOGIN DATA:", data);
    console.log("LOGIN ERROR:", error);
    if (error) alert(error.message);
    setLoading(false);
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    console.log("SIGNUP ATTEMPT:", email);
    const { data, error } = await supabase.auth.signUp({ email, password });
    console.log("SIGNUP DATA:", data);
    console.log("SIGNUP ERROR:", error);
    if (error) alert(error.message);
    else {
      alert("User created. Now login.");
      await supabase.auth.signOut();
    }
    setLoading(false);
  }

  return (
    <div className="relative group w-full max-w-md mx-auto z-10">
      {/* Glow effect behind form */}
      <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
      
      <form className="relative flex flex-col gap-6 p-8 bg-slate-900/80 backdrop-blur-xl border-y border-x border-white/10 rounded-xl shadow-[0_0_40px_rgba(0,0,0,0.8)] overflow-hidden">
        
        {/* Robotic UI Accent Lines */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50"></div>
        <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-cyan-500 rounded-tl-xl opacity-70"></div>
        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-purple-500 rounded-br-xl opacity-70"></div>

        <div className="flex flex-col items-center gap-3 mb-2">
          <div className="w-20 h-20 rounded-full border-2 border-cyan-500 overflow-hidden shadow-[0_0_20px_rgba(6,182,212,0.3)] bg-slate-900/50">
            <img src="/regenerated_image_1777449324214.webp" alt="Bot" className="w-full h-full object-cover mix-blend-screen" />
          </div>
          <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 uppercase tracking-[0.2em]">
            ALGOTRADE
          </h2>
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-500/70 tracking-widest uppercase">
            <Terminal className="w-3.5 h-3.5" />
            <span>Awaiting Authentication</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <Fingerprint className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input 
              type="text" 
              placeholder="Login / Email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              className="w-full bg-slate-950/50 border border-white/10 rounded-lg py-3 px-12 text-sm font-mono text-cyan-50 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all" 
            />
          </div>
          
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input 
              type="password" 
              placeholder="Password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              className="w-full bg-slate-950/50 border border-white/10 rounded-lg py-3 px-12 text-sm font-mono text-cyan-50 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all" 
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 mt-4">
          <button 
            type="button"
            onClick={handleLogin} 
            disabled={loading} 
            className="group relative w-full flex items-center justify-center gap-3 bg-cyan-600 hover:bg-cyan-500 text-white py-3 px-4 rounded-lg font-black tracking-widest uppercase text-sm transition-all overflow-hidden"
          >
            <div className="absolute inset-0 w-1/4 h-full bg-white/20 -skew-x-12 -translate-x-full group-hover:translate-x-[400%] transition-transform duration-700 ease-in-out"></div>
            {loading ? <Cpu className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
            {loading ? 'PROCESSING...' : 'LOGIN'}
          </button>
          
          <button 
            type="button"
            onClick={handleSignup} 
            disabled={loading} 
            className="w-full flex items-center justify-center gap-3 bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white border border-white/5 hover:border-purple-500/30 py-3 px-4 rounded-lg font-black tracking-widest uppercase text-sm transition-all"
          >
            <UserPlus className="w-4 h-4" />
            REGISTER
          </button>
        </div>
      </form>
    </div>
  );
}

