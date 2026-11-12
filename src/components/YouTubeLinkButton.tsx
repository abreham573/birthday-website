import React from 'react';
import { Youtube, ExternalLink, Music2 } from 'lucide-react';

export const YouTubeLinkButton: React.FC = () => {
  const YOUTUBE_URL = 'https://www.youtube.com/watch?v=ZAC_k1HUyE4';

  return (
    <aside
      aria-label="Direct Link to Austin Mahone on YouTube"
      className="fixed bottom-20 md:bottom-6 right-4 z-40 max-w-[calc(100vw-2rem)]"
    >
      <a
        href={YOUTUBE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="romantic-card rounded-2xl p-2.5 sm:px-4 sm:py-3 flex items-center gap-3 shadow-2xl border border-rose-500/30 bg-[#1f0309]/95 backdrop-blur-lg hover:border-rose-400/60 hover:bg-[#28040d] transition-all group active:scale-95 text-white"
        title="Open Austin Mahone - All I Ever Need on YouTube"
      >
        {/* Album Artwork Thumbnail */}
        <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-full overflow-hidden shrink-0 border border-rose-400/30 group-hover:scale-105 transition-transform">
          <img
            src="/src/assets/images/austin_mahone_cover_1794420838531.jpg"
            alt="Austin Mahone - All I Ever Need Cover"
            className="w-full h-full object-cover"
          />
          {/* Subtle YouTube badge overlay */}
          <div className="absolute inset-0 bg-red-950/40 flex items-center justify-center">
            <Youtube className="w-4 h-4 fill-current text-white drop-shadow" />
          </div>
        </div>

        {/* Text Info */}
        <div className="text-left min-w-0 pr-1">
          <div className="flex items-center gap-1.5 text-[10px] text-rose-300 font-semibold uppercase tracking-wider">
            <Music2 className="w-3 h-3 text-red-400" />
            <span>Her Birthday Song</span>
          </div>
          <p className="text-xs sm:text-sm font-bold text-white group-hover:text-rose-200 transition-colors truncate">
            All I Ever Need
          </p>
          <p className="text-[11px] text-rose-300/70 truncate flex items-center gap-1">
            <span>Austin Mahone · Play on YouTube</span>
            <ExternalLink className="w-3 h-3 text-rose-400 inline" />
          </p>
        </div>

        {/* Red YouTube Button Icon */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-red-600 to-rose-600 text-white flex items-center justify-center shrink-0 shadow-md group-hover:scale-110 transition-transform">
          <ExternalLink className="w-3.5 h-3.5" />
        </div>
      </a>
    </aside>
  );
};
