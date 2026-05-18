import React, { useState } from 'react';
import { Shield, Zap, Crown, Check, ArrowRight, X, Loader2, Lock, Terminal, Key, RefreshCw } from 'lucide-react';
import { safeFetch, generateFingerprint } from '../lib/utils';

interface PricingPageProps {
  session: any;
  bootData: any;
}

export const PricingPage: React.FC<PricingPageProps> = ({ session, bootData }) => {
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [step, setStep] = useState<'checkout' | 'activate' | null>(null);
  const [activationKey, setActivationKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);

  const WHATSAPP_NUMBER = '+27678172189'; // Official User WhatsApp Number

  const handleSubscribe = (plan: any) => {
    setSelectedPlan(plan);
    setStep('checkout');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setProofFile(e.target.files[0]);
    }
  };

  const handleWhatsAppSend = () => {
    let text = `Hello, I've just paid for the ${selectedPlan?.name} plan. My email is ${session?.user?.email}. I am attaching my proof of payment now. Please send me my access key.`;
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleActivate = async () => {
    if (!activationKey.trim()) {
      setActivationError("Please enter an activation key.");
      return;
    }
    setActivating(true);
    setActivationError('');

    try {
      const fingerprint = generateFingerprint();
      const res = await safeFetch('/api/subscription/activate-device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ key: activationKey, fingerprint })
      });

      if (res.success) {
         // Use a hard replace with cache buster to ensure the app reloads with fresh status
         window.location.replace('/?activated=true&t=' + Date.now());
      } else {
         setActivationError(res.error || 'Activation failed.');
      }
    } catch (e: any) {
      setActivationError(e.message || 'Activation failed.');
    } finally {
      setActivating(false);
    }
  };

  const plans = [
    {
      name: 'Starter',
      price: 'R550',
      period: '/month',
      icon: <Shield className="w-8 h-8 text-blue-500" />,
      features: ['1 Live Account Connection', 'Standard Trade Execution', 'Basic Priority Support', 'Secure Broker Integration'],
      color: 'blue',
      gradient: 'from-blue-600/20 to-transparent'
    },
    {
      name: 'Pro',
      price: 'R899',
      period: '/month',
      icon: <Zap className="w-8 h-8 text-amber-500" />,
      features: ['2 Live Account Connections', 'Priority Execution Speed', 'Real-time Analytics', 'Standard Support Plus'],
      color: 'amber',
      gradient: 'from-amber-600/20 to-transparent'
    },
    {
      name: 'Elite',
      price: 'R1199',
      period: '/month',
      icon: <Crown className="w-8 h-8 text-emerald-500" />,
      features: ['3 Live Account Connections', 'Ultra-fast Execution', '24/7 Dedicated Support', 'Alpha Analytics Suite'],
      color: 'emerald',
      gradient: 'from-emerald-600/20 to-transparent'
    }
  ];

  return (
    <div className="min-h-screen bg-[#02040a] text-slate-200 py-12 md:py-24 pb-32 px-4 relative overflow-y-auto flex flex-col items-center">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f1a_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f1a_1px,transparent_1px)] bg-[size:20px_30px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]"></div>
      
      {!session || (bootData && !bootData.has_active_subscription) ? (
         <div className="relative z-10 w-full max-w-6xl mb-8 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-center">
             <h2 className="text-rose-500 font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2">
                 <Lock className="w-4 h-4" /> Payment verification required to unlock trading access.
             </h2>
         </div>
      ) : null}

      <div className="relative z-10 max-w-6xl w-full mx-auto text-center mb-12 md:mb-16">
        <h1 className="text-3xl md:text-6xl font-black text-white tracking-tighter uppercase mb-4 md:mb-6 drop-shadow-[0_0_15px_rgba(255,255,255,0.15)] px-4">
          Unleash Your Trading Potential
        </h1>
        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto px-4">
          Institutional-grade automation infrastructure designed for the modern retail trader.
        </p>
      </div>

      <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 max-w-6xl w-full mx-auto px-2">
        {plans.map((plan) => (
          <div key={plan.name} className={`bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 md:p-8 flex flex-col transition-all duration-300 hover:bg-slate-800/40 hover:border-white/10 relative overflow-hidden group shadow-2xl`}>
            {/* Ambient Background Gradient */}
            <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-500`} style={{ background: 'var(--accent-color)' }}></div>
            
            <div className="relative z-10">
              <div className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-6 md:mb-8 border border-white/10`} style={{ color: 'var(--accent-color)' }}>
                {React.cloneElement(plan.icon as React.ReactElement, { className: 'w-8 h-8', style: { color: 'var(--accent-color)' } })}
              </div>
              
              <h3 className="text-xl md:text-2xl font-bold text-white mb-2">{plan.name}</h3>
              
              <div className="mb-6 flex items-baseline">
                <span className="text-3xl md:text-4xl font-black text-white">{plan.price}</span>
                <span className="text-slate-500 ml-1 font-medium italic">{plan.period}</span>
              </div>
              
              <ul className="space-y-4 mb-8 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start text-sm text-slate-300 leading-relaxed">
                    <Check className={`w-5 h-5 mr-3 mt-0.5 shrink-0`} style={{ color: 'var(--accent-color)' }} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              
              <button
                onClick={() => handleSubscribe(plan)}
                className="w-full py-4 px-6 rounded-2xl font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-3 text-black hover:opacity-90 active:scale-[0.98] shadow-lg"
                style={{ backgroundColor: 'var(--accent-color)', boxShadow: '0 10px 20px -5px rgba(var(--accent-color-rgb), 0.3)' }}
              >
                Subscribe <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {step === 'checkout' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md" onClick={() => setStep(null)}></div>
          <div className="relative bg-[#0a0a0f] border border-white/10 rounded-3xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 shadow-[0_0_50px_rgba(0,0,0,0.5)] my-auto">
            {/* Close Button Mobile */}
            <button 
                onClick={() => setStep(null)}
                className="absolute right-4 top-4 z-20 text-white/50 hover:text-white lg:hidden"
            >
                <X className="w-6 h-6" />
            </button>

            {/* Card Graphic Header */}
            <div className="h-24 bg-gradient-to-r from-blue-900 to-indigo-900 p-6 flex flex-col justify-end relative overflow-hidden shrink-0">
               <div className="absolute right-4 top-4 opacity-50">
                   <Shield className="w-12 h-12 text-white/20" />
               </div>
               <p className="text-blue-100/70 text-[10px] font-bold uppercase tracking-widest">Premium Banking Transfer</p>
               <h3 className="text-white text-xl font-black uppercase tracking-widest leading-none">Checkout</h3>
            </div>
            
            <div className="p-5 sm:p-6 overflow-y-auto max-h-[calc(100vh-120px)]">
                 <div className="text-center mb-6">
                    <p className="text-slate-400 text-[10px] uppercase tracking-widest mb-1">Subscribing to</p>
                    <h4 className="text-2xl sm:text-3xl font-black text-white italic underline underline-offset-8 decoration-indigo-500">{selectedPlan?.name}</h4>
                 </div>
                  
                 <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-6 space-y-3 font-mono text-sm relative overflow-hidden">
                    <div className="absolute -right-4 -top-4 w-16 h-16 bg-white/5 rounded-full blur-xl"></div>
                    
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 uppercase tracking-widest font-sans font-bold">Bank</span>
                        <span className="text-white font-bold">Capitec</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 uppercase tracking-widest font-sans font-bold">Account Holder</span>
                        <span className="text-white">MR T Sokhela</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 uppercase tracking-widest font-sans font-bold">Account Type</span>
                        <span className="text-white">Savings</span>
                    </div>
                    <div className="flex justify-between items-center text-xs pt-2 border-t border-white/5">
                        <span className="text-slate-500 uppercase tracking-widest font-sans font-bold">Account Number</span>
                        <span className="text-emerald-400 font-bold text-base tracking-widest">1947270883</span>
                    </div>
                    <div className="flex justify-between items-center text-xs pt-2 border-t border-white/5 bg-white/5 rounded px-2 py-1 -mx-2 mb-2">
                        <span className="text-slate-500 uppercase tracking-widest font-sans font-bold">Total Due</span>
                        <span className="text-white font-black text-base">{selectedPlan?.price}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs pt-2 border-t border-white/5">
                        <span className="text-slate-500 uppercase tracking-widest font-sans font-bold">WhatsApp Support</span>
                        <span className="text-white font-bold">{WHATSAPP_NUMBER}</span>
                    </div>
                 </div>

                 <p className="text-xs text-slate-400 text-center mb-6 leading-relaxed">
                     Please make a direct transfer to the account provided above. After payment, send us your proof of payment along with your email. 
                     If you are renewing an existing subscription, no new key is needed; the admin will extend your access.
                 </p>

                  <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] text-slate-500 uppercase tracking-widest font-black block">Step 1: Enter Access Key (If you already have one)</label>
                        <div className="relative group">
                          <input 
                              type="text" 
                              value={activationKey}
                              onChange={(e) => setActivationKey(e.target.value)}
                              placeholder="ALGO-XXXX-XXXX"
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 font-mono text-emerald-400 text-sm focus:outline-none focus:border-emerald-500 uppercase tracking-[0.2em] text-center transition-all group-hover:border-white/20"
                          />
                          {activationKey.trim().length > 5 && (
                             <button
                                onClick={handleActivate}
                                disabled={activating}
                                className="absolute right-2 top-1/2 -translate-y-1/2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-lg disabled:opacity-50"
                             >
                                {activating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Activate Now'}
                             </button>
                          )}
                        </div>
                        {step === 'checkout' && activationError && (
                            <p className="text-rose-500 text-[10px] font-bold mt-1 text-center">{activationError}</p>
                        )}
                      </div>

                     <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={() => {
                                navigator.clipboard.writeText("1947270883");
                                alert("Account number copied! Please use your banking app to complete the payment.");
                            }}
                            className="w-full py-4 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-600/30 font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 active:scale-95 text-[10px]"
                        >
                            Step 2: Copy Acc Num
                        </button>
                        
                        <button 
                            onClick={handleWhatsAppSend}
                            className="w-full py-4 bg-[#25D366] hover:bg-[#1DA851] text-white font-black uppercase tracking-widest rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95 shadow-emerald-500/20 text-[10px]"
                        >
                            Step 3: WhatsApp POP
                        </button>
                     </div>

                     <p className="text-[10px] text-slate-500 text-center italic mt-2 leading-relaxed">
                        * Note: If you don't have a key, complete Step 2 and 3. You MUST send your proof of payment via WhatsApp to the admin to receive your unique access key.
                     </p>
                     
                     <button 
                         onClick={() => setStep(null)}
                         className="w-full py-2 bg-transparent text-slate-500 hover:text-slate-300 font-bold uppercase tracking-widest text-[10px] transition-all"
                     >
                        Go Back
                     </button>
                 </div>
            </div>
          </div>
        </div>
      )}

      {step === 'activate' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setStep(null)}></div>
          <div className="relative bg-[#0a0a0f] border border-emerald-500/30 rounded-3xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 shadow-2xl shadow-emerald-900/20">
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-emerald-900/20">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-emerald-500" />
                Activate License
              </h3>
              <button onClick={() => setStep(null)} className="text-slate-500 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-8 space-y-6">
                <div className="text-center">
                    <p className="text-slate-400 text-sm leading-relaxed">
                        Enter the unique access key provided by the admin. This key will securely bind to this email account.
                    </p>
                </div>
                
                <div className="space-y-4">
                    <input 
                        type="text" 
                        value={activationKey}
                        onChange={(e) => setActivationKey(e.target.value)}
                        placeholder="ENTER ACCESS KEY"
                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-4 text-center font-mono text-emerald-400 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-700 uppercase tracking-[0.2em]"
                    />
                    
                    {activationError && (
                        <p className="text-rose-500 text-xs font-bold text-center animate-pulse">{activationError}</p>
                    )}
                    
                    <button 
                        onClick={handleActivate}
                        disabled={activating}
                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {activating ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Unlock Access'}
                    </button>
                </div>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 mt-12 md:mt-16 text-center px-4 space-y-6 flex flex-col items-center">
        {session && bootData && bootData.has_active_subscription ? (
          <button 
            onClick={() => window.location.href = '/'}
            className="text-slate-400 hover:text-white transition-colors font-semibold uppercase tracking-widest text-xs border-b border-transparent hover:border-white pb-1"
          >
            Return to Dashboard
          </button>
        ) : session ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex flex-wrap justify-center gap-4">
              <button 
                onClick={() => setStep('activate')}
                className="text-emerald-400 hover:text-emerald-300 transition-colors font-black uppercase tracking-widest text-sm flex items-center gap-2 bg-emerald-500/10 px-6 py-3 rounded-xl border border-emerald-500/20"
              >
                <Key className="w-4 h-4" /> I have an Activation Key
              </button>
              <button 
                onClick={() => window.location.reload()}
                className="text-indigo-400 hover:text-indigo-300 transition-colors font-black uppercase tracking-widest text-sm flex items-center gap-2 bg-indigo-500/10 px-6 py-3 rounded-xl border border-indigo-500/20"
              >
                <RefreshCw className="w-4 h-4" /> Refresh Status
              </button>
            </div>
            <button 
                onClick={async () => {
                    const { supabase } = await import('../lib/supabase');
                    localStorage.clear();
                    await supabase.auth.signOut();
                    window.location.reload();
                }}
                className="text-xs font-bold text-slate-500 hover:text-white uppercase tracking-widest"
            >
                Log Out
            </button>
          </div>
        ) : !session ? (
          <div className="flex flex-col items-center gap-4">
            <p className="text-slate-500 text-sm font-medium uppercase tracking-widest">Already have an account?</p>
            <button 
              onClick={() => window.location.href = '/'}
              className="text-white hover:text-indigo-400 transition-colors font-bold uppercase tracking-widest text-sm"
            >
              Sign In to Continue
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

