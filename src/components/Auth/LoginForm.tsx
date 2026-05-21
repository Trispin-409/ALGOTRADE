import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Mail, Lock, User, Eye, EyeOff, Loader2 } from 'lucide-react';

export function LoginForm() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  async function handleForgotPassword() {
    if (!email.trim()) {
      alert("Please enter your email address first.");
      return;
    }
    setLoading(true);
    setSuccessMessage('');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://algotrade-tristech.com/reset-password",
    });
    
    if (error) {
      alert(error.message);
    } else {
      setSuccessMessage("Password reset email sent. Please check your inbox.");
    }
    setLoading(false);
  }

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
      if (data?.session) {
        await supabase.auth.signOut();
      }
    }
    setLoading(false);
  }

  return (
    <div className="w-full max-w-sm mx-auto z-10 flex flex-col items-center">
      {/* Branding Section */}
      <div className="flex flex-col items-center mb-8 w-full">
        <div className="w-64 h-64 mb-2 flex items-center justify-center">
          <img 
            src="/login-logo.png?v=5" 
            alt="AlgoTrade Logo" 
            className="w-full h-full object-contain"
            referrerPolicy="no-referrer"
          />
        </div>
        <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-[#face6f] to-[#b38421] tracking-widest uppercase mb-1">
          ALGOTRADE
        </h2>
        <p className="text-[#face6f] text-xs font-semibold tracking-[0.2em] uppercase">
          Smarter Trading. Better Results.
        </p>
      </div>

      {/* Form Section */}
      <div className="w-full flex flex-col items-center">
        <h3 className="text-2xl font-bold text-white mb-2">
          {mode === 'login' ? 'Welcome Back' : 'Create Account'}
        </h3>
        <p className="text-slate-400 text-sm mb-8">
          {mode === 'login' ? 'Sign in to continue your trading journey' : 'Register to start your trading journey'}
        </p>

        {successMessage && (
          <div className="w-full bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 text-xs p-3 rounded-xl text-center mb-6 animate-in fade-in">
            {successMessage}
          </div>
        )}

        <form className="w-full flex flex-col gap-4" onSubmit={mode === 'login' ? handleLogin : handleSignup}>
          {mode === 'register' && (
            <div className="relative group">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#face6f]" />
              <input 
                type="text" 
                placeholder="Full Name" 
                value={fullName} 
                onChange={(e) => setFullName(e.target.value)} 
                className="w-full bg-transparent border border-white/20 rounded-xl py-3.5 pl-12 pr-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#face6f] transition-all" 
              />
            </div>
          )}

          <div className="relative group">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#face6f]" />
            <input 
              type="email" 
              placeholder="Email Address" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              className="w-full bg-transparent border border-white/20 rounded-xl py-3.5 pl-12 pr-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#face6f] transition-all" 
            />
          </div>
          
          <div className="relative group">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#face6f]" />
            <input 
              type={showPassword ? "text" : "password"} 
              placeholder="Password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              className="w-full bg-transparent border border-white/20 rounded-xl py-3.5 pl-12 pr-12 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#face6f] transition-all" 
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          {mode === 'login' && (
            <div className="flex justify-end w-full mt-1">
              <button 
                type="button" 
                onClick={handleForgotPassword}
                disabled={loading}
                className="text-sm text-[#face6f] hover:text-[#ffd688] font-medium transition-colors disabled:opacity-50"
              >
                Forgot Password?
              </button>
            </div>
          )}

          <button 
            type="submit"
            disabled={loading} 
            className="w-full mt-4 flex items-center justify-center gap-2 bg-gradient-to-b from-[#ffd688] via-[#face6f] to-[#d69f31] hover:brightness-110 text-black py-3.5 px-4 rounded-xl font-bold text-base transition-all disabled:opacity-70 shadow-[0_0_20px_rgba(250,206,111,0.2)]"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {loading ? 'Processing...' : (mode === 'login' ? 'Sign In' : 'Sign Up')}
          </button>
        </form>

        <div className="mt-8 text-sm text-slate-400">
          {mode === 'login' ? (
            <>
              Don't have an account?{' '}
              <button onClick={() => setMode('register')} className="text-[#face6f] hover:text-white font-semibold transition-colors">
                Sign Up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button onClick={() => setMode('login')} className="text-[#face6f] hover:text-white font-semibold transition-colors">
                Sign In
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


