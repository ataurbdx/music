import React, { useState } from 'react';
import { useAudio } from '../context/AudioContext';
import { motion, AnimatePresence } from 'motion/react';
import { Timer, X, Clock, Music, Check, Moon, PowerOff } from 'lucide-react';

interface SleepTimerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SleepTimerDrawer: React.FC<SleepTimerDrawerProps> = ({ isOpen, onClose }) => {
  const { sleepTimer, setSleepTimer, setSleepTimerSongs, cancelSleepTimer } = useAudio();
  const [customMinutes, setCustomMinutes] = useState<string>('');
  const [showCustom, setShowCustom] = useState<boolean>(false);

  if (!isOpen) return null;

  const formatCountdown = (totalSec: number) => {
    if (totalSec <= 0) return '00:00';
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleSelectMinutes = (mins: number, label: string) => {
    setSleepTimer(mins, label);
    onClose();
  };

  const handleSelectSongs = (count: number, label: string) => {
    setSleepTimerSongs(count, label);
    onClose();
  };

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(customMinutes, 10);
    if (!isNaN(val) && val > 0 && val <= 360) {
      setSleepTimer(val, `${val}m`);
      setShowCustom(false);
      setCustomMinutes('');
      onClose();
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-md select-none">
        {/* Backdrop click to close */}
        <div className="absolute inset-0" onClick={onClose} />

        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="relative w-full max-w-[430px] rounded-t-[36px] bg-[#0A0E1A]/98 light:bg-white/98 border-t border-white/15 light:border-black/10 p-6 shadow-[0_-15px_45px_rgba(0,0,0,0.85)] max-h-[85dvh] overflow-y-auto scrollbar-none z-10 text-[#F1F5F9] light:text-[#0F172A]"
        >
          {/* Top Grab Handle */}
          <div className="w-12 h-1 rounded-full bg-white/20 light:bg-black/20 mx-auto mb-4" />

          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10 light:border-black/10 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-white/[0.08] light:bg-black/[0.05] border border-[#8B5CF6]/30 flex items-center justify-center text-[#8B5CF6] shadow-[0_0_15px_rgba(139,92,246,0.25)]">
                <Timer className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white light:text-slate-900">Sleep Timer</h3>
                <p className="text-[11px] text-[#94A3B8] light:text-slate-500">Auto-pause music when you rest</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 light:bg-black/5 hover:bg-white/15 flex items-center justify-center text-[#94A3B8] light:text-slate-600 hover:text-white light:hover:text-black transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Active Countdown Hero Box (if timer is running) */}
          {sleepTimer.isActive && (
            <div className="p-4 rounded-[24px] bg-gradient-to-r from-[#2E1065] to-[#1E1B4B] border border-[#8B5CF6]/40 mb-5 flex items-center justify-between shadow-[0_0_25px_rgba(139,92,246,0.25)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full btn-primary-gradient text-white flex items-center justify-center font-bold">
                  <Moon className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#C4B5FD]">Timer Active ({sleepTimer.initialLabel})</div>
                  <div className="text-xl font-extrabold text-white font-mono tracking-wider">
                    {sleepTimer.type === 'time'
                      ? formatCountdown(sleepTimer.secondsRemaining)
                      : `${sleepTimer.songsRemaining} ${sleepTimer.songsRemaining === 1 ? 'song' : 'songs'} left`}
                  </div>
                </div>
              </div>

              <button
                onClick={() => cancelSleepTimer()}
                className="px-3 py-1.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-bold active:scale-95 transition-all flex items-center gap-1"
              >
                <PowerOff className="w-3.5 h-3.5" />
                <span>Turn Off</span>
              </button>
            </div>
          )}

          {/* Section 1: Standard Time Presets */}
          <div className="space-y-2 mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] light:text-slate-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#8B5CF6]" /> Stop After Minutes
            </span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { mins: 15, label: '15 Min' },
                { mins: 30, label: '30 Min' },
                { mins: 45, label: '45 Min' },
                { mins: 60, label: '1 Hour' },
                { mins: 90, label: '1.5 Hours' },
                { mins: 120, label: '2 Hours' },
              ].map((opt) => {
                const isSelected =
                  sleepTimer.isActive &&
                  sleepTimer.type === 'time' &&
                  sleepTimer.targetSeconds === opt.mins * 60;
                return (
                  <button
                    key={opt.mins}
                    onClick={() => handleSelectMinutes(opt.mins, opt.label)}
                    className={`py-2.5 px-2 rounded-[18px] text-xs font-semibold border transition-all flex items-center justify-center gap-1.5 active:scale-95 ${
                      isSelected
                        ? 'btn-primary-gradient text-white border-transparent shadow-md'
                        : 'bg-white/5 light:bg-black/5 border-white/10 light:border-black/10 text-white light:text-slate-800 hover:border-[#8B5CF6]/40'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Stop by Song Count */}
          <div className="space-y-2 mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] light:text-slate-500 flex items-center gap-1.5">
              <Music className="w-3.5 h-3.5 text-[#8B5CF6]" /> Stop After Songs
            </span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { count: 1, label: 'End of This Song' },
                { count: 2, label: 'After 2 Songs' },
                { count: 3, label: 'After 3 Songs' },
                { count: 5, label: 'After 5 Songs' },
              ].map((opt) => {
                const isSelected =
                  sleepTimer.isActive &&
                  sleepTimer.type === 'songs' &&
                  sleepTimer.initialLabel === opt.label;
                return (
                  <button
                    key={opt.count}
                    onClick={() => handleSelectSongs(opt.count, opt.label)}
                    className={`py-2.5 px-3 rounded-[18px] text-xs font-semibold border transition-all flex items-center justify-center gap-1.5 active:scale-95 ${
                      isSelected
                        ? 'btn-primary-gradient text-white border-transparent shadow-md'
                        : 'bg-white/5 light:bg-black/5 border-white/10 light:border-black/10 text-white light:text-slate-800 hover:border-[#8B5CF6]/40'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 3: Custom Duration */}
          <div className="pt-2 border-t border-white/10 light:border-black/10">
            {!showCustom ? (
              <button
                onClick={() => setShowCustom(true)}
                className="w-full py-2.5 rounded-[18px] bg-white/5 light:bg-black/5 border border-white/10 light:border-black/10 text-xs font-semibold text-[#94A3B8] light:text-slate-600 hover:text-white light:hover:text-black hover:border-white/20 active:scale-95 transition-all text-center"
              >
                + Set Custom Minutes
              </button>
            ) : (
              <form onSubmit={handleApplyCustom} className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  min="1"
                  max="360"
                  placeholder="Minutes (e.g. 25)"
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(e.target.value)}
                  className="flex-1 px-3.5 py-2 rounded-[16px] bg-white/[0.05] light:bg-slate-100 border border-white/15 light:border-black/10 text-white light:text-slate-900 text-xs font-mono focus:outline-none focus:border-[#8B5CF6]"
                  autoFocus
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-[16px] btn-primary-gradient text-white text-xs font-bold active:scale-95 shadow-sm"
                >
                  Set
                </button>
                <button
                  type="button"
                  onClick={() => setShowCustom(false)}
                  className="px-3 py-2 rounded-[16px] bg-white/10 light:bg-black/10 text-[#94A3B8] light:text-slate-600 text-xs"
                >
                  Cancel
                </button>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
