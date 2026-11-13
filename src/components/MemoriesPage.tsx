import React, { useState } from 'react';
import { Play, Plus, ArrowRight, Heart, Sparkles, Camera } from 'lucide-react';
import { MemoryItem } from '../types';

interface MemoriesPageProps {
  memories: MemoryItem[];
  isLoading?: boolean;
  isOwner?: boolean;
  onOpenAddModal: () => void;
  onSelectMemory: (item: MemoryItem) => void;
  onNavigateToLetter: () => void;
  onNavigateToSong: () => void;
}

export const MemoriesPage: React.FC<MemoriesPageProps> = ({
  memories,
  isLoading = false,
  isOwner = false,
  onOpenAddModal,
  onSelectMemory,
  onNavigateToLetter,
}) => {
  const [filter, setFilter] = useState<'all' | 'photo' | 'video' | 'birthday'>('all');

  const filteredMemories = memories.filter((item) => {
    if (filter === 'photo') return item.type === 'photo';
    if (filter === 'video') return item.type === 'video';
    if (filter === 'birthday') return item.tag === 'Birthday Special';
    return true;
  });

  return (
    <div className="relative min-h-[calc(100vh-4rem)] pb-28 pt-4 sm:pt-8 max-w-6xl mx-auto px-4 sm:px-6">
      {/* Hero Header Section */}
      <section className="text-center max-w-3xl mx-auto mb-8 sm:mb-12">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-950/60 border border-rose-500/25 text-rose-300 text-xs font-medium mb-3 backdrop-blur-md">
          <Sparkles className="w-3.5 h-3.5 text-rose-400" />
          <span>Chapter 01 · Tsi's Gallery</span>
          <Sparkles className="w-3.5 h-3.5 text-rose-400" />
        </div>

        <h1 className="font-serif-cormorant text-3xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-tight">
          Happy Birthday,{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-300 via-rose-100 to-amber-200">
            Tsi
          </span>{' '}
          ❤️
        </h1>

        <p className="mt-3 text-sm sm:text-base text-rose-200/80 max-w-2xl mx-auto leading-relaxed font-light">
          A collection of our sweetest moments, hand in hand under golden sunsets, celebrating the most breathtaking girl in the world.
        </p>

        {/* Clean Unboxed Metadata / Stats */}
        <div className="flex items-center justify-center gap-3 mt-4 text-xs text-rose-300/70">
          <span className="tabular-nums">
            {memories.length} {memories.length === 1 ? 'Moment' : 'Moments'} Saved
          </span>
          <span aria-hidden="true">·</span>
          <span>Every Smile Cherished</span>
          <span aria-hidden="true">·</span>
          <span className="text-rose-400 font-medium">Made for Tsi</span>
        </div>
      </section>

      {/* Filter Tabs & Add Button Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
        {/* Interactive Segmented Filter Control */}
        <div className="flex items-center p-1 bg-rose-950/60 rounded-xl border border-rose-500/20 backdrop-blur-md w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
              filter === 'all'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-rose-300/70 hover:text-white'
            }`}
          >
            All Moments ({memories.length})
          </button>
          <button
            onClick={() => setFilter('photo')}
            className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
              filter === 'photo'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-rose-300/70 hover:text-white'
            }`}
          >
            Photos
          </button>
          <button
            onClick={() => setFilter('video')}
            className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
              filter === 'video'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-rose-300/70 hover:text-white'
            }`}
          >
            Videos
          </button>
          <button
            onClick={() => setFilter('birthday')}
            className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
              filter === 'birthday'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-rose-300/70 hover:text-white'
            }`}
          >
            Birthday Special
          </button>
        </div>

        {/* Add Memory Button */}
        <button
          onClick={onOpenAddModal}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-rose-600 to-red-600 rounded-xl hover:from-rose-500 hover:to-red-500 active:scale-95 transition-all shadow-lg shadow-rose-950/40 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Photos & Videos</span>
        </button>
      </div>

      {/* Loading Skeleton State */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="romantic-card rounded-2xl overflow-hidden animate-pulse"
            >
              <div className="aspect-[4/3] bg-rose-950/60" />
              <div className="p-5 space-y-3">
                <div className="h-3 w-24 bg-rose-900/50 rounded" />
                <div className="h-5 w-3/4 bg-rose-900/60 rounded" />
                <div className="h-3 w-full bg-rose-900/40 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : memories.length === 0 ? (
        /* Empty State */
        <div className="romantic-card rounded-3xl p-8 sm:p-14 text-center border border-rose-500/25 max-w-2xl mx-auto my-8">
          <div className="w-20 h-20 mx-auto rounded-full bg-rose-900/40 border border-rose-400/30 flex items-center justify-center text-rose-300 mb-5 shadow-xl shadow-rose-950/50">
            <Camera className="w-10 h-10 text-rose-400" />
          </div>

          <h2 className="font-serif-cormorant text-2xl sm:text-3xl font-bold text-white mt-2 mb-3">
            Our Photo & Video Gallery
          </h2>

          <p className="text-xs sm:text-sm text-rose-200/80 max-w-md mx-auto leading-relaxed font-light mb-6">
            {isOwner
              ? 'Upload photos and videos of Tsi from your device. Everything saved here stays permanently in the cloud for her to see on her phone.'
              : 'Sign in with your creator Google account to upload photos and videos of Tsi so she sees them here automatically when you share the link.'}
          </p>

          <button
            onClick={onOpenAddModal}
            className="inline-flex items-center gap-2.5 px-6 py-3.5 text-sm font-semibold text-white bg-gradient-to-r from-rose-600 to-red-600 rounded-2xl hover:from-rose-500 hover:to-red-500 shadow-xl shadow-rose-950/60 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            <span>{isOwner ? 'Upload Her Photos Now' : 'Sign In & Upload Photos'}</span>
            <Heart className="w-4 h-4 fill-current ml-1" />
          </button>
        </div>
      ) : filteredMemories.length === 0 ? (
        <div className="romantic-card rounded-3xl p-8 text-center max-w-xl mx-auto my-8">
          <p className="text-sm text-rose-200/80">
            No items match this filter yet. Try switching back to All Moments.
          </p>
        </div>
      ) : (
        /* Grid of Cloud-Persisted Memories */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {filteredMemories.map((item, index) => (
            <article
              key={item.id}
              onClick={() => onSelectMemory(item)}
              className="romantic-card rounded-2xl overflow-hidden cursor-pointer group romantic-card-hover flex flex-col"
            >
              {/* Media Thumbnail Container */}
              <div className="relative aspect-[4/3] bg-black/40 overflow-hidden">
                {item.type === 'photo' ? (
                  <img
                    src={item.url}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    loading={index < 3 ? 'eager' : 'lazy'}
                    className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                ) : (
                  <div className="relative w-full h-full">
                    {item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <video
                        src={item.url}
                        preload="metadata"
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    )}
                    {/* Play video badge overlay */}
                    <div className="absolute inset-0 bg-black/35 flex items-center justify-center group-hover:bg-black/20 transition-colors">
                      <div className="w-12 h-12 rounded-full bg-rose-600/90 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Tag chip */}
                <div className="absolute top-3 left-3">
                  <span className="px-2.5 py-1 text-[11px] font-medium text-rose-100 bg-[#160206]/80 backdrop-blur-md rounded-md border border-rose-500/20">
                    {item.tag}
                  </span>
                </div>

                {/* Type indicator */}
                <div className="absolute top-3 right-3">
                  <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white bg-rose-600/90 rounded-md">
                    {item.type}
                  </span>
                </div>
              </div>

              {/* Content Details */}
              <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-[11px] text-rose-300/70 mb-1.5">
                    <span>{item.date}</span>
                  </div>
                  <h3 className="font-serif-cormorant text-lg sm:text-xl font-bold text-white group-hover:text-rose-200 transition-colors line-clamp-1">
                    {item.title}
                  </h3>
                  <p className="text-xs text-rose-200/80 mt-1.5 line-clamp-2 font-light leading-relaxed">
                    {item.caption}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-rose-500/15 flex items-center justify-between text-xs text-rose-400">
                  <span className="font-medium group-hover:translate-x-0.5 transition-transform">
                    View Full {item.type === 'video' ? 'Video' : 'Photo'}
                  </span>
                  <Heart className="w-3.5 h-3.5 fill-current text-rose-500/50 group-hover:text-rose-400 transition-colors" />
                </div>
              </div>
            </article>
          ))}

          {/* Add Another Photo Card Slot (visible to owner) */}
          {isOwner && (
            <div
              onClick={onOpenAddModal}
              className="border-2 border-dashed border-rose-500/25 hover:border-rose-400/50 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer bg-rose-950/20 hover:bg-rose-950/35 transition-all min-h-[300px] group"
            >
              <div className="w-14 h-14 rounded-full bg-rose-900/40 text-rose-300 group-hover:text-white group-hover:bg-rose-600/80 transition-all flex items-center justify-center mb-3">
                <Plus className="w-6 h-6" />
              </div>
              <h4 className="font-serif-cormorant text-xl font-bold text-white group-hover:text-rose-200 transition-colors">
                Add More Photos
              </h4>
              <p className="text-xs text-rose-300/70 mt-1 max-w-[200px]">
                Upload more pictures or videos of Tsi
              </p>
            </div>
          )}
        </div>
      )}

      {/* Romantic Page Redirection Strip to Love Letter */}
      <section className="mt-14 pt-8 border-t border-rose-500/20">
        <div className="romantic-card rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 bg-gradient-to-r from-[#2e030c]/90 via-[#3d0512]/90 to-[#2e030c]/90">
          <div className="text-center sm:text-left">
            <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-widest block mb-1">
              Next Step In The Birthday Surprise
            </span>
            <h3 className="font-serif-cormorant text-2xl sm:text-3xl font-bold text-white">
              Read The Special Love Letter For Tsi
            </h3>
            <p className="text-xs sm:text-sm text-rose-200/80 mt-1 max-w-xl font-light">
              A handwritten letter for Tsi, with a sweet hidden heart animation waiting when she taps it.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <button
              onClick={onNavigateToLetter}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold text-white bg-gradient-to-r from-rose-600 to-red-600 rounded-xl hover:from-rose-500 hover:to-red-500 shadow-xl shadow-rose-950/50 active:scale-95 transition-all whitespace-nowrap cursor-pointer"
            >
              <span>Open Love Letter</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
