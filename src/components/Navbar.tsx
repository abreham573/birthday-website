import React from 'react';
import { Camera, Heart, Music, Plus } from 'lucide-react';
import { TabType } from '../types';

interface NavbarProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  onOpenAddModal: () => void;
  heartCount: number;
  showAddButton?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  onOpenAddModal,
  heartCount,
  showAddButton = true,
}) => {
  return (
    <>
      {/* Desktop & Tablet Top Navigation Bar */}
      <header className="sticky top-0 z-40 w-full bg-[#160206]/85 backdrop-blur-md border-b border-rose-500/15">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Brand Wordmark (Zone 1) */}
          <button
            onClick={() => onSelectTab('memories')}
            className="flex items-center gap-2 text-left group cursor-pointer"
          >
            <span className="font-serif-cormorant text-2xl font-bold tracking-tight text-white group-hover:text-rose-300 transition-colors whitespace-nowrap">
              For Tsi <span className="text-rose-500 font-sans text-base">❤️</span>
            </span>
            <span className="hidden sm:inline-block text-[11px] text-rose-300/60 uppercase tracking-widest pl-1 font-sans">
              Happy Birthday
            </span>
          </button>

          {/* Navigation Buttons (Zone 2) */}
          <nav 
            aria-label="Main Navigation"
            className="hidden md:flex items-center gap-1.5 p-1 bg-rose-950/40 rounded-xl border border-rose-500/20 shadow-inner"
          >
            <button
              onClick={() => onSelectTab('memories')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
                activeTab === 'memories'
                  ? 'bg-gradient-to-r from-rose-700 to-red-700 text-white shadow-md'
                  : 'text-rose-200/80 hover:text-white hover:bg-rose-900/40'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>01. Photos & Videos</span>
            </button>

            <button
              onClick={() => onSelectTab('letter')}
              className={`relative flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
                activeTab === 'letter'
                  ? 'bg-gradient-to-r from-rose-700 to-red-700 text-white shadow-md'
                  : 'text-rose-200/80 hover:text-white hover:bg-rose-900/40'
              }`}
            >
              <Heart className="w-3.5 h-3.5 fill-current text-rose-400" />
              <span>02. Love Letter</span>
              {heartCount > 0 && (
                <span className="ml-0.5 text-[10px] bg-rose-950 text-rose-300 px-1.5 py-0.2 rounded-full border border-rose-500/30">
                  {heartCount}
                </span>
              )}
            </button>

            <button
              onClick={() => onSelectTab('song')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
                activeTab === 'song'
                  ? 'bg-gradient-to-r from-rose-700 to-red-700 text-white shadow-md'
                  : 'text-rose-200/80 hover:text-white hover:bg-rose-900/40'
              }`}
            >
              <Music className="w-3.5 h-3.5" />
              <span>03. Our Song</span>
            </button>
          </nav>

          {/* Primary Action Button (Zone 3) */}
          <div className="flex items-center gap-2">
            {showAddButton ? (
              <button
                onClick={onOpenAddModal}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-gradient-to-r from-rose-600 to-red-600 rounded-lg hover:from-rose-500 hover:to-red-500 active:scale-95 transition-all shadow-md shadow-rose-950/40 whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Memory</span>
              </button>
            ) : (
              <span className="hidden md:inline-block text-xs text-rose-300/60 font-serif-cormorant italic whitespace-nowrap">
                Made with Love
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Fixed Bottom Navigation Bar (Pattern 1) */}
      <nav 
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#160206]/95 backdrop-blur-md border-t border-rose-500/20 pb-safe"
      >
        <div className="grid grid-cols-3 items-center h-16 px-2">
          {/* Photos & Videos Tab */}
          <button
            onClick={() => onSelectTab('memories')}
            className={`flex flex-col items-center justify-center min-h-[48px] py-1 transition-colors ${
              activeTab === 'memories' ? 'text-rose-300' : 'text-rose-300/60 hover:text-rose-200'
            }`}
          >
            <div className={`p-1 rounded-full ${activeTab === 'memories' ? 'bg-rose-900/50' : ''}`}>
              <Camera className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-medium tracking-tight mt-0.5">Memories</span>
          </button>

          {/* Love Letter Tab */}
          <button
            onClick={() => onSelectTab('letter')}
            className={`relative flex flex-col items-center justify-center min-h-[48px] py-1 transition-colors ${
              activeTab === 'letter' ? 'text-rose-300' : 'text-rose-300/60 hover:text-rose-200'
            }`}
          >
            <div className={`p-1 rounded-full ${activeTab === 'letter' ? 'bg-rose-900/50' : ''}`}>
              <Heart className={`w-5 h-5 ${activeTab === 'letter' ? 'fill-current text-rose-400' : ''}`} />
            </div>
            <span className="text-[10px] font-medium tracking-tight mt-0.5">Love Letter</span>
            {heartCount > 0 && (
              <span className="absolute top-1 right-1/4 w-2 h-2 rounded-full bg-rose-500" />
            )}
          </button>

          {/* Our Song Tab */}
          <button
            onClick={() => onSelectTab('song')}
            className={`flex flex-col items-center justify-center min-h-[48px] py-1 transition-colors ${
              activeTab === 'song' ? 'text-rose-300' : 'text-rose-300/60 hover:text-rose-200'
            }`}
          >
            <div className={`p-1 rounded-full ${activeTab === 'song' ? 'bg-rose-900/50' : ''}`}>
              <Music className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-medium tracking-tight mt-0.5">Our Song</span>
          </button>
        </div>
      </nav>
    </>
  );
};
