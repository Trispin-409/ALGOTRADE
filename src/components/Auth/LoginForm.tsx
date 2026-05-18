import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Cpu, Terminal, Fingerprint, LogIn, UserPlus, Lock, User, ArrowLeft } from 'lucide-react';

export function LoginForm() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setSuccessMessage('');
    setLoading(true);
    
    // SECURITY ISOLATION: Purge all local cached session state
    localStorage.clear();

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
       alert(error.message);
       setLoading(false);
    } else {
       // Force a full reload to clear all react states and memory namespaces
       window.location.reload();
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      alert("Please fill in all fields (Full Name, Email, Password).");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ 
      email, 
      password,
      options: {
        data: {
          full_name: fullName
        }
      }
    });
    
    if (error) {
      alert(error.message);
    } else {
      setSuccessMessage("Registration successful! Please sign in with your new account.");
      setMode('login');
      // Supabase signIn might auto-login if email confirmation isn't required.
      // But typically signUp returns a session if it auto-logs in.
      // We explicitly log out just in case it auto-logged them in to ensure they go through sign-in manually.
      if (data?.session) {
        await supabase.auth.signOut();
      }
    }
    setLoading(false);
  }

  return (
    <div className="relative group w-full max-w-md mx-auto z-10 transition-all duration-500">
      {/* Glow effect behind form */}
      <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
      
      <form 
        className="relative flex flex-col gap-6 p-8 bg-transparent overflow-hidden"
        style={{ borderStyle: 'groove', borderRadius: '36px', border: '1px groove rgba(255, 255, 255, 0.2)' }}
      >
        
        {/* Robotic UI Accent Lines */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50"></div>
        <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-cyan-500 rounded-tl-xl opacity-70"></div>
        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-purple-500 rounded-br-xl opacity-70"></div>

        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="w-24 h-24 rounded-2xl border-2 border-cyan-500/50 overflow-hidden shadow-[0_0_30px_rgba(6,182,212,0.2)] bg-transparent p-1">
            <div className="w-full h-full rounded-xl overflow-hidden bg-transparent flex items-center justify-center">
              <img 
                src="/bot-logo.png?v=2" 
                alt="Bot Logo" 
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
          <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 uppercase tracking-[0.3em]">
            ALGOTRADE
          </h2>
          <div className="flex items-center gap-2 text-xs font-mono tracking-widest uppercase">
            <Terminal className="w-3.5 h-3.5 text-cyan-500/70" />
            <span style={{ borderColor: '#009cdb', color: '#00dbd7', fontFamily: 'Arial' }}>{mode === 'login' ? 'Awaiting Authentication' : 'New Identity Registration'}</span>
          </div>
        </div>

        {successMessage && (
          <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 text-xs font-mono p-3 rounded-lg text-center animate-in fade-in zoom-in slide-in-from-top-2">
            {successMessage}
          </div>
        )}

        <div className="space-y-4">
          {mode === 'register' && (
            <div className="relative animate-in slide-in-from-bottom-2 fade-in">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input 
                type="text" 
                placeholder="Full Name" 
                value={fullName} 
                onChange={(e) => setFullName(e.target.value)} 
                className="w-full border-b border-white/20 py-3 px-12 text-sm font-mono text-cyan-50 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/80 transition-all" 
                style={{ backgroundColor: '#3b3a71' }}
              />
            </div>
          )}

          <div className="relative">
            <Fingerprint className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input 
              type="email" 
              placeholder="Email Address" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              className="w-full border-b border-white/20 py-3 px-12 text-sm font-mono text-cyan-50 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/80 transition-all" 
              style={{ backgroundColor: '#3b3a71' }}
            />
          </div>
          
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input 
              type="password" 
              placeholder="Password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              className="w-full border-b border-white/20 py-3 px-12 text-sm font-mono text-cyan-50 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/80 transition-all" 
              style={{ backgroundColor: '#3b3a71' }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 mt-4">
          {mode === 'login' ? (
            <>
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
                onClick={() => { setMode('register'); setSuccessMessage(''); }} 
                disabled={loading} 
                className="w-full flex items-center justify-center gap-3 bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white border border-white/5 hover:border-purple-500/30 py-3 px-4 rounded-lg font-black tracking-widest uppercase text-sm transition-all"
              >
                <UserPlus className="w-4 h-4" />
                CREATE NEW ACCOUNT
              </button>
            </>
          ) : (
            <>
              <button 
                type="button"
                onClick={handleSignup} 
                disabled={loading} 
                className="group relative w-full flex items-center justify-center gap-3 bg-purple-600 hover:bg-purple-500 text-white py-3 px-4 rounded-lg font-black tracking-widest uppercase text-sm transition-all overflow-hidden"
              >
                <div className="absolute inset-0 w-1/4 h-full bg-white/20 -skew-x-12 -translate-x-full group-hover:translate-x-[400%] transition-transform duration-700 ease-in-out"></div>
                {loading ? <Cpu className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
                {loading ? 'STORING...' : 'REGISTER IDENTITY'}
              </button>
              
              <button 
                type="button"
                onClick={() => setMode('login')} 
                disabled={loading} 
                className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-white py-3 px-4 rounded-lg font-bold tracking-widest uppercase text-xs transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                BACK TO LOGIN
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}


