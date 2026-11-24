import React, { useState, useEffect, useRef } from 'react';
import {
  KeyRound,
  Eye,
  EyeOff,
  Lightbulb,
  Heart,
  Lock,
  Sparkles,
  Loader2,
  Check,
  ArrowRight,
} from 'lucide-react';
import { AccessGateConfig } from '../types';
import { getReadableFirestoreErrorMessage, hashGatePassword } from '../lib/memoriesService';

interface PasswordGatePageProps {
  gateConfig: AccessGateConfig;
  isLoadingGate: boolean;
  isOwner: boolean;
  onUnlock: () => void;
  onSignInOwner: () => Promise<void>;
  onSaveGateConfig: (params: {
    newPassword?: string;
    hint: string;
    welcomeTitle: string;
    welcomeSubtitle: string;
  }) => Promise<void>;
  initialOpenAdmin?: boolean;
}

export const PasswordGatePage: React.FC<PasswordGatePageProps> = ({
  gateConfig,
  isLoadingGate,
  isOwner,
  onUnlock,
  onSignInOwner,
  onSaveGateConfig,
  initialOpenAdmin = false,
}) => {
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showHint, setShowHint] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [isUnlocking, setIsUnlocking] = useState<boolean>(false);

  // Discreet creator/owner customization drawer
  const [isCreatorPanelOpen, setIsCreatorPanelOpen] = useState<boolean>(initialOpenAdmin);
  const [newPasswordInput, setNewPasswordInput] = useState<string>('');
  const [hintInput, setHintInput] = useState<string>(gateConfig.hint);
  const [titleInput, setTitleInput] = useState<string>(gateConfig.welcomeTitle);
  const [subtitleInput, setSubtitleInput] = useState<string>(gateConfig.welcomeSubtitle);
  const [isSavingGate, setIsSavingGate] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const shakeTimerRef = useRef<number | null>(null);
  const unlockTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setHintInput(gateConfig.hint);
    setTitleInput(gateConfig.welcomeTitle);
    setSubtitleInput(gateConfig.welcomeSubtitle);
  }, [gateConfig]);

  useEffect(() => {
    if (initialOpenAdmin) {
      setIsCreatorPanelOpen(true);
    }
  }, [initialOpenAdmin]);

  useEffect(() => {
    return () => {
      if (shakeTimerRef.current !== null) window.clearTimeout(shakeTimerRef.current);
      if (unlockTimerRef.current !== null) window.clearTimeout(unlockTimerRef.current);
    };
  }, []);

  const triggerShake = () => {
    setIsShaking(true);
    if (shakeTimerRef.current !== null) window.clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = window.setTimeout(() => {
      setIsShaking(false);
      shakeTimerRef.current = null;
    }, 450);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isChecking || isUnlocking) return;

    const trimmed = passwordInput.trim();
    if (!trimmed) {
      setErrorMessage('Please enter the secret password first.');
      triggerShake();
      return;
    }

    setIsChecking(true);
    setErrorMessage(null);

    try {
      const enteredHash = await hashGatePassword(trimmed);
      if (enteredHash === gateConfig.passwordHash) {
        setIsUnlocking(true);
        if (unlockTimerRef.current !== null) window.clearTimeout(unlockTimerRef.current);
        unlockTimerRef.current = window.setTimeout(() => {
          unlockTimerRef.current = null;
          onUnlock();
        }, 550);
      } else {
        setShowHint(true);
        setErrorMessage("That's not quite it, my love — take a peek at the hint below ❤️");
        triggerShake();
      }
    } finally {
      setIsChecking(false);
    }
  };

  const handleSaveCreatorSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus(null);
    setIsSavingGate(true);

    try {
      await onSaveGateConfig({
        newPassword: newPasswordInput.trim() || undefined,
        hint: hintInput,
        welcomeTitle: titleInput,
        welcomeSubtitle: subtitleInput,
      });
      setNewPasswordInput('');
      setSaveStatus({
        type: 'success',
        text: 'Password & hint saved to the cloud! Tsi will see these updates on any device.',
      });
    } catch (err) {
      setSaveStatus({
        type: 'error',
        text: getReadableFirestoreErrorMessage(err, 'Failed to save gate settings.'),
      });
    } finally {
      setIsSavingGate(false);
    }
  };

  return (
    <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 py-10">
      <div
        className={`w-full max-w-lg transition-all duration-500 ${
          isUnlocking ? 'scale-105 opacity-0' : 'scale-100 opacity-100'
        }`}
      >
        {/* Main Velvet Invitation Card */}
        <section
          aria-label="Birthday Surprise Password Gate"
          className={`romantic-card rounded-3xl p-6 sm:p-10 border border-rose-500/25 shadow-2xl shadow-black/70 bg-gradient-to-b from-[#2b040d]/95 via-[#1c0208]/95 to-[#120105]/98 ${
            isShaking ? 'animate-gate-shake' : ''
          }`}
        >
          {/* Wax Seal Crest */}
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-rose-600 to-red-900 border-2 border-amber-300/75 flex items-center justify-center shadow-xl shadow-red-950/70 mb-5">
              {isUnlocking ? (
                <Sparkles className="w-7 h-7 text-amber-200" />
              ) : (
                <Heart className="w-7 h-7 fill-amber-200 text-amber-200" />
              )}
            </div>

            <p className="text-[11px] uppercase tracking-[0.22em] text-rose-300/80 font-semibold mb-2">
              00 · Private Invitation
            </p>

            <h1 className="font-serif-cormorant text-3xl sm:text-5xl font-bold text-white tracking-tight leading-tight">
              {gateConfig.welcomeTitle}
            </h1>

            <p className="mt-3 text-xs sm:text-sm text-rose-200/80 max-w-md font-light leading-relaxed">
              {gateConfig.welcomeSubtitle}
            </p>
          </div>

          {/* Password & Hint Form */}
          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div>
              <label
                htmlFor="gate-password-input"
                className="block text-[11px] uppercase tracking-wider text-rose-300/85 font-semibold mb-1.5"
              >
                Secret Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-rose-400/70">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  id="gate-password-input"
                  type={showPassword ? 'text' : 'password'}
                  value={passwordInput}
                  onChange={(e) => {
                    setPasswordInput(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  autoComplete="off"
                  autoCapitalize="none"
                  placeholder="Type our secret password..."
                  disabled={isLoadingGate || isUnlocking}
                  className="w-full min-h-[48px] bg-black/45 border border-rose-500/30 focus:border-rose-400 rounded-xl pl-10 pr-12 py-3 text-sm text-white placeholder:text-rose-300/40 focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 px-3.5 min-w-[44px] flex items-center justify-center text-rose-300/70 hover:text-white transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error Feedback */}
            {errorMessage && (
              <p
                role="alert"
                className="text-xs text-rose-200 bg-rose-950/75 border border-rose-500/40 rounded-xl px-3.5 py-2.5 leading-relaxed"
              >
                {errorMessage}
              </p>
            )}

            {/* Interactive Hint Drawer */}
            <div className="rounded-2xl bg-rose-950/35 border border-rose-500/20 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowHint((prev) => !prev)}
                className="w-full min-h-[44px] px-4 py-2.5 flex items-center justify-between text-sm font-medium text-amber-200/90 hover:text-amber-100 hover:bg-rose-950/50 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-300 shrink-0" />
                  <span>{showHint ? 'Hint' : 'Need a hint? Tap to reveal'}</span>
                </span>
                <span className="text-xs text-rose-300/75">
                  {showHint ? 'Hide' : 'Show'}
                </span>
              </button>

              {showHint && (
                <div className="px-4 pb-4 pt-2.5 text-lg sm:text-xl text-rose-100/95 border-t border-rose-500/15 leading-relaxed font-serif-cormorant italic">
                  “{gateConfig.hint}”
                </div>
              )}
            </div>

            {/* Primary Unlock CTA */}
            <button
              type="submit"
              disabled={isLoadingGate || isChecking || isUnlocking}
              className="w-full min-h-[48px] px-5 py-3 bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 active:scale-[0.99] text-white rounded-xl text-sm font-semibold shadow-lg shadow-rose-950/60 flex items-center justify-center gap-2 transition-all whitespace-nowrap cursor-pointer disabled:opacity-60"
            >
              {isLoadingGate || isChecking ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{isLoadingGate ? 'Preparing Surprise...' : 'Checking...'}</span>
                </>
              ) : isUnlocking ? (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Opening Your Gift...</span>
                </>
              ) : (
                <>
                  <span>Unlock Photos & Videos</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Discreet Owner Quick Actions */}
          <div className="mt-6 pt-5 border-t border-rose-500/15 flex flex-wrap items-center justify-between gap-2 text-xs">
            <button
              type="button"
              onClick={() => setIsCreatorPanelOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-rose-300/55 hover:text-rose-200 transition-colors py-1 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{isCreatorPanelOpen ? 'Hide Creator Settings' : 'Customize Password & Hint'}</span>
            </button>

            {isOwner && (
              <button
                type="button"
                onClick={onUnlock}
                className="inline-flex items-center gap-1 text-amber-200/85 hover:text-amber-100 font-medium py-1 whitespace-nowrap cursor-pointer"
              >
                <span>Enter as Creator</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Creator Customization Panel */}
          {isCreatorPanelOpen && (
            <div className="mt-4 pt-4 border-t border-rose-500/20 space-y-3">
              {!isOwner ? (
                <div className="rounded-xl bg-black/35 border border-rose-500/25 p-4 text-center space-y-3">
                  <p className="text-xs text-rose-200/80 leading-relaxed">
                    Sign in with your creator Google account to change the secret password, hint, or welcome note for Tsi.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      onSignInOwner().catch((err) =>
                        setSaveStatus({
                          type: 'error',
                          text: getReadableFirestoreErrorMessage(err, 'Sign-in failed.'),
                        })
                      )
                    }
                    className="w-full min-h-[44px] px-4 py-2.5 bg-white text-rose-950 hover:bg-rose-50 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Sign In with Creator Google Account
                  </button>
                  {saveStatus && saveStatus.type === 'error' && (
                    <p className="text-xs text-rose-200 bg-rose-950/70 border border-rose-500/35 rounded-lg p-2">
                      {saveStatus.text}
                    </p>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSaveCreatorSettings} className="space-y-3 text-left">
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-rose-300/80 font-semibold mb-1">
                      New Secret Password (leave blank to keep current)
                    </label>
                    <input
                      type="text"
                      value={newPasswordInput}
                      onChange={(e) => setNewPasswordInput(e.target.value)}
                      placeholder="e.g. tsi, our anniversary date, or nickname"
                      className="w-full bg-black/45 border border-rose-500/30 rounded-xl px-3 py-2 text-xs text-white placeholder:text-rose-300/35 focus:outline-none focus:border-rose-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-rose-300/80 font-semibold mb-1">
                      Password Hint
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={300}
                      value={hintInput}
                      onChange={(e) => setHintInput(e.target.value)}
                      placeholder="Give Tsi a sweet clue..."
                      className="w-full bg-black/45 border border-rose-500/30 rounded-xl px-3 py-2 text-xs text-white placeholder:text-rose-300/35 focus:outline-none focus:border-rose-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-rose-300/80 font-semibold mb-1">
                      Front Page Headline
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={160}
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.target.value)}
                      className="w-full bg-black/45 border border-rose-500/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-rose-300/80 font-semibold mb-1">
                      Front Page Message
                    </label>
                    <textarea
                      rows={2}
                      maxLength={400}
                      value={subtitleInput}
                      onChange={(e) => setSubtitleInput(e.target.value)}
                      className="w-full bg-black/45 border border-rose-500/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-400"
                    />
                  </div>

                  {saveStatus && (
                    <div
                      className={`text-xs rounded-xl p-2.5 border ${
                        saveStatus.type === 'success'
                          ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-200'
                          : 'bg-rose-950/70 border-rose-500/40 text-rose-200'
                      }`}
                    >
                      {saveStatus.text}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSavingGate}
                    className="w-full min-h-[44px] px-4 py-2 bg-rose-700 hover:bg-rose-600 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
                  >
                    {isSavingGate ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>{isSavingGate ? 'Saving...' : 'Save Password & Hint'}</span>
                  </button>
                </form>
              )}
            </div>
          )}
        </section>
      </div>

      <style>{`
        @keyframes gateShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-5px); }
          80% { transform: translateX(5px); }
        }
        .animate-gate-shake {
          animation: gateShake 0.42s ease-in-out;
        }
      `}</style>
    </div>
  );
};
