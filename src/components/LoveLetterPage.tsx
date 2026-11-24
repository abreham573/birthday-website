import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Heart,
  Sparkles,
  Music,
  Camera,
  Edit3,
  Check,
  RefreshCw,
  Lock,
  Loader2,
  MailOpen,
} from 'lucide-react';
import { LoveLetterData } from '../types';
import { DEFAULT_LOVE_LETTER } from '../data/defaultLetter';
import { getReadableFirestoreErrorMessage } from '../lib/memoriesService';

interface LoveLetterPageProps {
  letterData: LoveLetterData;
  isOwner?: boolean;
  onSignInOwner?: () => Promise<void>;
  onUpdateLetter: (updated: LoveLetterData) => Promise<void> | void;
  onHeartTap: (x: number, y: number, customText?: string) => void;
  tapCount: number;
  onNavigateToMemories: () => void;
  onNavigateToSong: () => void;
}

type LetterPhase = 'sealed' | 'opening' | 'open';

export const LoveLetterPage: React.FC<LoveLetterPageProps> = ({
  letterData,
  isOwner = false,
  onSignInOwner,
  onUpdateLetter,
  onHeartTap,
  tapCount,
  onNavigateToMemories,
  onNavigateToSong,
}) => {
  const [phase, setPhase] = useState<LetterPhase>('sealed');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editedLetter, setEditedLetter] = useState<LoveLetterData>(letterData);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [photoSaveStatus, setPhotoSaveStatus] = useState<string | null>(null);
  const [bottomPhotoFailed, setBottomPhotoFailed] = useState<boolean>(false);
  const openTimerRef = useRef<number | null>(null);

  const bottomPhotoUrl =
    letterData.bottomPhotoUrl || DEFAULT_LOVE_LETTER.bottomPhotoUrl || '';
  const bottomPhotoCaption =
    letterData.bottomPhotoCaption || DEFAULT_LOVE_LETTER.bottomPhotoCaption || '';

  useEffect(() => {
    setBottomPhotoFailed(false);
  }, [bottomPhotoUrl]);

  useEffect(() => {
    if (!isEditing) {
      setEditedLetter(letterData);
    }
  }, [letterData, isEditing]);

  useEffect(() => {
    return () => {
      if (openTimerRef.current !== null) {
        window.clearTimeout(openTimerRef.current);
      }
    };
  }, []);

  const handleOpenLetter = (e: React.MouseEvent<HTMLElement>) => {
    if (phase !== 'sealed') return;
    onHeartTap(e.clientX, e.clientY, 'Opened with Love ❤️');
    setPhase('opening');
    openTimerRef.current = window.setTimeout(() => {
      setPhase('open');
      openTimerRef.current = null;
    }, 1250);
  };

  const handleFoldBack = () => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    setIsEditing(false);
    setPhase('sealed');
  };

  const handleLetterTap = (e: React.MouseEvent<HTMLElement>) => {
    if (isEditing) return;
    onHeartTap(e.clientX, e.clientY);
  };

  const handleSaveEdit = async () => {
    setSaveError(null);
    if (!isOwner) {
      setSaveError(
        'Please sign in with your creator Google account above before saving to the cloud.'
      );
      return;
    }
    setIsSaving(true);
    try {
      await onUpdateLetter(editedLetter);
      setIsEditing(false);
    } catch (err) {
      setSaveError(
        getReadableFirestoreErrorMessage(err, 'Could not save changes to cloud.')
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] pb-28 pt-4 sm:pt-8 max-w-4xl mx-auto px-4 sm:px-6">
      {/* Chapter 02 Header */}
      <section className="text-center max-w-2xl mx-auto mb-6 sm:mb-10">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-950/60 border border-rose-500/25 text-rose-300 text-xs font-medium mb-3 backdrop-blur-md">
          <Heart className="w-3.5 h-3.5 fill-current text-rose-400" />
          <span>Chapter 02 · Words From The Heart</span>
          <Heart className="w-3.5 h-3.5 fill-current text-rose-400" />
        </div>

        <h1 className="font-serif-cormorant text-3xl sm:text-5xl font-bold text-white tracking-tight leading-tight">
          A Love Letter For{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-300 via-rose-100 to-amber-200">
            Tsi
          </span>
        </h1>

        <p className="mt-2 text-xs sm:text-sm text-rose-200/80 max-w-lg mx-auto font-light leading-relaxed">
          Written with every beat of my heart on your special day.
        </p>

        {/* Interactive Heart Secret Hint & Counter */}
        {phase === 'open' && (
          <div className="flex items-center justify-center gap-3 mt-3 text-xs text-rose-300/80">
            <span className="flex items-center gap-1.5 bg-rose-950/40 px-3 py-1 rounded-full border border-rose-500/20">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Tap anywhere on the letter paper to spark hidden hearts!</span>
            </span>
            {tapCount > 0 && (
              <span className="flex items-center gap-1 text-rose-400 font-medium">
                <Heart className="w-3.5 h-3.5 fill-current" />
                <span>
                  {tapCount} {tapCount === 1 ? 'spark' : 'sparks'}
                </span>
              </span>
            )}
          </div>
        )}
      </section>

      <AnimatePresence mode="wait">
        {/* Sealed & Real-Life Opening Envelope Animation */}
        {phase !== 'open' ? (
          <motion.div
            key="sealed-envelope-stage"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.25 } }}
            className="max-w-lg mx-auto py-4"
            style={{ perspective: '1400px' }}
          >
            {/* Physical 3D Envelope */}
            <div className="relative mx-auto w-full max-w-[460px] pt-8 pb-4">
              {/* Envelope Outer Shadow & Body */}
              <div className="relative h-[300px] sm:h-[330px] rounded-2xl shadow-2xl shadow-black/80 bg-gradient-to-b from-[#4c0818] to-[#2b030c] border border-rose-400/25 overflow-visible">
                {/* Inside of Envelope Back Wall */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-[#2a030b] to-[#1a0106]" />

                {/* Folded Letter Paper Tucked Inside Envelope — Rises Out When Opening */}
                <motion.div
                  initial={{ y: 24, scale: 0.92, opacity: 0.95 }}
                  animate={
                    phase === 'opening'
                      ? {
                          y: [-8, -110, -145],
                          scale: [0.94, 0.98, 1.03],
                          opacity: [0.95, 1, 1],
                        }
                      : { y: 22, scale: 0.92, opacity: 0.95 }
                  }
                  transition={
                    phase === 'opening'
                      ? {
                          duration: 0.85,
                          delay: 0.35,
                          ease: [0.22, 1, 0.36, 1],
                        }
                      : { duration: 0.3 }
                  }
                  className="absolute left-5 right-5 top-4 bottom-6 rounded-xl bg-gradient-to-b from-[#fffdf8] via-[#faf0e4] to-[#eedccb] border border-amber-800/20 shadow-xl p-5 flex flex-col justify-between overflow-hidden"
                  style={{ zIndex: phase === 'opening' ? 25 : 10 }}
                >
                  {/* Letter Paper Stationery Lines */}
                  <div
                    className="absolute inset-3 rounded-lg border border-rose-900/15 pointer-events-none"
                    aria-hidden="true"
                  />
                  <div className="relative z-10 text-center pt-1">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-rose-800/70 font-semibold">
                      Personal Letter
                    </p>
                    <p className="font-serif-cormorant text-xl sm:text-2xl font-bold text-rose-950 mt-1">
                      {letterData.salutation}
                    </p>
                  </div>
                  <div className="relative z-10 space-y-2 opacity-45 px-2">
                    <div className="h-1.5 bg-rose-900/25 rounded-full w-full" />
                    <div className="h-1.5 bg-rose-900/25 rounded-full w-11/12" />
                    <div className="h-1.5 bg-rose-900/25 rounded-full w-4/5" />
                  </div>
                </motion.div>

                {/* Front Envelope Left/Right/Bottom Folds (Pocket Mask) */}
                <div
                  className="absolute inset-0 rounded-2xl pointer-events-none overflow-hidden"
                  style={{ zIndex: 20 }}
                >
                  {/* Left Triangle Fold */}
                  <div
                    className="absolute inset-0 bg-gradient-to-br from-[#610b20] to-[#3c0513]"
                    style={{ clipPath: 'polygon(0 0, 52% 54%, 0 100%)' }}
                  />
                  {/* Right Triangle Fold */}
                  <div
                    className="absolute inset-0 bg-gradient-to-bl from-[#5a091d] to-[#360410]"
                    style={{ clipPath: 'polygon(100% 0, 48% 54%, 100% 100%)' }}
                  />
                  {/* Bottom Pocket Fold */}
                  <div
                    className="absolute inset-0 bg-gradient-to-t from-[#6b0d24] via-[#4e0718] to-[#3e0513] border-t border-rose-300/15"
                    style={{ clipPath: 'polygon(0 100%, 50% 42%, 100% 100%)' }}
                  />

                  {/* Address Label on Envelope Front */}
                  <div className="absolute bottom-6 left-0 right-0 text-center px-6">
                    <p className="text-[10px] uppercase tracking-[0.26em] text-amber-200/80 font-semibold">
                      Strictly Confidential · Birthday Surprise
                    </p>
                    <h2 className="font-serif-cormorant text-2xl sm:text-3xl font-bold text-white mt-0.5 drop-shadow">
                      To: My Dearest Tsi
                    </h2>
                  </div>
                </div>

                {/* 3D Animated Top Envelope Flap */}
                <motion.div
                  initial={{ rotateX: 0 }}
                  animate={
                    phase === 'opening'
                      ? { rotateX: -175 }
                      : { rotateX: 0 }
                  }
                  transition={{
                    duration: 0.55,
                    ease: [0.34, 1.25, 0.64, 1],
                  }}
                  style={{
                    transformOrigin: 'top center',
                    transformStyle: 'preserve-3d',
                    zIndex: phase === 'opening' ? 5 : 30,
                  }}
                  className="absolute top-0 left-0 right-0 h-[58%] pointer-events-none"
                >
                  {/* Outer Triangular Flap */}
                  <div
                    className="w-full h-full bg-gradient-to-b from-[#7a102a] via-[#5e0a1f] to-[#460616] drop-shadow-xl"
                    style={{ clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }}
                  />

                  {/* Crimson & Gold Wax Seal Emblem on Flap Tip */}
                  <motion.button
                    type="button"
                    onClick={handleOpenLetter}
                    animate={
                      phase === 'opening'
                        ? { scale: [1, 1.25, 0], opacity: [1, 0.8, 0] }
                        : { scale: 1, opacity: 1 }
                    }
                    transition={{ duration: 0.32 }}
                    aria-label="Wax seal — click to open letter"
                    className="pointer-events-auto absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-16 h-16 rounded-full bg-gradient-to-br from-rose-600 via-red-700 to-red-900 border-2 border-amber-300/85 flex items-center justify-center shadow-xl shadow-black/70 hover:scale-110 transition-transform cursor-pointer"
                  >
                    <span className="font-serif-cormorant text-2xl font-bold text-amber-200 select-none">
                      T
                    </span>
                  </motion.button>
                </motion.div>
              </div>

              {/* Prominent Click to Open Your Letter Button */}
              <div className="mt-8 text-center">
                <button
                  type="button"
                  onClick={handleOpenLetter}
                  disabled={phase === 'opening'}
                  className="inline-flex items-center justify-center gap-2.5 min-h-[48px] px-7 py-3.5 bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 active:scale-95 text-white rounded-2xl text-sm font-semibold shadow-xl shadow-rose-950/70 border border-rose-300/25 transition-all whitespace-nowrap cursor-pointer disabled:opacity-70"
                >
                  <MailOpen className="w-4 h-4" />
                  <span>
                    {phase === 'opening'
                      ? 'Opening Your Letter...'
                      : 'Click to Open Your Letter'}
                  </span>
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          /* Unfolded Stationery Letter Paper */
          <motion.div
            key="unfolded-letter-paper"
            initial={{ opacity: 0, y: 40, rotateX: -28, scaleY: 0.78 }}
            animate={{ opacity: 1, y: 0, rotateX: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.94, transition: { duration: 0.25 } }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: 'top center', perspective: '1200px' }}
            className="relative"
          >
            {/* Top Controls: Fold Back & Edit toggle (owner only) */}
            <div className="flex items-center justify-between mb-4 px-2">
              <button
                type="button"
                disabled={isSaving}
                onClick={handleFoldBack}
                className="text-xs text-rose-300/80 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Fold Back Into Envelope</span>
              </button>

              {isOwner && (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    setSaveError(null);
                    setPhotoSaveStatus(null);
                    setIsEditing(!isEditing);
                  }}
                  className="flex items-center gap-1.5 text-xs text-rose-300 hover:text-white bg-rose-950/60 px-3 py-1.5 rounded-lg border border-rose-500/20 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isEditing ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Edit3 className="w-3.5 h-3.5" />
                  )}
                  <span>{isEditing ? 'Done Editing' : 'Personalize Words'}</span>
                </button>
              )}
            </div>

            {/* Tactile Letter Paper Stationery Sheet */}
            <article
              onClick={handleLetterTap}
              className="parchment-paper rounded-2xl sm:rounded-3xl p-6 sm:p-12 md:p-14 relative shadow-2xl shadow-black/70 transition-all cursor-pointer select-none overflow-hidden border border-amber-900/20"
              style={{
                backgroundColor: '#fcf5ec',
                backgroundImage: `
                  radial-gradient(circle at 50% 10%, rgba(255,253,249,0.96) 0%, rgba(250,240,228,0.92) 65%, rgba(235,217,202,0.95) 100%),
                  repeating-linear-gradient(to bottom, transparent 0px, transparent 35px, rgba(159, 18, 57, 0.06) 35px, rgba(159, 18, 57, 0.06) 36px)
                `,
              }}
            >
              {/* Double Stationery Frame Border Inside Letter Paper */}
              <div
                className="absolute inset-3 sm:inset-5 rounded-xl sm:rounded-2xl border border-rose-900/15 pointer-events-none"
                aria-hidden="true"
              />
              <div
                className="absolute inset-4 sm:inset-6 rounded-lg sm:rounded-xl border border-amber-800/10 pointer-events-none"
                aria-hidden="true"
              />

              {/* Realistic Horizontal Paper Fold Crease Across Center */}
              <div
                className="absolute left-0 right-0 top-1/2 h-px bg-gradient-to-r from-transparent via-amber-950/15 to-transparent shadow-[0_1px_2px_rgba(255,255,255,0.65)] pointer-events-none"
                aria-hidden="true"
              />

              {/* Romantic Corner Flourishes */}
              <div className="absolute top-6 left-7 text-rose-900/20 text-2xl sm:text-3xl font-serif pointer-events-none select-none">
                ❧
              </div>
              <div className="absolute bottom-6 right-7 text-rose-900/20 text-2xl sm:text-3xl font-serif pointer-events-none select-none">
                ☙
              </div>

              {/* Letter Content */}
              {isEditing ? (
                <div className="relative z-10 space-y-4" onClick={(e) => e.stopPropagation()}>
                  {!isOwner && (
                    <div className="p-3.5 rounded-xl bg-rose-900/10 border border-rose-700/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs text-rose-950">
                        <Lock className="w-4 h-4 text-rose-700 shrink-0" />
                        <span>
                          Sign in with your creator Google account to save letter edits to the cloud for Tsi.
                        </span>
                      </div>
                      {onSignInOwner && (
                        <button
                          type="button"
                          onClick={() =>
                            onSignInOwner().catch((err) =>
                              setSaveError(
                                getReadableFirestoreErrorMessage(err, 'Sign-in failed.')
                              )
                            )
                          }
                          className="px-3.5 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Sign In with Google
                        </button>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-rose-900 uppercase tracking-wider mb-1">
                      Playful Opening Reminder / Notice
                    </label>
                    <input
                      type="text"
                      value={editedLetter.notice || ''}
                      onChange={(e) =>
                        setEditedLetter({ ...editedLetter, notice: e.target.value })
                      }
                      className="w-full bg-white/85 border border-rose-300 rounded-xl px-3.5 py-2 text-xs text-rose-950 font-medium focus:outline-none focus:border-rose-600"
                      placeholder="e.g. I KNOW YOU HAVE ADHD AND I KNOW YOU WOULD GET TIRED READING THIS..."
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-rose-900 uppercase tracking-wider mb-1">
                      Salutation / Headline
                    </label>
                    <input
                      type="text"
                      value={editedLetter.salutation}
                      onChange={(e) =>
                        setEditedLetter({ ...editedLetter, salutation: e.target.value })
                      }
                      className="w-full bg-white/85 border border-rose-300 rounded-xl px-3.5 py-2 text-sm text-rose-950 font-serif-cormorant focus:outline-none focus:border-rose-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-rose-900 uppercase tracking-wider mb-1">
                      Love Letter Paragraphs (separated by blank lines)
                    </label>
                    <textarea
                      rows={10}
                      value={editedLetter.paragraphs.join('\n\n')}
                      onChange={(e) =>
                        setEditedLetter({
                          ...editedLetter,
                          paragraphs: e.target.value.split('\n\n'),
                        })
                      }
                      className="w-full bg-white/85 border border-rose-300 rounded-xl p-3 text-sm text-rose-950 font-serif-cormorant focus:outline-none focus:border-rose-600 leading-relaxed"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-rose-900 uppercase tracking-wider mb-1">
                        Closing
                      </label>
                      <input
                        type="text"
                        value={editedLetter.closing}
                        onChange={(e) =>
                          setEditedLetter({ ...editedLetter, closing: e.target.value })
                        }
                        className="w-full bg-white/85 border border-rose-300 rounded-xl px-3 py-2 text-sm text-rose-950 focus:outline-none focus:border-rose-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-rose-900 uppercase tracking-wider mb-1">
                        Signature
                      </label>
                      <input
                        type="text"
                        value={editedLetter.signature}
                        onChange={(e) =>
                          setEditedLetter({ ...editedLetter, signature: e.target.value })
                        }
                        className="w-full bg-white/85 border border-rose-300 rounded-xl px-3 py-2 text-sm text-rose-950 focus:outline-none focus:border-rose-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-rose-900 uppercase tracking-wider mb-1">
                      Bottom Photo Caption
                    </label>
                    <input
                      type="text"
                      maxLength={300}
                      value={
                        editedLetter.bottomPhotoCaption ??
                        DEFAULT_LOVE_LETTER.bottomPhotoCaption ??
                        ''
                      }
                      onChange={(e) =>
                        setEditedLetter({
                          ...editedLetter,
                          bottomPhotoCaption: e.target.value,
                        })
                      }
                      className="w-full bg-white/85 border border-rose-300 rounded-xl px-3 py-2 text-sm text-rose-950 focus:outline-none focus:border-rose-600"
                    />
                  </div>

                  {saveError && (
                    <p className="text-xs text-red-700 bg-red-100 border border-red-300 rounded-lg p-2.5">
                      {saveError}
                    </p>
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => {
                        setEditedLetter(letterData);
                        setSaveError(null);
                        setIsEditing(false);
                      }}
                      className="px-4 py-2 text-rose-900 hover:bg-rose-900/10 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={handleSaveEdit}
                      className="px-5 py-2 bg-rose-700 text-white rounded-xl text-xs font-semibold hover:bg-rose-800 transition-colors shadow flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
                    >
                      {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>{isSaving ? 'Saving...' : 'Save to Cloud'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative z-10 space-y-6">
                  {/* Letter Paper Stationery Header */}
                  <div className="flex items-center justify-between border-b border-rose-900/15 pb-3 text-[11px] uppercase tracking-[0.2em] text-rose-900/60 font-semibold">
                    <span>From Abreham · To Tsi</span>
                    <span>{letterData.anniversaryDate || 'On Your Birthday'}</span>
                  </div>

                  {/* Special Playful Notice for Tsi */}
                  {letterData.notice && (
                    <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-500/15 border border-dashed border-amber-700/35 text-rose-950 flex items-start sm:items-center gap-3 shadow-inner">
                      <span className="text-xl sm:text-2xl select-none shrink-0">✨</span>
                      <p className="text-xs sm:text-sm font-bold tracking-wide uppercase text-amber-950 leading-snug">
                        {letterData.notice}
                      </p>
                    </div>
                  )}

                  {/* Salutation */}
                  <h2 className="font-serif-cormorant text-2xl sm:text-3xl lg:text-4xl font-bold text-rose-950 tracking-tight">
                    {letterData.salutation}
                  </h2>

                  {/* Paragraphs */}
                  <div className="space-y-4 font-serif-cormorant text-base sm:text-lg lg:text-xl text-rose-900/90 leading-relaxed">
                    {letterData.paragraphs.map((p, idx) => (
                      <p key={idx} className="first-letter:text-2xl first-letter:font-bold">
                        {p}
                      </p>
                    ))}
                  </div>

                  {/* Sign-off & Romantic Handwritten Signature */}
                  <div className="pt-8 border-t border-rose-900/15 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-rose-900/70 font-semibold mb-1">
                        {letterData.anniversaryDate || 'On Your Birthday'}
                      </p>
                      <p className="font-serif-cormorant italic text-base sm:text-lg text-rose-900">
                        {letterData.closing}
                      </p>
                      <p className="font-handwriting text-3xl sm:text-4xl text-rose-700 mt-1 select-none">
                        {letterData.signature}
                      </p>
                    </div>

                    {/* Wax Seal Emblem */}
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-rose-700 to-red-900 border-2 border-amber-300/80 flex items-center justify-center shadow-md select-none shrink-0">
                      <Heart className="w-6 h-6 fill-amber-200 text-amber-200" />
                    </div>
                  </div>

                  {/* Keepsake Polaroid Photo Pinned at the Bottom of the Letter Paper */}
                  {bottomPhotoUrl && !bottomPhotoFailed && (
                    <div
                      className="pt-8 mt-6 border-t border-rose-900/15 flex flex-col items-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="relative bg-white p-3 sm:p-4 pb-5 rounded-xl shadow-xl shadow-rose-950/15 border border-amber-900/15 max-w-xs sm:max-w-sm w-full rotate-[-1deg] hover:rotate-0 transition-transform duration-300">
                        {/* Decorative Tape Strip */}
                        <div
                          className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-20 h-5 bg-rose-200/75 border border-rose-300/60 rounded-sm shadow-sm"
                          aria-hidden="true"
                        />

                        <img
                          src={bottomPhotoUrl}
                          alt={bottomPhotoCaption || 'My Shayla'}
                          referrerPolicy="no-referrer"
                          onError={() => setBottomPhotoFailed(true)}
                          className="w-full max-h-[380px] object-contain rounded-lg bg-amber-50/40 block mx-auto"
                        />

                        {bottomPhotoCaption && (
                          <p className="font-serif-cormorant font-bold text-lg sm:text-xl text-rose-900 text-center mt-3 tracking-wide">
                            {bottomPhotoCaption}
                          </p>
                        )}
                      </div>

                      {isOwner && (
                        <div className="mt-4 text-center space-y-1.5">
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={async () => {
                              setPhotoSaveStatus(null);
                              setIsSaving(true);
                              try {
                                await onUpdateLetter({
                                  ...letterData,
                                  bottomPhotoUrl,
                                  bottomPhotoCaption,
                                });
                                setPhotoSaveStatus('Photo & caption saved to database ❤️');
                              } catch (err) {
                                setPhotoSaveStatus(
                                  getReadableFirestoreErrorMessage(
                                    err,
                                    'Could not save to database right now.'
                                  )
                                );
                              } finally {
                                setIsSaving(false);
                              }
                            }}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-800/10 hover:bg-rose-800/20 border border-rose-800/25 text-xs font-semibold text-rose-900 transition-colors cursor-pointer disabled:opacity-60"
                          >
                            {isSaving ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            <span>Save Photo & Caption to Database</span>
                          </button>
                          {photoSaveStatus && (
                            <p className="text-[11px] text-rose-900/80 font-medium">
                              {photoSaveStatus}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </article>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation Buttons: Previous to Photos & Next to Song */}
      <section className="mt-12 pt-8 border-t border-rose-500/20">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Back to Photos & Videos */}
          <button
            type="button"
            onClick={onNavigateToMemories}
            className="romantic-card rounded-2xl p-5 flex items-center gap-4 text-left group hover:border-rose-400/40 transition-all cursor-pointer"
          >
            <div className="w-12 h-12 rounded-xl bg-rose-950/70 border border-rose-500/30 flex items-center justify-center text-rose-300 group-hover:scale-105 transition-transform shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-rose-400 uppercase tracking-widest font-semibold block">
                Chapter 01
              </span>
              <span className="text-sm sm:text-base font-serif-cormorant font-bold text-white group-hover:text-rose-200 transition-colors">
                ← Back to Photos & Videos
              </span>
            </div>
          </button>

          {/* Continue to Austin Mahone Song */}
          <button
            type="button"
            onClick={onNavigateToSong}
            className="romantic-card rounded-2xl p-5 flex items-center justify-between gap-4 text-left group bg-gradient-to-r from-rose-950/80 to-[#3b0512]/90 hover:border-rose-400/40 transition-all border border-rose-500/30 cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-600 to-red-700 flex items-center justify-center text-white group-hover:scale-105 transition-transform shrink-0 shadow-lg shadow-rose-950/50">
                <Music className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-rose-300 uppercase tracking-widest font-semibold block">
                  Chapter 03 · Final Surprise
                </span>
                <span className="text-sm sm:text-base font-serif-cormorant font-bold text-white group-hover:text-rose-200 transition-colors">
                  Listen To Our Song →
                </span>
              </div>
            </div>
          </button>
        </div>
      </section>
    </div>
  );
};
