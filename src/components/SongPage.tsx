import React from 'react';
import { ExternalLink, Heart, Sparkles, Youtube, Camera } from 'lucide-react';
import confetti from 'canvas-confetti';

interface SongPageProps {
  onNavigateToMemories: () => void;
  onNavigateToLetter: () => void;
}

export const SongPage: React.FC<SongPageProps> = ({
  onNavigateToMemories,
  onNavigateToLetter,
}) => {
  const YOUTUBE_URL = 'https://www.youtube.com/watch?v=ZAC_k1HUyE4';

  const triggerCelebration = () => {
    confetti({
      particleCount: 80,
      spread: 100,
      origin: { y: 0.6 },
      colors: ['#e11d48', '#fb7185', '#ffd700', '#ffffff', '#fda4af'],
    });
  };

  const songLyrics = [
    { type: 'verse', text: "Don't the water grow the trees?" },
    { type: 'verse', text: "Don't the moon pull the tide?" },
    { type: 'verse', text: "Don't the stars illuminate the night from the sky?" },
    { type: 'verse', text: "It's human nature, and when you smile at the world" },
    { type: 'verse', text: "Comes right back to you..." },
    { type: 'chorus', text: "Baby you're all I ever need" },
    { type: 'chorus', text: "Baby you're amazing, you're my angel" },
    { type: 'chorus', text: "You're the only one I see" },
    { type: 'chorus', text: "And you're all I ever need..." },
  ];

  return (
    <div className="relative min-h-[calc(100vh-4rem)] pb-28 pt-4 sm:pt-8 max-w-5xl mx-auto px-4 sm:px-6">
      {/* Chapter 03 Header */}
      <section className="text-center max-w-3xl mx-auto mb-8 sm:mb-12">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-950/60 border border-rose-500/25 text-rose-300 text-xs font-medium mb-3 backdrop-blur-md">
          <Youtube className="w-3.5 h-3.5 text-red-500" />
          <span>Chapter 03 · Dedicated Song</span>
          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
        </div>

        <h1 className="font-serif-cormorant text-3xl sm:text-5xl font-bold text-white tracking-tight leading-tight">
          All I Ever Need · <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-300 via-rose-100 to-amber-200">Austin Mahone</span>
        </h1>

        <p className="mt-3 text-sm sm:text-base text-rose-200/80 max-w-xl mx-auto font-light leading-relaxed">
          This song was chosen especially for your birthday, Tsi. Click below to open and listen to it on YouTube.
        </p>

        {/* PRIMARY DIRECT YOUTUBE REDIRECT BUTTON */}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-4">
          <a
            href={YOUTUBE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-8 py-4 text-base font-bold text-white bg-gradient-to-r from-red-600 via-rose-600 to-red-700 rounded-2xl hover:from-red-500 hover:to-rose-500 shadow-2xl shadow-red-950/70 hover:scale-105 active:scale-95 transition-all group border border-rose-400/30"
          >
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors">
              <Youtube className="w-5 h-5 fill-current text-white" />
            </div>
            <span>Open & Listen on YouTube</span>
            <ExternalLink className="w-4 h-4 ml-1 opacity-90" />
          </a>

          <button
            onClick={triggerCelebration}
            className="flex items-center gap-2 px-6 py-4 text-sm font-semibold text-rose-200 bg-rose-950/60 border border-rose-500/30 rounded-2xl hover:bg-rose-900/40 hover:text-white transition-colors"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Celebrate Tsi's Birthday 🎂</span>
          </button>
        </div>
      </section>

      {/* Visualizer Card & Lyrics Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mb-12">
        {/* Left Column: Dedicated Song Showcase Card (5 cols) */}
        <div className="lg:col-span-5 romantic-card rounded-3xl p-6 sm:p-8 text-center flex flex-col items-center">
          <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-widest mb-3">
            Austin Mahone · Official Music
          </span>

          {/* Album Cover Art / Clickable to YouTube */}
          <a
            href={YOUTUBE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="relative my-4 block group cursor-pointer"
            title="Click to redirect to YouTube"
          >
            <div className="relative w-48 h-48 sm:w-56 sm:h-56 rounded-3xl shadow-2xl border-2 border-rose-500/30 overflow-hidden group-hover:border-rose-400/60 transition-all">
              <img
                src="/src/assets/images/austin_mahone_cover_1794420838531.jpg"
                alt="Austin Mahone - All I Ever Need cover art"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              {/* Play overlay on hover */}
              <div className="absolute inset-0 bg-red-950/50 flex flex-col items-center justify-center gap-2 opacity-90 group-hover:opacity-100 group-hover:bg-red-950/40 transition-all">
                <div className="w-14 h-14 rounded-full bg-red-600 text-white flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                  <Youtube className="w-8 h-8 fill-current ml-0.5" />
                </div>
                <span className="text-xs font-semibold text-white px-3 py-1 rounded-full bg-black/60 backdrop-blur-sm flex items-center gap-1">
                  <span>Redirect to YouTube</span>
                  <ExternalLink className="w-3 h-3" />
                </span>
              </div>
            </div>
          </a>

          <div className="mt-3">
            <h3 className="font-serif-cormorant text-2xl font-bold text-white">
              All I Ever Need
            </h3>
            <p className="text-sm text-rose-300 font-medium mt-0.5">
              Austin Mahone
            </p>
            <p className="text-xs text-rose-400/70 mt-1">
              "Baby you're all I ever need..."
            </p>
          </div>

          {/* Direct External Link */}
          <div className="mt-6 w-full">
            <a
              href={YOUTUBE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-rose-200 hover:text-white border border-red-500/30 text-xs font-semibold transition-all group"
            >
              <Youtube className="w-4 h-4 text-red-400 group-hover:text-red-300" />
              <span>Watch Video on YouTube</span>
              <ExternalLink className="w-3.5 h-3.5 ml-1" />
            </a>
          </div>
        </div>

        {/* Right Column: Love Dedication Note & Lyrics (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Dedication Note Card */}
          <div className="romantic-card rounded-3xl p-6 sm:p-7">
            <div className="flex items-center gap-2 mb-2 text-rose-400">
              <Heart className="w-4 h-4 fill-current" />
              <span className="text-xs font-semibold uppercase tracking-wider">Why This Song Is Dedicated To You</span>
            </div>
            <h3 className="font-serif-cormorant text-xl sm:text-2xl font-bold text-white">
              A Song That Speaks What Words Cannot
            </h3>
            <p className="text-xs sm:text-sm text-rose-200/90 mt-2 leading-relaxed font-light">
              Tsi, whenever Austin Mahone sings <span className="italic text-rose-200">"Baby you're all I ever need, you're amazing, you're my angel..."</span>, every line feels like it was written directly about you. On your birthday, I want you to remember that having you by my side is the greatest blessing I could ever ask for.
            </p>
          </div>

          {/* Romantic Lyrics Card */}
          <div className="romantic-card rounded-3xl p-6 sm:p-7">
            <div className="flex items-center justify-between mb-4 border-b border-rose-500/15 pb-3">
              <span className="text-xs font-semibold text-rose-300 uppercase tracking-wider">
                Lyrics & Meaning
              </span>
              <a
                href={YOUTUBE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-rose-400 hover:text-rose-200 flex items-center gap-1 transition-colors"
              >
                <span>Listen with lyrics on YouTube</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="space-y-3 font-serif-cormorant text-base sm:text-lg">
              {songLyrics.map((line, index) => (
                <p
                  key={index}
                  className={`transition-all duration-300 ${
                    line.type === 'chorus'
                      ? 'text-rose-200 font-bold italic text-lg sm:text-xl pl-3 border-l-2 border-rose-500'
                      : 'text-rose-300/80 font-normal'
                  }`}
                >
                  "{line.text}"
                </p>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-rose-500/15 flex items-center justify-between text-xs text-rose-400">
              <span>Austin Mahone · All I Ever Need</span>
              <a
                href={YOUTUBE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline flex items-center gap-1 text-amber-300"
              >
                <span>Play Song ↗</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Buttons: Jump back to Chapter 01 or 02 */}
      <section className="pt-8 border-t border-rose-500/20">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                ← View Photos & Videos
              </span>
            </div>
          </button>

          <button
            onClick={onNavigateToLetter}
            className="romantic-card rounded-2xl p-5 flex items-center gap-4 text-left group hover:border-rose-400/40 transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-rose-950/70 border border-rose-500/30 flex items-center justify-center text-rose-300 group-hover:scale-105 transition-transform shrink-0">
              <Heart className="w-5 h-5 fill-current text-rose-400" />
            </div>
            <div>
              <span className="text-[10px] text-rose-400 uppercase tracking-widest font-semibold block">
                Chapter 02
              </span>
              <span className="text-sm sm:text-base font-serif-cormorant font-bold text-white group-hover:text-rose-200 transition-colors">
                ← Re-read The Love Letter
              </span>
            </div>
          </button>
        </div>
      </section>
    </div>
  );
};
