import React, { useState } from 'react';
import { Heart, Sparkles, Music, Camera, Edit3, Check, RefreshCw } from 'lucide-react';
import { LoveLetterData } from '../types';

interface LoveLetterPageProps {
  letterData: LoveLetterData;
  onUpdateLetter: (updated: LoveLetterData) => void;
  onHeartTap: (x: number, y: number, customText?: string) => void;
  tapCount: number;
  onNavigateToMemories: () => void;
  onNavigateToSong: () => void;
}

export const LoveLetterPage: React.FC<LoveLetterPageProps> = ({
  letterData,
  onUpdateLetter,
  onHeartTap,
  tapCount,
  onNavigateToMemories,
  onNavigateToSong,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editedLetter, setEditedLetter] = useState<LoveLetterData>(letterData);

  const handleEnvelopeClick = (e: React.MouseEvent<HTMLDivElement>) => {
    onHeartTap(e.clientX, e.clientY, 'Opened with Love ❤️');
    setIsOpen(true);
  };

  const handleLetterTap = (e: React.MouseEvent<HTMLDivElement>) => {
    // Hidden heart animation on letter tap!
    onHeartTap(e.clientX, e.clientY);
  };

  const handleSaveEdit = () => {
    onUpdateLetter(editedLetter);
    setIsEditing(false);
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
          A Love Letter For <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-300 via-rose-100 to-amber-200">Tsi</span>
        </h1>

        <p className="mt-2 text-xs sm:text-sm text-rose-200/80 max-w-lg mx-auto font-light leading-relaxed">
          Written with every beat of my heart on your special day.
        </p>

        {/* Interactive Heart Secret Hint & Counter */}
        <div className="flex items-center justify-center gap-3 mt-3 text-xs text-rose-300/80">
          <span className="flex items-center gap-1.5 bg-rose-950/40 px-3 py-1 rounded-full border border-rose-500/20">
            <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
            <span>Tap anywhere on the letter to spark hidden hearts!</span>
          </span>
          {tapCount > 0 && (
            <span className="flex items-center gap-1 text-rose-400 font-medium">
              <Heart className="w-3.5 h-3.5 fill-current animate-bounce" />
              <span>{tapCount} {tapCount === 1 ? 'spark' : 'sparks'}</span>
            </span>
          )}
        </div>
      </section>

      {/* Sealed Envelope State */}
      {!isOpen ? (
        <div 
          onClick={handleEnvelopeClick}
          className="relative max-w-lg mx-auto cursor-pointer group"
          role="button"
          tabIndex={0}
          aria-label="Tap to break wax seal and open love letter"
        >
          <div className="romantic-card rounded-3xl p-8 sm:p-12 text-center border-2 border-rose-500/40 shadow-2xl bg-gradient-to-br from-[#3b0510] via-[#24030a] to-[#160206] transform transition-transform group-hover:scale-[1.02]">
            {/* Ribbon & Stamp */}
            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-rose-600 to-red-800 border-4 border-amber-300/80 flex items-center justify-center shadow-xl shadow-red-950/80 mb-6 group-hover:scale-110 transition-transform">
              <span className="font-serif-cormorant text-3xl font-bold text-amber-200">T</span>
            </div>

            <p className="text-xs uppercase tracking-widest text-rose-300 font-semibold mb-1">
              Strictly Confidential & Sealed
            </p>
            <h2 className="font-serif-cormorant text-2xl sm:text-3xl font-bold text-white mb-2">
              To: My Dearest Tsi
            </h2>
            <p className="text-xs text-rose-200/70 max-w-xs mx-auto">
              Tap the golden seal to open your birthday letter.
            </p>

            <div className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-rose-600/80 group-hover:bg-rose-500 text-white rounded-full text-xs font-semibold shadow-lg transition-colors">
              <Heart className="w-4 h-4 fill-current" />
              <span>Break Seal & Read Letter</span>
            </div>
          </div>
        </div>
      ) : (
        /* Unfolded Letter Parchment */
        <div className="relative">
          {/* Top Controls: Edit toggle & Re-seal button */}
          <div className="flex items-center justify-between mb-4 px-2">
            <button
              onClick={() => setIsOpen(false)}
              className="text-xs text-rose-300/80 hover:text-white flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Fold Back Into Envelope</span>
            </button>

            <button
              onClick={() => setIsEditing(!isEditing)}
              className="flex items-center gap-1.5 text-xs text-rose-300 hover:text-white bg-rose-950/60 px-3 py-1.5 rounded-lg border border-rose-500/20 transition-colors"
            >
              {isEditing ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Edit3 className="w-3.5 h-3.5" />}
              <span>{isEditing ? 'Done Editing' : 'Personalize Words'}</span>
            </button>
          </div>

          {/* Letter Surface Container with tap listener */}
          <article
            onClick={handleLetterTap}
            className="parchment-paper rounded-3xl p-6 sm:p-12 relative shadow-2xl transition-all cursor-pointer select-none overflow-hidden"
            style={{
              backgroundImage: `radial-gradient(circle at 50% 10%, #fffdfa 0%, #fbf1ea 65%, #ebd9cf 100%)`,
            }}
          >
            {/* Subtle romantic corner flourish */}
            <div className="absolute top-4 left-4 text-rose-900/20 text-3xl font-serif pointer-events-none select-none">
              ❧
            </div>
            <div className="absolute bottom-4 right-4 text-rose-900/20 text-3xl font-serif pointer-events-none select-none">
              ☙
            </div>

            {/* Letter Content */}
            {isEditing ? (
              <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
                <div>
                  <label className="block text-xs font-semibold text-rose-900 uppercase tracking-wider mb-1">
                    Playful Opening Reminder / Notice
                  </label>
                  <input
                    type="text"
                    value={editedLetter.notice || ''}
                    onChange={(e) => setEditedLetter({ ...editedLetter, notice: e.target.value })}
                    className="w-full bg-white/80 border border-rose-300 rounded-xl px-3.5 py-2 text-xs text-rose-950 font-medium focus:outline-none focus:border-rose-600"
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
                    onChange={(e) => setEditedLetter({ ...editedLetter, salutation: e.target.value })}
                    className="w-full bg-white/80 border border-rose-300 rounded-xl px-3.5 py-2 text-sm text-rose-950 font-serif-cormorant focus:outline-none focus:border-rose-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-rose-900 uppercase tracking-wider mb-1">
                    Love Letter Paragraphs (separated by newlines)
                  </label>
                  <textarea
                    rows={10}
                    value={editedLetter.paragraphs.join('\n\n')}
                    onChange={(e) => setEditedLetter({ ...editedLetter, paragraphs: e.target.value.split('\n\n') })}
                    className="w-full bg-white/80 border border-rose-300 rounded-xl p-3 text-sm text-rose-950 font-serif-cormorant focus:outline-none focus:border-rose-600 leading-relaxed"
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
                      onChange={(e) => setEditedLetter({ ...editedLetter, closing: e.target.value })}
                      className="w-full bg-white/80 border border-rose-300 rounded-xl px-3 py-2 text-sm text-rose-950 focus:outline-none focus:border-rose-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-rose-900 uppercase tracking-wider mb-1">
                      Signature
                    </label>
                    <input
                      type="text"
                      value={editedLetter.signature}
                      onChange={(e) => setEditedLetter({ ...editedLetter, signature: e.target.value })}
                      className="w-full bg-white/80 border border-rose-300 rounded-xl px-3 py-2 text-sm text-rose-950 focus:outline-none focus:border-rose-600"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    className="px-5 py-2 bg-rose-700 text-white rounded-xl text-xs font-semibold hover:bg-rose-800 transition-colors shadow"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Special Playful Notice for Tsi */}
                {letterData.notice && (
                  <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-500/15 border-2 border-dashed border-amber-600/30 text-rose-950 flex items-start sm:items-center gap-3 shadow-inner">
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
              </div>
            )}
          </article>
        </div>
      )}

      {/* Navigation Buttons: Previous to Photos & Next to Song */}
      <section className="mt-12 pt-8 border-t border-rose-500/20">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Back to Photos & Videos */}
          <button
            onClick={onNavigateToMemories}
            className="romantic-card rounded-2xl p-5 flex items-center gap-4 text-left group hover:border-rose-400/40 transition-all"
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
            onClick={onNavigateToSong}
            className="romantic-card rounded-2xl p-5 flex items-center justify-between gap-4 text-left group bg-gradient-to-r from-rose-950/80 to-[#3b0512]/90 hover:border-rose-400/40 transition-all border border-rose-500/30"
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
