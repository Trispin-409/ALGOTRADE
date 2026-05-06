import React, { useState } from 'react';
import { Shield, Zap, Crown, Check, ArrowRight, X, Loader2, Lock } from 'lucide-react';

interface PricingPageProps {
  session: any;
  bootData: any;
}

export const PricingPage: React.FC<PricingPageProps> = ({ session, bootData }) => {
  const [isSimulating, setIsSimulating] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [step, setStep] = useState<'review' | 'paying' | 'success'>('review');

  const handleSubscribe = (plan: any) => {
    setSelectedPlan(plan);
    setStep('review');
    setIsSimulating(true);
  };

  const processSimulation = () => {
    setStep('paying');
    setTimeout(() => {
      setStep('success');
    }, 2500);
  };

  const closeSimulation = () => {
    setIsSimulating(false);
    setSelectedPlan(null);
    setStep('review');
    if (step === 'success') {
      window.location.href = '/';
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
            <div className={`absolute inset-0 bg-gradient-to-br ${plan.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>
            
            <div className="relative z-10">
              <div className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-6 md:mb-8 border border-white/10`}>
                {plan.icon}
              </div>
              
              <h3 className="text-xl md:text-2xl font-bold text-white mb-2">{plan.name}</h3>
              
              <div className="mb-6 flex items-baseline">
                <span className="text-3xl md:text-4xl font-black text-white">{plan.price}</span>
                <span className="text-slate-500 ml-1 font-medium italic">{plan.period}</span>
              </div>
              
              <ul className="space-y-4 mb-8 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start text-sm text-slate-300 leading-relaxed">
                    <Check className={`w-5 h-5 text-white/40 mr-3 mt-0.5 shrink-0`} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              
              <button
                onClick={() => handleSubscribe(plan)}
                className="w-full py-4 px-6 rounded-2xl font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-3 bg-white text-black hover:bg-slate-200 active:scale-[0.98] shadow-[0_0_20px_rgba(255,255,255,0.1)]"
              >
                Subscribe <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {isSimulating && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={step !== 'paying' ? closeSimulation : undefined}></div>
          <div className="relative bg-slate-900 border border-white/10 rounded-3xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-500" />
                PayFast Secure Checkout
              </h3>
              {step !== 'paying' && (
                <button onClick={closeSimulation} className="text-slate-500 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              )}
            </div>

            <div className="p-8">
              {step === 'review' && (
                <div className="space-y-6">
                  <div className="text-center">
                    <p className="text-slate-400 text-sm uppercase tracking-widest mb-1">Subscribing to</p>
                    <h4 className="text-3xl font-black text-white italic underline underline-offset-8 decoration-indigo-500">{selectedPlan?.name}</h4>
                  </div>
                  
                  <div className="bg-white/5 rounded-2xl p-6 space-y-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Merchant</span>
                      <span className="text-white font-medium italic">ALGO TRADE SOLUTIONS</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Contact</span>
                      <span className="text-white font-medium">{session?.user?.email || 'Guest'}</span>
                    </div>
                    <div className="pt-4 border-t border-white/5 flex justify-between items-center">
                      <span className="text-slate-200 font-bold">Total Due Now</span>
                      <span className="text-2xl font-black text-white">{selectedPlan?.price}</span>
                    </div>
                  </div>

                  <button 
                    onClick={processSimulation}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest rounded-xl shadow-lg transition-all"
                  >
                    Proceed to Payment
                  </button>
                  <p className="text-[10px] text-center text-slate-500 uppercase tracking-tighter">Secure 256-bit encrypted transaction processed via PayFast</p>
                </div>
              )}

              {step === 'paying' && (
                <div className="py-12 flex flex-col items-center justify-center space-y-6 text-center">
                  <div className="relative">
                    <div className="absolute inset-0 bg-indigo-500/20 blur-2xl rounded-full animate-pulse"></div>
                    <Loader2 className="w-16 h-16 text-indigo-500 animate-spin relative z-10" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-white mb-2">Connecting to Secure Gateway</h4>
                    <p className="text-slate-400 text-sm">Please do not refresh the page...</p>
                  </div>
                </div>
              )}

              {step === 'success' && (
                <div className="py-8 flex flex-col items-center justify-center space-y-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/30">
                    <Check className="w-10 h-10 text-emerald-500" />
                  </div>
                  <div>
                    <h4 className="text-2xl font-black text-white mb-2 uppercase italic tracking-tight">Payment Successful!</h4>
                    <p className="text-slate-400 text-sm">Your {selectedPlan?.name} subscription is now active.</p>
                  </div>
                  <button 
                    onClick={closeSimulation}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest rounded-xl shadow-lg transition-all"
                  >
                    Enter Workspace
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 mt-12 md:mt-16 text-center px-4">
        {session && bootData && bootData.has_active_subscription ? (
          <button 
            onClick={() => window.location.href = '/'}
            className="text-slate-400 hover:text-white transition-colors font-semibold uppercase tracking-widest text-xs border-b border-transparent hover:border-white pb-1"
          >
            Return to Dashboard
          </button>
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

