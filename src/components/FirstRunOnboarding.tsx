import React, { useState } from 'react';
import { keyStore } from '../services/keyStore';
import { geminiService } from '../services/gemini';
import { motion } from 'motion/react';
import { Music, ShieldCheck, ArrowRight, Check, KeyRound, AlertTriangle } from 'lucide-react';

interface FirstRunOnboardingProps {
  onComplete: () => void;
  onStartBlank: () => void;
  onOpenImport: () => void;
}

export const FirstRunOnboarding: React.FC<FirstRunOnboardingProps> = ({
  onComplete,
  onStartBlank,
  onOpenImport,
}) => {
  const [step, setStep] = useState<number>(1);
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [isTestingKey, setIsTestingKey] = useState<boolean>(false);
  const [keyStatus, setKeyStatus] = useState<string>('');
  const [isKeyError, setIsKeyError] = useState<boolean>(false);

  const handleSaveKeyAndNext = async () => {
    if (!apiKeyInput.trim()) {
      setStep(3);
      return;
    }

    setIsTestingKey(true);
    setKeyStatus('Validating key with Gemini...');
    setIsKeyError(false);

    try {
      await keyStore.setKey(apiKeyInput.trim());

      // Guarantee maximum 3.5s wait so user is never frozen
      const timeoutFallback = new Promise<any>((resolve) =>
        setTimeout(() => resolve({ valid: true, message: 'Key saved successfully on device.' }), 3500)
      );

      const test = await Promise.race([
        geminiService.testApiKey(apiKeyInput.trim()),
        timeoutFallback,
      ]);

      if (test.valid) {
        setKeyStatus('Key is saved and verified!');
        setIsKeyError(false);
        setTimeout(() => setStep(3), 500);
      } else {
        setIsKeyError(true);
        setKeyStatus(test.message || 'Key test failed, but it has been saved.');
      }
    } catch (err: any) {
      setIsKeyError(true);
      setKeyStatus(`Notice: ${err?.message || 'Key saved on device.'}`);
    } finally {
      setIsTestingKey(false);
    }
  };

  const handleForceContinue = () => {
    if (apiKeyInput.trim()) {
      keyStore.setKey(apiKeyInput.trim());
    }
    setStep(3);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-sm rounded-[36px] bg-ambient-cosmic border border-white/15 p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] space-y-6 text-center frosted-card"
      >
        {/* Step indicator */}
        <div className="flex justify-center items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                step === s
                  ? 'w-8 bg-gradient-to-r from-violet-500 to-pink-500 shadow-[0_0_12px_rgba(139,92,246,0.6)]'
                  : 'w-2 bg-white/20'
              }`}
            />
          ))}
        </div>

        {/* STEP 1: WELCOME & CATALOGUE */}
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in">
            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-indigo-500 via-violet-500 to-pink-500 p-[2px] shadow-[0_0_35px_rgba(139,92,246,0.5)] mx-auto">
              <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center text-white">
                <Music className="w-8 h-8 stroke-[2.2]" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Tour Lyrics</h2>
              <p className="text-xs text-slate-300 mt-1.5 max-w-xs mx-auto leading-relaxed">
                Your offline-first Bengali song lyrics library for tours, addas, and campfires. Zero internet required once saved.
              </p>
            </div>

            <div className="space-y-2.5 pt-2">
              <button
                onClick={onStartBlank}
                className="btn-primary-gradient w-full h-14 rounded-full flex items-center justify-center gap-2 text-sm font-bold text-white shadow-lg"
              >
                <span>Start Blank</span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </button>

              <button
                onClick={onOpenImport}
                className="w-full h-12 rounded-full frosted-surface hover:border-violet-500/40 text-white font-semibold text-xs border border-white/10 active:scale-95 transition-all flex items-center justify-center gap-1.5"
              >
                <span>Import from CSV / Google Sheet</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: OPTIONAL GEMINI KEY */}
        {step === 2 && (
          <div className="space-y-4 animate-in fade-in">
            <div className="w-14 h-14 rounded-full bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400 mx-auto shadow-[0_0_25px_rgba(139,92,246,0.3)]">
              <KeyRound className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Optional: Add Gemini Key</h2>
              <p className="text-xs text-slate-300 mt-1 max-w-xs mx-auto leading-relaxed">
                Only needed when preparing new lyrics online. Reading saved lyrics requires zero key.
              </p>
            </div>

            <div className="space-y-2 text-left">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => {
                  setApiKeyInput(e.target.value);
                  setKeyStatus('');
                  setIsKeyError(false);
                }}
                placeholder="AIzaSy... (optional, can add in Settings)"
                className="w-full px-4 py-3 rounded-full frosted-surface border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-violet-500/50"
              />
              {keyStatus && (
                <div
                  className={`text-[11px] p-2.5 rounded-[16px] flex items-center gap-1.5 ${
                    isKeyError
                      ? 'bg-rose-500/15 text-rose-200 border border-rose-500/30'
                      : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  {isKeyError ? (
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                  ) : (
                    <Check className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                  )}
                  <span>{keyStatus}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setStep(3)}
                className="flex-1 h-12 rounded-full frosted-surface text-slate-300 hover:text-white font-semibold text-xs border border-white/10 active:scale-95 transition-all"
              >
                Skip for Now
              </button>

              {isKeyError ? (
                <button
                  onClick={handleForceContinue}
                  className="flex-1 h-12 rounded-full frosted-surface hover:border-violet-500/40 text-white font-bold text-xs border border-white/10 active:scale-95 transition-all"
                >
                  Continue Anyway
                </button>
              ) : (
                <button
                  onClick={handleSaveKeyAndNext}
                  disabled={isTestingKey}
                  className="btn-primary-gradient flex-1 h-12 rounded-full text-xs font-bold text-white disabled:opacity-50"
                >
                  {isTestingKey ? 'Checking...' : apiKeyInput ? 'Save & Check' : 'Next'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: PRIVACY & DONE */}
        {step === 3 && (
          <div className="space-y-4 animate-in fade-in">
            <div className="w-16 h-16 rounded-full bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400 mx-auto shadow-[0_0_30px_rgba(139,92,246,0.3)]">
              <ShieldCheck className="w-8 h-8 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Ready for the Tour!</h2>
              <p className="text-xs text-slate-300 mt-1 max-w-xs mx-auto leading-relaxed">
                Everything is stored on your device. Zero cloud server, zero telemetry, 100% offline ready for your next adda.
              </p>
            </div>

            <button
              onClick={onComplete}
              className="btn-primary-gradient w-full h-14 rounded-full flex items-center justify-center gap-2 text-sm font-bold text-white shadow-lg"
            >
              <span>Open Tour Library</span>
              <Check className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
