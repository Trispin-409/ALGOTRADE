import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useStore } from '../../store';

export function ResetPasswordForm({ session }: { session: any }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMsg("Please enter a new password.");
      return;
    }
    
    setLoading(true);
    setErrorMsg('');
    
    const { error } = await supabase.auth.updateUser({ password });
    
    if (error) {
      setErrorMsg(error.message);
    } else {
      setSuccess(true);
      setTimeout(() => {
        // Sign out to force re-login with new password, or redirect directly
        supabase.auth.signOut().then(() => {
          window.location.href = '/';
        });
      }, 2000);
    }
    setLoading(false);
  }

  const chartSettings = useStore((state) => state.chartSettings);

  return (
    <div className="relative flex items-center justify-center min-h-screen bg-[#02040a] overflow-hidden">
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-100 z-0"
          style={{ 
            backgroundImage: "url('/login-background.png')", 
            backgroundColor: "#02040a" 
          }}
        ></div>
      </div>
      
      <div className="relative z-20 pointer-events-auto w-full px-4">
        <div className="w-full max-w-sm mx-auto flex flex-col items-center">
          <div className="flex flex-col items-center mb-8 w-full">
            <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-[#face6f] to-[#b38421] tracking-widest uppercase mb-1">
              ALGOTRADE
            </h2>
          </div>

          <div className="w-full flex flex-col items-center">
            <h3 className="text-2xl font-bold text-white mb-2">Reset Password</h3>
            <p className="text-slate-400 text-sm mb-8 text-center">
              Enter your new password below.
            </p>

            {success ? (
              <div className="w-full bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 text-sm p-4 rounded-xl text-center mb-6 animate-in fade-in">
                Password updated successfully! Redirecting to login...
              </div>
            ) : (
              <form className="w-full flex flex-col gap-4" onSubmit={handleReset}>
                {errorMsg && (
                  <div className="w-full bg-rose-500/10 border border-rose-500/50 text-rose-400 text-xs p-3 rounded-xl text-center mb-2 animate-in fade-in">
                    {errorMsg}
                  </div>
                )}
                
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#face6f]" />
                  <input 
                    type={showPassword ? "text" : "password"} 
                    placeholder="New Password" 
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

                <button 
                  type="submit"
                  disabled={loading || !session} 
                  className="w-full mt-4 flex items-center justify-center gap-2 bg-gradient-to-b from-[#ffd688] via-[#face6f] to-[#d69f31] hover:brightness-110 text-black py-3.5 px-4 rounded-xl font-bold text-base transition-all disabled:opacity-70 shadow-[0_0_20px_rgba(250,206,111,0.2)]"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                  {loading ? 'Updating...' : 'Update Password'}
                </button>
                
                {!session && !loading && (
                   <p className="text-rose-400 text-xs text-center mt-2">
                     Missing or invalid reset session. Please click the reset link in your email again.
                   </p>
                )}
              </form>
            )}
            
            <div className="mt-8 text-sm text-slate-400">
              <button onClick={() => window.location.href = '/'} className="text-[#face6f] hover:text-white font-semibold transition-colors">
                Back to Login
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
