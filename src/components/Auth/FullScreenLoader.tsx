import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';

export const FullScreenLoader = ({ message }: { message: string }) => {
  const [dots, setDots] = useState('');
  const [systemStage, setSystemStage] = useState(0);

  // Animated loading dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => (prev.length >= 3 ? '' : prev + '.'));
    }, 200);
    return () => clearInterval(interval);
  }, []);

  // Cycle high-fidelity system diagnostics for premium TrisTech user presentation
  useEffect(() => {
    const stages = [
      'Securing application workspace...',
      'Activating TrisTech system engine...',
      'Calibrating predictive risk protocols...',
      'Optimizing real-time telemetry feed...'
    ];
    
    const interval = setInterval(() => {
      setSystemStage(prev => (prev + 1) % stages.length);
    }, 600);

    return () => clearInterval(interval);
  }, []);

  const diagnostics = [
    'Securing application workspace...',
    'Activating TrisTech system engine...',
    'Calibrating predictive risk protocols...',
    'Optimizing real-time telemetry feed...'
  ];

  return (
    <div className="relative flex flex-col items-center justify-between h-screen w-full bg-[#000000] text-white overflow-hidden select-none">
      {/* Background Cybernetic Aura */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {/* Subtle cyan-gold ambient glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-tr from-[#face6f]/5 to-cyan-500/5 rounded-full blur-[120px] animate-pulse"></div>
        {/* Tech Grid Pattern */}
        <div 
          className="absolute inset-0 opacity-[0.03]" 
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '24px 24px'
          }}
        ></div>
      </div>

      {/* Decorative Top Bar */}
      <div className="w-full max-w-sm px-8 pt-12 z-10 flex justify-between items-center text-[10px] font-mono tracking-widest text-[#face6f]/60">
        <span>SYS.OK: [SEC_SECURE]</span>
        <span>LATENCY: 1.2MS</span>
      </div>

      {/* Central Interactive HUD Bot Logo (Bloomberg / MT5 Vertical Splash) */}
      <div className="flex-1 flex flex-col items-center justify-center z-10 w-full max-w-sm px-6">
        <div className="relative w-48 h-48 mb-6 flex items-center justify-center">
          {/* Inner Pulsing Radar circles */}
          <motion.div 
            animate={{ scale: [0.9, 1.1, 0.9], opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 rounded-full border border-cyan-500/10"
          />
          <motion.div 
            animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="absolute inset-2 rounded-full border border-[#face6f]/10"
          />
          
          {/* Rotating Data HUD elements */}
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            className="absolute inset-6 rounded-full border border-dashed border-cyan-300/20"
          />
          <motion.div 
            animate={{ rotate: -360 }}
            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            className="absolute inset-10 rounded-full border border-dotted border-[#face6f]/30"
          />

          {/* Central Core Emblem */}
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="relative w-24 h-24 bg-gradient-to-b from-[#181a20] to-[#0a0b0d] rounded-2xl border border-white/10 flex flex-col items-center justify-center shadow-[0_0_40px_rgba(250,206,111,0.1)] overflow-hidden"
          >
            {/* Ambient inner glow */}
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-cyan-400 via-[#face6f] to-cyan-400"></div>
            
            {/* Glowing Bot Visual Structure */}
            <svg viewBox="0 0 100 100" className="w-14 h-14 text-[#face6f]">
              {/* Custom High-Quality Vector Geometric Mascot */}
              <motion.path 
                d="M30,35 L70,35 L80,55 L70,75 L30,75 L20,55 Z" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2.5" 
                strokeLinecap="round"
                strokeLinejoin="round"
                animate={{ strokeDashoffset: [0, 100, 0] }}
                transition={{ duration: 5, repeat: Infinity }}
              />
              <path d="M40,50 L45,55 L60,45" fill="none" stroke="#22d3ee" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="35" y1="65" x2="65" y2="65" stroke="currentColor" strokeWidth="2" strokeDasharray="3,3" />
            </svg>
          </motion.div>
        </div>

        {/* Brand Display Typography */}
        <motion.h2 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-[#face6f] to-[#b38421] tracking-[0.3em] uppercase mb-1 font-mono text-center"
        >
          ALGOTRADE
        </motion.h2>
        <p className="text-[10px] font-mono tracking-[0.5em] text-[#22d3ee] uppercase mb-10 text-center font-bold">
          TrisTech system engine
        </p>

        {/* State Information */}
        <div className="w-full flex flex-col items-center justify-center p-4 bg-white/[0.02] border border-white/5 rounded-xl backdrop-blur-md">
          {/* Main Action State text */}
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></div>
            <p className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
              {message}{dots}
            </p>
          </div>

          {/* Staggered diagnostic info */}
          <p className="text-[10px] sm:text-[11px] font-mono text-slate-500 text-center transition-all duration-300">
            {diagnostics[systemStage]}
          </p>
        </div>
      </div>

      {/* Footer Branding Area */}
      <div className="w-full max-w-sm px-8 pb-12 z-10 flex flex-col items-center gap-1">
        <div className="h-[1px] w-12 bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent"></div>
        <p className="text-[9px] font-mono tracking-widest text-[#face6f]/60 uppercase text-center mt-2">
          TrisTech system • Secure Instance
        </p>
      </div>
    </div>
  );
};
