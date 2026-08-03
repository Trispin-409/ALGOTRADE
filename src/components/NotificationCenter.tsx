import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, BellOff, Volume2, VolumeX, ShieldAlert, Check, X, AlertTriangle, Zap, ExternalLink, Trash2, CheckCheck, Newspaper } from 'lucide-react';
import { useStore, PushNotification } from '../store';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  permission: NotificationPermission;
  onRequestPermission: () => void;
  onTriggerTest: () => void;
  onOpenNewsTab: () => void;
  isDNDActive: boolean;
  onToggleDND: () => void;
  selectedSymbol: string;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  isOpen,
  onClose,
  permission,
  onRequestPermission,
  onTriggerTest,
  onOpenNewsTab,
  isDNDActive,
  onToggleDND,
  selectedSymbol,
}) => {
  const pushNotifications = useStore(state => state.pushNotifications);
  const pushNotificationsEnabled = useStore(state => state.pushNotificationsEnabled);
  const audioAlertsEnabled = useStore(state => state.audioAlertsEnabled);
  const setPushNotificationsEnabled = useStore(state => state.setPushNotificationsEnabled);
  const setAudioAlertsEnabled = useStore(state => state.setAudioAlertsEnabled);
  const markPushNotificationAsRead = useStore(state => state.markPushNotificationAsRead);
  const clearAllPushNotifications = useStore(state => state.clearAllPushNotifications);

  const unreadCount = pushNotifications.filter(n => !n.read).length;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex justify-end">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Slide-over Drawer */}
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="relative w-full max-w-md bg-[#090d16] border-l border-white/10 h-full flex flex-col z-10 text-white shadow-2xl"
        >
          {/* Header */}
          <div className="p-5 border-b border-white/10 flex items-center justify-between bg-black/40">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-400">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-white text-base tracking-tight uppercase">Push Notification Hub</h3>
                <p className="text-[10px] font-mono text-slate-400">REAL-TIME HIGH-IMPACT NEWS ALERTS ({selectedSymbol})</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">

            {/* BROWSER PUSH PERMISSION STATUS BANNER */}
            <div className="p-4 rounded-xl bg-black/50 border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase text-slate-400">Browser Push Permission</span>
                <span className={`text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded border ${
                  permission === 'granted' 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                    : permission === 'denied' 
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' 
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                }`}>
                  {permission === 'granted' ? 'GRANTED ✓' : permission === 'denied' ? 'BLOCKED ✗' : 'NEEDS PERMISSION'}
                </span>
              </div>

              {permission !== 'granted' && (
                <button
                  onClick={onRequestPermission}
                  className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-black font-black text-xs uppercase tracking-wider rounded-lg transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
                >
                  <ShieldAlert className="w-4 h-4" />
                  Grant Web Push Permission
                </button>
              )}
            </div>

            {/* TOGGLES & CONTROLS */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono font-black uppercase tracking-wider text-slate-500">Alert Controls</span>

              <div className="grid grid-cols-1 gap-2.5">
                {/* Push Notifications Toggle */}
                <div className="p-3.5 bg-black/40 border border-white/10 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Bell className={`w-4 h-4 ${pushNotificationsEnabled ? 'text-amber-400' : 'text-slate-500'}`} />
                    <div>
                      <h5 className="text-xs font-bold text-white uppercase">Push Alerts</h5>
                      <p className="text-[10px] text-slate-400">Desktop & Mobile Push Popup</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setPushNotificationsEnabled(!pushNotificationsEnabled)}
                    className={`w-11 h-6 rounded-full transition-colors relative ${pushNotificationsEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${pushNotificationsEnabled ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>

                {/* Audio Chime Toggle */}
                <div className="p-3.5 bg-black/40 border border-white/10 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {audioAlertsEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
                    <div>
                      <h5 className="text-xs font-bold text-white uppercase">Audio Alert Sound</h5>
                      <p className="text-[10px] text-slate-400">Web Audio High-Tech Chime</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setAudioAlertsEnabled(!audioAlertsEnabled)}
                    className={`w-11 h-6 rounded-full transition-colors relative ${audioAlertsEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${audioAlertsEnabled ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>

                {/* Do Not Disturb */}
                <div className="p-3.5 bg-black/40 border border-white/10 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <BellOff className={`w-4 h-4 ${isDNDActive ? 'text-rose-400' : 'text-slate-500'}`} />
                    <div>
                      <h5 className="text-xs font-bold text-white uppercase">Do Not Disturb</h5>
                      <p className="text-[10px] text-slate-400">Mute all incoming alerts</p>
                    </div>
                  </div>
                  <button
                    onClick={onToggleDND}
                    className={`w-11 h-6 rounded-full transition-colors relative ${isDNDActive ? 'bg-rose-500' : 'bg-slate-700'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${isDNDActive ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>
              </div>
            </div>

            {/* INSTANT TEST TRIGGER BUTTON */}
            <button
              onClick={onTriggerTest}
              className="w-full py-3 px-4 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/30 rounded-xl font-mono text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95"
            >
              <Zap className="w-4 h-4 text-teal-400" />
              Test High-Impact Push Alert Now
            </button>

            {/* RECENT NOTIFICATIONS HISTORY */}
            <div className="space-y-3 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-black uppercase tracking-wider text-slate-500">
                  Alert History ({pushNotifications.length})
                </span>
                {pushNotifications.length > 0 && (
                  <button
                    onClick={clearAllPushNotifications}
                    className="text-[10px] font-mono text-rose-400 hover:text-rose-300 flex items-center gap-1 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" /> Clear All
                  </button>
                )}
              </div>

              {pushNotifications.length === 0 ? (
                <div className="py-12 text-center text-slate-500 font-mono text-xs space-y-2">
                  <BellOff className="w-8 h-8 mx-auto opacity-40" />
                  <p>No high-impact news alerts recorded yet.</p>
                  <p className="text-[10px] text-slate-600">The monitor continuously checks breaking news for {selectedSymbol}.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {pushNotifications.map(notif => (
                    <div
                      key={notif.id}
                      onClick={() => markPushNotificationAsRead(notif.id)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        !notif.read
                          ? 'bg-rose-500/10 border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.15)]'
                          : 'bg-black/40 border-white/10 hover:border-white/20 opacity-80'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[9px] font-mono font-black uppercase">
                            HIGH IMPACT
                          </span>
                          <span className="text-[10px] font-mono font-bold text-amber-400 uppercase">
                            {notif.symbol}
                          </span>
                        </div>
                        <span className="text-[9px] font-mono text-slate-500">
                          {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <h5 className="text-xs font-bold text-white mb-1 leading-snug">
                        {notif.title}
                      </h5>
                      <p className="text-[11px] text-slate-300 font-sans line-clamp-2 leading-relaxed mb-2">
                        {notif.body}
                      </p>

                      <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 pt-1 border-t border-white/5">
                        <span>Source: {notif.source || 'Market Feed'}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenNewsTab();
                            onClose();
                          }}
                          className="text-teal-400 hover:text-teal-300 flex items-center gap-1 font-bold"
                        >
                          View Fundamentals <ExternalLink className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
