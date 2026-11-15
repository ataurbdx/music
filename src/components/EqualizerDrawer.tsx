import React from 'react';
import { useAudio } from '../context/AudioContext';
import { EQ_PRESETS, EQPresetKey } from '../services/audioEngine';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sliders, RotateCcw, Volume2 } from 'lucide-react';

interface EqualizerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const BAND_LABELS = [
  { freq: '60 Hz', label: 'Sub Bass', desc: 'Kick & sub rumble' },
  { freq: '230 Hz', label: 'Bass / Warmth', desc: 'Dholak body & low-end' },
  { freq: '910 Hz', label: 'Harmonium', desc: 'Vocal core & instruments' },
  { freq: '3.6 kHz', label: 'Dotara / Air', desc: 'Acoustic pluck attack' },
  { freq: '14 kHz', label: 'Brilliance', desc: 'Shaker & high sheen' },
];

export const EqualizerDrawer: React.FC<EqualizerDrawerProps> = ({ isOpen, onClose }) => {
  const {
    eqPreset,
    eqBands,
    preampDb,
    setEQPreset,
    setBandGain,
    setPreamp,
  } = useAudio();

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-md">
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 26, stiffness: 280 }}
          className="w-full max-w-[430px] bg-[#0A0E1A]/98 light:bg-white/98 border-t border-white/15 light:border-black/10 rounded-t-[36px] p-6 text-[#F1F5F9] light:text-[#0F172A] shadow-[0_-20px_50px_rgba(0,0,0,0.85)] max-h-[85vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10 light:border-black/10">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-full bg-white/[0.08] light:bg-black/[0.05] border border-[#8B5CF6]/30 flex items-center justify-center text-[#8B5CF6]">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white light:text-slate-900 tracking-tight">
                  5-Band Graphic Equalizer
                </h3>
                <p className="text-[11px] text-[#94A3B8] light:text-slate-500">
                  DSP Audio Engine • 64-bit float processing
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/5 light:bg-black/5 border border-white/10 light:border-black/10 flex items-center justify-center text-[#94A3B8] light:text-slate-600 hover:text-white light:hover:text-black active:scale-90 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Preset Selector Chips */}
          <div className="mt-4">
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] light:text-slate-500 block mb-2">
              Acoustic & Tour Presets
            </label>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
              {(Object.keys(EQ_PRESETS) as EQPresetKey[]).map((key) => {
                const preset = EQ_PRESETS[key];
                const isActive = eqPreset === key;
                return (
                  <button
                    key={key}
                    onClick={() => setEQPreset(key)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border shrink-0 ${
                      isActive
                        ? 'btn-primary-gradient text-white border-transparent shadow-md'
                        : 'bg-white/5 light:bg-black/5 text-[#94A3B8] light:text-slate-600 border-white/10 light:border-black/10 hover:text-white'
                    }`}
                  >
                    {preset.name}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-[#8B5CF6] font-medium mt-1">
              {EQ_PRESETS[eqPreset]?.description}
            </p>
          </div>

          {/* 5-Band Slider Stage */}
          <div className="mt-5 bg-white/[0.04] light:bg-slate-100 border border-white/[0.08] light:border-black/[0.08] rounded-[28px] p-5">
            <div className="grid grid-cols-5 gap-2 items-end h-44 pb-2">
              {BAND_LABELS.map((b, idx) => {
                const gain = eqBands[idx] || 0;
                return (
                  <div key={b.freq} className="flex flex-col items-center h-full justify-between">
                    <span className="text-[11px] font-mono font-bold text-[#8B5CF6]">
                      {gain > 0 ? `+${gain}` : gain} dB
                    </span>

                    {/* Vertical Slider */}
                    <div className="relative flex items-center justify-center h-28 w-8">
                      <input
                        type="range"
                        min="-12"
                        max="12"
                        step="0.5"
                        value={gain}
                        onChange={(e) => setBandGain(idx, parseFloat(e.target.value))}
                        className="w-28 h-2 -rotate-90 appearance-none bg-white/10 light:bg-black/10 rounded-full accent-[#8B5CF6] cursor-pointer"
                      />
                    </div>

                    <div className="text-center mt-1">
                      <div className="text-[11px] font-bold text-white light:text-slate-900 tracking-tight">
                        {b.freq}
                      </div>
                      <div className="text-[9px] text-[#94A3B8] light:text-slate-500 truncate max-w-[55px]">
                        {b.label}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Preamp Master Slider */}
          <div className="mt-4 bg-white/[0.04] light:bg-slate-100 border border-white/[0.08] light:border-black/[0.08] rounded-[24px] p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/10 light:bg-black/5 flex items-center justify-center text-[#8B5CF6]">
                <Volume2 className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-white light:text-slate-900 block">Preamp Gain</span>
                <span className="text-[10px] text-[#94A3B8] light:text-slate-500">Dynamic headroom & loud punch</span>
              </div>
            </div>

            <div className="flex items-center gap-3 w-40">
              <input
                type="range"
                min="-6"
                max="6"
                step="0.5"
                value={preampDb}
                onChange={(e) => setPreamp(parseFloat(e.target.value))}
                className="w-full h-1.5 appearance-none bg-white/10 light:bg-black/10 rounded-full accent-[#8B5CF6] cursor-pointer"
              />
              <span className="text-xs font-mono font-bold text-[#8B5CF6] w-12 text-right">
                {preampDb > 0 ? `+${preampDb}` : preampDb} dB
              </span>
            </div>
          </div>

          {/* Reset button */}
          <button
            onClick={() => setEQPreset('flat')}
            className="mt-5 w-full py-2.5 rounded-full bg-white/5 light:bg-black/5 border border-white/10 light:border-black/10 hover:border-white/20 text-[#94A3B8] light:text-slate-600 hover:text-white light:hover:text-black text-xs font-semibold flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset to Flat Reference
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
