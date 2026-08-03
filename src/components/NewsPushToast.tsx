import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, ExternalLink, X, Newspaper, Zap, Volume2 } from 'lucide-react';
import { PushNotification } from '../store';

interface NewsPushToastProps {
  alert: PushNotification | null;
  onDismiss: () => void;
  onOpenNews: () => void;
}

export const NewsPushToast: React.FC<NewsPushToastProps> = ({ alert, onDismiss, onOpenNews }) => {
  useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 12000);
    return () => clearTimeout(timer);
  }, [alert, onDismiss]);

  if (!alert) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.9 }}
        className="fixed top-16 right-4 sm:right-6 z-[100] max-w-md w-[calc(100vw-2rem)] sm:w-96 bg-black/90 border-2 border-rose-500/50 shadow-[0_0_30px_rgba(244,63,94,0.3)] rounded-2xl p-4 backdrop-blur-xl text-white overflow-hidden"
      >
        <div className="absolute -top-12 -right-12 w-28 h-28 bg-rose-500/20 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex items-start justify-between gap-3 mb-2 border-b border-rose-500/20 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
            </span>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/30 text-rose-400 font-mono text-[10px] font-black uppercase tracking-wider">
              <AlertTriangle className="w-3 h-3" />
              HIGH-IMPACT NEWS DETECTED
            </div>
            <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 uppercase">
              {alert.symbol}
            </span>
          </div>

          <button
            onClick={onDismiss}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-1.5 my-2">
          <h4 className="text-xs font-black text-white leading-snug tracking-tight">
            {alert.title}
          </h4>
          <p className="text-[11px] text-slate-300 font-sans line-clamp-3 leading-relaxed">
            {alert.body}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-white/10">
          <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-400">
            <span className="px-1.5 py-0.5 bg-white/5 rounded text-slate-300 font-bold uppercase">{alert.source || 'Market Feed'}</span>
            <span>•</span>
            <span>{new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onOpenNews();
                onDismiss();
              }}
              className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white font-mono text-[10px] font-bold uppercase rounded-lg shadow-lg shadow-rose-500/20 transition-all flex items-center gap-1 active:scale-95"
            >
              <Newspaper className="w-3 h-3" />
              View Fundamentals
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
