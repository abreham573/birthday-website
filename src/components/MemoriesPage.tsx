import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Play,
  Pause,
  Plus,
  ArrowRight,
  Heart,
  Sparkles,
  Camera,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Loader2,
  Film,
  Edit3,
  Check,
} from 'lucide-react';
import { MemoryItem } from '../types';

interface MemoriesPageProps {
  memories: MemoryItem[];
  isLoading?: boolean;
  isOwner?: boolean;
  onOpenAddModal: () => void;
  onSelectMemory: (item: MemoryItem) => void;
  onResolveMedia?: (id: string) => Promise<string>;
  onUpdateMemory?: (params: {
    id: string;
    title: string;
    caption: string;
    date: string;
    tag: string;
  }) => Promise<void>;
  onNavigateToLetter: () => void;
  onNavigateToSong: () => void;
}

const SLIDE_DURATION_MS = 4800;

function getCircularOffset(index: number, currentIndex: number, total: number): number {
  if (total <= 1) return 0;
  if (total === 2) {
    return index === currentIndex ? 0 : 1;
  }
  let offset = index - currentIndex;
  if (offset > total / 2) offset -= total;
  if (offset < -total / 2) offset += total;
  return offset;
}

export const MemoriesPage: React.FC<MemoriesPageProps> = ({
  memories,
  isLoading = false,
  isOwner = false,
  onOpenAddModal,
  onSelectMemory,
  onResolveMedia,
  onUpdateMemory,
  onNavigateToLetter,
}) => {
  const [filter, setFilter] = useState<'all' | 'photo' | 'video' | 'birthday'>('all');
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(true);
  const [loadingVideoId, setLoadingVideoId] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Inline caption editor state (owner only)
  const [isEditingCaption, setIsEditingCaption] = useState<boolean>(false);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editDate, setEditDate] = useState<string>('');
  const [editTag, setEditTag] = useState<string>('Birthday Special');
  const [editCaption, setEditCaption] = useState<string>('');
  const [isSavingCaption, setIsSavingCaption] = useState<boolean>(false);
  const [captionSaveError, setCaptionSaveError] = useState<string | null>(null);

  const filmstripRef = useRef<HTMLDivElement | null>(null);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const isDraggingRef = useRef<boolean>(false);
  const showAddButton = isOwner || (!isLoading && memories.length === 0);

  const filteredMemories = memories.filter((item) => {
    if (filter === 'photo') return item.type === 'photo';
    if (filter === 'video') return item.type === 'video';
    if (filter === 'birthday') return item.tag === 'Birthday Special';
    return true;
  });

  // Reset or clamp slide index when filter or list changes
  useEffect(() => {
    setCurrentIndex((prev) => {
      if (filteredMemories.length === 0) return 0;
      return prev >= filteredMemories.length ? 0 : prev;
    });
    setVideoError(null);
  }, [filter, filteredMemories.length]);

  const activeItem = filteredMemories[currentIndex] ?? null;

  // Close inline caption editor whenever switching slides
  useEffect(() => {
    setIsEditingCaption(false);
    setCaptionSaveError(null);
  }, [activeItem?.id]);

  const handleStartEditCaption = () => {
    if (!activeItem) return;
    setIsAutoPlaying(false);
    setEditTitle(activeItem.title);
    setEditDate(activeItem.date);
    setEditTag(activeItem.tag || 'Birthday Special');
    setEditCaption(activeItem.caption || '');
    setCaptionSaveError(null);
    setIsEditingCaption(true);
  };

  const handleSaveCaption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem || !onUpdateMemory) return;
    setCaptionSaveError(null);
    setIsSavingCaption(true);
    try {
      await onUpdateMemory({
        id: activeItem.id,
        title: editTitle,
        caption: editCaption,
        date: editDate,
        tag: editTag,
      });
      setIsEditingCaption(false);
    } catch (err) {
      setCaptionSaveError(
        err instanceof Error ? err.message : 'Could not save caption right now.'
      );
    } finally {
      setIsSavingCaption(false);
    }
  };

  const paginate = useCallback(
    (delta: number) => {
      if (filteredMemories.length <= 1) return;
      setVideoError(null);
      setCurrentIndex(
        (prev) => (prev + delta + filteredMemories.length) % filteredMemories.length
      );
    },
    [filteredMemories.length]
  );

  const goToSlide = useCallback(
    (targetIdx: number) => {
      if (filteredMemories.length === 0) return;
      setVideoError(null);
      setCurrentIndex(targetIdx);
    },
    [filteredMemories.length]
  );

  // Auto-advance swiper for photos when Auto-Play is active
  useEffect(() => {
    if (!isAutoPlaying || filteredMemories.length <= 1 || !activeItem) return;
    if (activeItem.type === 'video') return;

    const timer = window.setInterval(() => {
      setVideoError(null);
      setCurrentIndex((prev) => (prev + 1) % filteredMemories.length);
    }, SLIDE_DURATION_MS);

    return () => window.clearInterval(timer);
  }, [isAutoPlaying, filteredMemories.length, activeItem]);

  // Keyboard arrow navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowLeft') {
        setIsAutoPlaying(false);
        paginate(-1);
      }
      if (e.key === 'ArrowRight') {
        setIsAutoPlaying(false);
        paginate(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [paginate]);

  // Keep active filmstrip thumbnail centered horizontally without scrolling the page vertically
  useEffect(() => {
    const container = filmstripRef.current;
    const el = thumbRefs.current[currentIndex];
    if (container && el) {
      const targetLeft =
        el.offsetLeft - container.clientWidth / 2 + el.clientWidth / 2;
      container.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
    }
  }, [currentIndex]);

  const handleLoadInlineVideo = async (item: MemoryItem) => {
    if (!onResolveMedia || item.url) return;
    setIsAutoPlaying(false);
    setLoadingVideoId(item.id);
    setVideoError(null);
    try {
      const url = await onResolveMedia(item.id);
      if (!url) {
        setVideoError('Video could not be loaded right now.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('quota')) {
        setVideoError('Daily free database read limit reached. Please try again tomorrow.');
      } else {
        setVideoError('Could not load video right now.');
      }
    } finally {
      setLoadingVideoId(null);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] pb-28 pt-4 sm:pt-8 max-w-6xl mx-auto px-4 sm:px-6 overflow-x-hidden">
      {/* Hero Header Section */}
      <section className="text-center max-w-3xl mx-auto mb-6 sm:mb-8">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-950/60 border border-rose-500/25 text-rose-300 text-xs font-medium mb-3 backdrop-blur-md">
          <Sparkles className="w-3.5 h-3.5 text-rose-400" />
          <span>Chapter 01 · Tsi's Swiper Gallery</span>
          <Sparkles className="w-3.5 h-3.5 text-rose-400" />
        </div>

        <h1 className="font-serif-cormorant text-3xl sm:text-5xl font-bold text-white tracking-tight leading-tight">
          Happy Birthday,{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-300 via-rose-100 to-amber-200">
            Tsi
          </span>{' '}
          ❤️
        </h1>

        <p className="mt-2.5 text-xs sm:text-sm text-rose-200/80 max-w-2xl mx-auto leading-relaxed font-light">
          A collection of our sweetest moments, hand in hand under golden sunsets, celebrating the most breathtaking girl in the world.
        </p>

        <div className="flex items-center justify-center gap-3 mt-3 text-xs text-rose-300/70">
          <span className="tabular-nums">
            {memories.length} {memories.length === 1 ? 'Moment' : 'Moments'} Saved
          </span>
          <span aria-hidden="true">·</span>
          <span>Swipe Left or Right</span>
          <span aria-hidden="true">·</span>
          <span className="text-rose-400 font-medium">Made for Tsi</span>
        </div>
      </section>

      {/* Filter Tabs & Add Button Bar */}
      <div
        className={`flex flex-col sm:flex-row items-center gap-4 mb-6 ${
          showAddButton ? 'justify-between' : 'justify-center'
        }`}
      >
        <div className="flex items-center p-1 bg-rose-950/60 rounded-xl border border-rose-500/20 backdrop-blur-md w-full sm:w-auto overflow-x-auto">
          <button
            type="button"
            onClick={() => {
              setFilter('all');
              setCurrentIndex(0);
            }}
            className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap cursor-pointer ${
              filter === 'all'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-rose-300/70 hover:text-white'
            }`}
          >
            All Moments ({memories.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setFilter('photo');
              setCurrentIndex(0);
            }}
            className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap cursor-pointer ${
              filter === 'photo'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-rose-300/70 hover:text-white'
            }`}
          >
            Photos
          </button>
          <button
            type="button"
            onClick={() => {
              setFilter('video');
              setCurrentIndex(0);
            }}
            className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap cursor-pointer ${
              filter === 'video'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-rose-300/70 hover:text-white'
            }`}
          >
            Videos
          </button>
          <button
            type="button"
            onClick={() => {
              setFilter('birthday');
              setCurrentIndex(0);
            }}
            className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap cursor-pointer ${
              filter === 'birthday'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-rose-300/70 hover:text-white'
            }`}
          >
            Birthday Special
          </button>
        </div>

        {showAddButton && (
          <button
            type="button"
            onClick={onOpenAddModal}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-rose-600 to-red-600 rounded-xl hover:from-rose-500 hover:to-red-500 active:scale-95 transition-all shadow-lg shadow-rose-950/40 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Photos & Videos</span>
          </button>
        )}
      </div>

      {/* Loading Skeleton State */}
      {isLoading ? (
        <div className="max-w-4xl mx-auto romantic-card rounded-3xl overflow-hidden animate-pulse">
          <div className="h-[360px] sm:h-[460px] bg-rose-950/60" />
          <div className="p-6 space-y-3">
            <div className="h-3 w-28 bg-rose-900/50 rounded" />
            <div className="h-6 w-2/3 bg-rose-900/60 rounded" />
            <div className="h-3 w-full bg-rose-900/40 rounded" />
          </div>
        </div>
      ) : memories.length === 0 ? (
        /* Empty State */
        <div className="romantic-card rounded-3xl p-8 sm:p-14 text-center border border-rose-500/25 max-w-2xl mx-auto my-8">
          <div className="w-20 h-20 mx-auto rounded-full bg-rose-900/40 border border-rose-400/30 flex items-center justify-center text-rose-300 mb-5 shadow-xl shadow-rose-950/50">
            <Camera className="w-10 h-10 text-rose-400" />
          </div>

          <h2 className="font-serif-cormorant text-2xl sm:text-3xl font-bold text-white mt-2 mb-3">
            Our Photo & Video Swiper
          </h2>

          <p className="text-xs sm:text-sm text-rose-200/80 max-w-md mx-auto leading-relaxed font-light mb-6">
            {isOwner
              ? 'Upload photos and videos of Tsi from your device. Everything saved here glides in this 3D coverflow swiper on her phone.'
              : 'Sign in with your creator Google account to upload photos and videos of Tsi so she sees them here automatically when you share the link.'}
          </p>

          <button
            type="button"
            onClick={onOpenAddModal}
            className="inline-flex items-center gap-2.5 px-6 py-3.5 text-sm font-semibold text-white bg-gradient-to-r from-rose-600 to-red-600 rounded-2xl hover:from-rose-500 hover:to-red-500 shadow-xl shadow-rose-950/60 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            <span>{isOwner ? 'Upload Her Photos Now' : 'Sign In & Upload Photos'}</span>
            <Heart className="w-4 h-4 fill-current ml-1" />
          </button>
        </div>
      ) : filteredMemories.length === 0 || !activeItem ? (
        <div className="romantic-card rounded-3xl p-8 text-center max-w-xl mx-auto my-8">
          <p className="text-sm text-rose-200/80">
            No items match this filter yet. Try switching back to All Moments.
          </p>
        </div>
      ) : (
        /* 3D Coverflow Swiper Carousel */
        <section aria-label="Birthday Memories Swiper" className="max-w-5xl mx-auto space-y-5">
          {/* Top Swiper Controls */}
          <div className="flex items-center justify-between gap-3 px-2 text-xs">
            <div className="flex items-center gap-2 text-rose-200/90 min-w-0">
              <span className="font-semibold tabular-nums whitespace-nowrap text-white">
                {currentIndex + 1} / {filteredMemories.length}
              </span>
              <span aria-hidden="true" className="text-rose-500/50">·</span>
              <span className="truncate text-rose-300/80">{activeItem.tag}</span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {filteredMemories.length > 1 && activeItem.type === 'photo' && (
                <button
                  type="button"
                  onClick={() => setIsAutoPlaying((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900/70 border border-rose-500/25 text-rose-100 transition-colors whitespace-nowrap cursor-pointer"
                  aria-label={isAutoPlaying ? 'Pause swiper' : 'Auto-play swiper'}
                >
                  {isAutoPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Auto-Play</span>
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setIsAutoPlaying(false);
                  onSelectMemory(activeItem);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900/70 border border-rose-500/25 text-rose-100 transition-colors whitespace-nowrap cursor-pointer"
                title="Expand & Resize Photo"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Expand / Zoom</span>
              </button>
            </div>
          </div>

          {/* 3D Perspective Coverflow Stage */}
          <div
            className="relative h-[385px] sm:h-[490px] md:h-[550px] flex items-center justify-center overflow-visible select-none"
            style={{ perspective: '1200px' }}
          >
            {filteredMemories.map((item, idx) => {
              const offset = getCircularOffset(idx, currentIndex, filteredMemories.length);
              const absOffset = Math.abs(offset);

              // Only mount up to 2 cards on each side of the active slide
              if (absOffset > 2) return null;

              const isActive = offset === 0;
              const translateX =
                offset === 0
                  ? '0%'
                  : offset === 1
                  ? '54%'
                  : offset === -1
                  ? '-54%'
                  : offset === 2
                  ? '90%'
                  : '-90%';
              const scale = isActive ? 1 : absOffset === 1 ? 0.8 : 0.64;
              const rotateY = offset === 0 ? 0 : offset > 0 ? -22 : 22;
              const opacity = isActive ? 1 : absOffset === 1 ? 0.58 : 0.2;
              const zIndex = isActive ? 30 : absOffset === 1 ? 20 : 10;

              return (
                <motion.div
                  key={item.id}
                  initial={false}
                  animate={{
                    x: translateX,
                    scale,
                    rotateY,
                    opacity,
                    zIndex,
                  }}
                  transition={{
                    type: 'spring',
                    stiffness: 260,
                    damping: 26,
                  }}
                  drag={isActive && filteredMemories.length > 1 ? 'x' : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.35}
                  onDragStart={() => {
                    isDraggingRef.current = true;
                  }}
                  onDragEnd={(_, info) => {
                    setTimeout(() => {
                      isDraggingRef.current = false;
                    }, 80);

                    if (info.offset.x < -45 || info.velocity.x < -250) {
                      setIsAutoPlaying(false);
                      paginate(1);
                    } else if (info.offset.x > 45 || info.velocity.x > 250) {
                      setIsAutoPlaying(false);
                      paginate(-1);
                    }
                  }}
                  onClick={() => {
                    if (isDraggingRef.current) return;
                    if (!isActive) {
                      setIsAutoPlaying(false);
                      goToSlide(idx);
                    } else if (item.type === 'photo') {
                      setIsAutoPlaying(false);
                      onSelectMemory(item);
                    }
                  }}
                  style={{
                    transformStyle: 'preserve-3d',
                    zIndex,
                  }}
                  className={`absolute w-[88%] sm:w-[74%] md:w-[66%] max-w-3xl h-[370px] sm:h-[470px] md:h-[530px] rounded-3xl overflow-hidden border shadow-2xl touch-pan-y ${
                    isActive
                      ? 'border-rose-400/45 bg-[#160206] shadow-black/80 cursor-grab active:cursor-grabbing'
                      : 'border-rose-500/20 bg-[#120104]/90 shadow-black/60 cursor-pointer'
                  }`}
                >
                  {/* Active Auto-Play Progress Bar on top of center card */}
                  {isActive &&
                    isAutoPlaying &&
                    filteredMemories.length > 1 &&
                    item.type === 'photo' && (
                      <div className="absolute top-0 left-0 right-0 h-1 bg-rose-950/80 z-30">
                        <motion.div
                          key={`swiper-progress-${item.id}-${currentIndex}`}
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          transition={{ duration: SLIDE_DURATION_MS / 1000, ease: 'linear' }}
                          style={{ originX: 0 }}
                          className="h-full w-full bg-gradient-to-r from-rose-500 via-pink-400 to-amber-300"
                        />
                      </div>
                    )}

                  {/* Card Media Content */}
                  <div className="w-full h-full flex items-center justify-center bg-black/75 p-1 sm:p-2">
                    {item.type === 'photo' ? (
                      item.url ? (
                        <img
                          src={item.url}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          draggable={false}
                          className="max-h-full max-w-full w-auto h-auto object-contain rounded-xl select-none"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-rose-300/70">
                          <Camera className="w-10 h-10 mb-2" />
                          <span className="text-xs">Photo preview unavailable</span>
                        </div>
                      )
                    ) : item.url ? (
                      isActive ? (
                        <video
                          src={item.url}
                          controls
                          playsInline
                          onPlay={() => setIsAutoPlaying(false)}
                          className="max-h-full max-w-full w-full h-full object-contain rounded-xl bg-black"
                        />
                      ) : (
                        <div className="relative w-full h-full flex items-center justify-center">
                          <video
                            src={item.url}
                            muted
                            playsInline
                            preload="metadata"
                            className="max-h-full max-w-full w-full h-full object-contain rounded-xl bg-black"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <div className="w-12 h-12 rounded-full bg-rose-600/90 text-white flex items-center justify-center">
                              <Play className="w-5 h-5 fill-current ml-0.5" />
                            </div>
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
                        {isActive && loadingVideoId === item.id ? (
                          <>
                            <Loader2 className="w-9 h-9 animate-spin text-rose-400" />
                            <p className="text-xs text-rose-200/80">Loading video memory...</p>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isActive) {
                                  goToSlide(idx);
                                } else {
                                  handleLoadInlineVideo(item);
                                }
                              }}
                              className="w-16 h-16 rounded-full bg-rose-600/90 hover:bg-rose-500 text-white flex items-center justify-center shadow-xl transition-transform hover:scale-105 cursor-pointer"
                              aria-label="Play Video"
                            >
                              <Play className="w-7 h-7 fill-current ml-0.5" />
                            </button>
                            <p className="text-xs text-rose-200/85 font-medium">
                              {isActive && videoError ? videoError : 'Tap to Play Video'}
                            </p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}

            {/* Left / Right Swiper Arrows */}
            {filteredMemories.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setIsAutoPlaying(false);
                    paginate(-1);
                  }}
                  aria-label="Previous slide"
                  className="absolute left-0 sm:left-2 top-1/2 -translate-y-1/2 z-40 min-w-[44px] min-h-[44px] rounded-full bg-black/75 hover:bg-rose-700/90 text-white border border-rose-400/30 flex items-center justify-center transition-colors shadow-xl cursor-pointer"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsAutoPlaying(false);
                    paginate(1);
                  }}
                  aria-label="Next slide"
                  className="absolute right-0 sm:right-2 top-1/2 -translate-y-1/2 z-40 min-w-[44px] min-h-[44px] rounded-full bg-black/75 hover:bg-rose-700/90 text-white border border-rose-400/30 flex items-center justify-center transition-colors shadow-xl cursor-pointer"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
          </div>

          {/* Swiper Pagination Dots */}
          {filteredMemories.length > 1 && (
            <div className="flex items-center justify-center gap-1.5 pt-1" role="tablist" aria-label="Slide pagination">
              {filteredMemories.map((item, idx) => {
                const isActive = idx === currentIndex;
                return (
                  <button
                    key={`dot-${item.id}`}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-label={`Slide ${idx + 1}`}
                    onClick={() => {
                      setIsAutoPlaying(false);
                      goToSlide(idx);
                    }}
                    className={`h-2 rounded-full transition-all cursor-pointer ${
                      isActive
                        ? 'w-7 bg-gradient-to-r from-rose-500 to-amber-300'
                        : 'w-2 bg-rose-400/35 hover:bg-rose-400/70'
                    }`}
                  />
                );
              })}
            </div>
          )}

          {/* Compact Filmstrip Thumbnail Bar */}
          <div
            ref={filmstripRef}
            className="relative flex items-center justify-start sm:justify-center gap-2.5 overflow-x-auto py-2 px-1"
          >
            {filteredMemories.map((item, idx) => {
              const isActive = idx === currentIndex;
              return (
                <button
                  key={item.id}
                  ref={(el) => {
                    thumbRefs.current[idx] = el;
                  }}
                  type="button"
                  onClick={() => {
                    setIsAutoPlaying(false);
                    goToSlide(idx);
                  }}
                  aria-label={`Go to slide ${idx + 1}: ${item.title}`}
                  className={`relative shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border transition-all cursor-pointer ${
                    isActive
                      ? 'border-rose-300 ring-2 ring-rose-500/80 scale-105 shadow-lg'
                      : 'border-rose-500/20 opacity-60 hover:opacity-100'
                  }`}
                >
                  {item.type === 'photo' && item.url ? (
                    <img
                      src={item.url}
                      alt={item.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : item.thumbnailUrl ? (
                    <img
                      src={item.thumbnailUrl}
                      alt={item.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-rose-900/80 to-[#190207] flex items-center justify-center text-rose-200">
                      <Film className="w-4 h-4" />
                    </div>
                  )}

                  {item.type === 'video' && (
                    <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-black/75 text-white flex items-center justify-center">
                      <Play className="w-2 h-2 fill-current ml-0.5" />
                    </span>
                  )}
                </button>
              );
            })}

            {isOwner && (
              <button
                type="button"
                onClick={onOpenAddModal}
                aria-label="Add more photos or videos"
                title="Add more photos or videos"
                className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-xl border-2 border-dashed border-rose-500/35 hover:border-rose-400 bg-rose-950/30 hover:bg-rose-950/60 text-rose-300 hover:text-white flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span className="text-[9px] font-medium">Add</span>
              </button>
            )}
          </div>

          {/* Full Active Slide Caption Card at the Bottom */}
          <div className="max-w-2xl mx-auto romantic-card rounded-2xl p-4 sm:p-5 border border-rose-500/20 text-center">
            {isEditingCaption && isOwner ? (
              <form onSubmit={handleSaveCaption} className="space-y-3 text-left">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-300">
                    Write Your Own Caption
                  </span>
                  <span className="text-[11px] text-rose-300/60">
                    Saves directly to cloud
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-rose-300/80 mb-1">
                      Title
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={160}
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full bg-black/45 border border-rose-500/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-rose-300/80 mb-1">
                      Date / Occasion
                    </label>
                    <input
                      type="text"
                      maxLength={80}
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="w-full bg-black/45 border border-rose-500/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-rose-300/80 mb-1">
                      Category
                    </label>
                    <select
                      value={editTag}
                      onChange={(e) => setEditTag(e.target.value)}
                      className="w-full bg-[#1b0207] border border-rose-500/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-400"
                    >
                      <option value="Birthday Special">Birthday Special</option>
                      <option value="Sweet Moments">Sweet Moments</option>
                      <option value="Our Firsts">Our Firsts</option>
                      <option value="Date Nights">Date Nights</option>
                      <option value="Adventures">Adventures</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-rose-300/80 mb-1">
                    Your Caption
                  </label>
                  <textarea
                    rows={3}
                    maxLength={1000}
                    value={editCaption}
                    onChange={(e) => setEditCaption(e.target.value)}
                    placeholder="Write your own words for this photo or video..."
                    className="w-full bg-black/45 border border-rose-500/30 rounded-xl px-3 py-2 text-xs sm:text-sm text-white placeholder:text-rose-300/35 focus:outline-none focus:border-rose-400 resize-y"
                  />
                </div>

                {captionSaveError && (
                  <p className="text-xs text-red-300 bg-red-950/60 border border-red-500/30 rounded-lg p-2">
                    {captionSaveError}
                  </p>
                )}

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={isSavingCaption}
                    onClick={() => {
                      setIsEditingCaption(false);
                      setCaptionSaveError(null);
                    }}
                    className="px-3.5 py-2 text-xs font-medium text-rose-300 hover:text-white rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingCaption}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 rounded-xl transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
                  >
                    {isSavingCaption ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>{isSavingCaption ? 'Saving...' : 'Save Caption'}</span>
                  </button>
                </div>
              </form>
            ) : (
              <div key={`caption-${activeItem.id}`}>
                <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-rose-300/75 mb-1">
                  <span>{activeItem.date}</span>
                  <span aria-hidden="true">·</span>
                  <span className="uppercase tracking-wider font-semibold text-rose-300">
                    {activeItem.type}
                  </span>
                  {activeItem.type === 'photo' && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Tap center photo to zoom</span>
                    </>
                  )}
                  {isOwner && onUpdateMemory && (
                    <>
                      <span aria-hidden="true">·</span>
                      <button
                        type="button"
                        onClick={handleStartEditCaption}
                        className="inline-flex items-center gap-1 text-amber-200 hover:text-amber-100 font-medium underline underline-offset-2 cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Edit Caption</span>
                      </button>
                    </>
                  )}
                </div>

                <h2 className="font-serif-cormorant text-xl sm:text-2xl font-bold text-white">
                  {activeItem.title}
                </h2>

                <p className="text-xs sm:text-sm text-rose-200/90 mt-1.5 font-light leading-relaxed">
                  {activeItem.caption || 'A cherished moment of my love, Tsi.'}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Romantic Page Redirection Strip to Love Letter */}
      <section className="mt-12 pt-8 border-t border-rose-500/20">
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
              type="button"
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
