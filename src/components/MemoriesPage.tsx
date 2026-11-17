import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  Pause,
  Plus,
  ArrowRight,
  Heart,
  Camera,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Loader2,
  Film,
  Edit3,
  Check,
  BookOpen,
  RotateCcw,
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

type AlbumViewState = 'frontCover' | 'pages' | 'endCover';

const SLIDE_DURATION_MS = 5000;

/**
 * Physical 3D album page & front-cover flip variants (hinged on the left spine):
 * - direction >= 0 (Open Cover / Next Photo — triggered when she swipes RIGHT or clicks Next):
 *   The top cover/page lifts on top (zIndex 35) and flips open in 3D around its left spine
 *   (rotateY: 0 -> -112deg), revealing the next photo page waiting underneath.
 * - direction < 0 (Previous Photo / Return to Cover — triggered when she swipes LEFT or clicks Previous):
 *   The previous page/cover swings back over the stack from the left (rotateY: -112deg -> 0deg).
 */
const albumFlipVariants = {
  enter: (direction: number) => ({
    rotateY: direction >= 0 ? 0 : -112,
    scale: direction >= 0 ? 0.985 : 1,
    opacity: direction >= 0 ? 0.92 : 0,
  }),
  center: {
    rotateY: 0,
    scale: 1,
    opacity: 1,
  },
  exit: (direction: number) => ({
    rotateY: direction >= 0 ? -112 : 0,
    scale: direction >= 0 ? 0.95 : 0.985,
    opacity: 0,
  }),
};

/**
 * Dedicated Album Closing animation when finishing the end slide:
 * Swings the heavy hardcover shut from the left spine (-132deg -> 0deg) right over the final page.
 */
const albumEndCloseVariants = {
  enter: {
    rotateY: -132,
    scale: 1.03,
    opacity: 0.4,
  },
  center: {
    rotateY: 0,
    scale: 1,
    opacity: 1,
  },
  exit: {
    rotateY: -120,
    scale: 1.01,
    opacity: 0,
  },
};

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
  const [albumState, setAlbumState] = useState<AlbumViewState>('frontCover');
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [slideDirection, setSlideDirection] = useState<number>(1);
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(false);
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
  const isFirstSlide = currentIndex === 0;
  const isLastSlide =
    filteredMemories.length > 0 && currentIndex === filteredMemories.length - 1;

  // Close inline caption editor whenever switching slides or album states
  useEffect(() => {
    setIsEditingCaption(false);
    setCaptionSaveError(null);
  }, [activeItem?.id, albumState]);

  const handleOpenAlbum = useCallback(() => {
    if (filteredMemories.length === 0) return;
    setVideoError(null);
    setSlideDirection(1);
    setCurrentIndex(0);
    setAlbumState('pages');
  }, [filteredMemories.length]);

  const handleCloseToFrontCover = useCallback(() => {
    setIsAutoPlaying(false);
    setVideoError(null);
    setSlideDirection(-1);
    setAlbumState('frontCover');
  }, []);

  const handleCloseAlbumAtEnd = useCallback(() => {
    setIsAutoPlaying(false);
    setVideoError(null);
    setSlideDirection(-1);
    setAlbumState('endCover');
  }, []);

  const handleReopenLastPageFromEnd = useCallback(() => {
    if (filteredMemories.length === 0) return;
    setIsAutoPlaying(false);
    setVideoError(null);
    setSlideDirection(1);
    setCurrentIndex(filteredMemories.length - 1);
    setAlbumState('pages');
  }, [filteredMemories.length]);

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

  /**
   * Non-wrapping album navigation:
   * - Front Cover: forward -> Page 1; backward -> stays on Front Cover (never wraps to last slide).
   * - Page 1: backward -> Front Cover (never wraps to last slide).
   * - Last Slide: forward -> Closing Album animation (endCover) (never wraps to first slide).
   * - End Cover: backward -> Last Slide; forward -> stays closed.
   */
  const paginate = useCallback(
    (delta: number) => {
      if (filteredMemories.length === 0) return;

      if (albumState === 'frontCover') {
        if (delta > 0) {
          handleOpenAlbum();
        }
        return;
      }

      if (albumState === 'endCover') {
        if (delta < 0) {
          handleReopenLastPageFromEnd();
        }
        return;
      }

      // Currently viewing inside 'pages'
      if (delta > 0) {
        if (currentIndex >= filteredMemories.length - 1) {
          // Reached the end slide -> play the closing photo album animation!
          handleCloseAlbumAtEnd();
          return;
        }
        setVideoError(null);
        setSlideDirection(1);
        setCurrentIndex((prev) => Math.min(filteredMemories.length - 1, prev + 1));
      } else if (delta < 0) {
        if (currentIndex <= 0) {
          // On the first slide -> return to Front Cover instead of wrapping to the last slide
          handleCloseToFrontCover();
          return;
        }
        setVideoError(null);
        setSlideDirection(-1);
        setCurrentIndex((prev) => Math.max(0, prev - 1));
      }
    },
    [
      albumState,
      currentIndex,
      filteredMemories.length,
      handleOpenAlbum,
      handleReopenLastPageFromEnd,
      handleCloseAlbumAtEnd,
      handleCloseToFrontCover,
    ]
  );

  const goToSlide = useCallback(
    (targetIdx: number) => {
      if (filteredMemories.length === 0) return;
      const clampedIdx = Math.max(0, Math.min(filteredMemories.length - 1, targetIdx));
      if (albumState !== 'pages') {
        setVideoError(null);
        setSlideDirection(1);
        setCurrentIndex(clampedIdx);
        setAlbumState('pages');
        return;
      }
      if (clampedIdx === currentIndex) return;
      setVideoError(null);
      setSlideDirection(clampedIdx > currentIndex ? 1 : -1);
      setCurrentIndex(clampedIdx);
    },
    [filteredMemories.length, currentIndex, albumState]
  );

  // Auto-advance album pages when open and Auto-Turn is active; closes album at the end slide
  useEffect(() => {
    if (albumState !== 'pages' || !isAutoPlaying || filteredMemories.length === 0 || !activeItem) {
      return;
    }
    if (activeItem.type === 'video') return;

    const timer = window.setTimeout(() => {
      if (currentIndex >= filteredMemories.length - 1) {
        handleCloseAlbumAtEnd();
      } else {
        setVideoError(null);
        setSlideDirection(1);
        setCurrentIndex((prev) => Math.min(filteredMemories.length - 1, prev + 1));
      }
    }, SLIDE_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [
    albumState,
    isAutoPlaying,
    filteredMemories.length,
    activeItem,
    currentIndex,
    handleCloseAlbumAtEnd,
  ]);

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
    if (albumState !== 'pages') return;
    const container = filmstripRef.current;
    const el = thumbRefs.current[currentIndex];
    if (container && el) {
      const targetLeft =
        el.offsetLeft - container.clientWidth / 2 + el.clientWidth / 2;
      container.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
    }
  }, [currentIndex, albumState]);

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
        <p className="text-xs font-medium tracking-[0.2em] uppercase text-rose-300/85 mb-2.5">
          Chapter 01 · Tsi&apos;s Photo Album
        </p>

        <h1 className="font-serif-cormorant text-3xl sm:text-5xl font-bold text-white tracking-tight leading-tight text-balance">
          Happy Birthday,{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-300 via-rose-100 to-amber-200">
            Tsi
          </span>{' '}
          ❤️
        </h1>

        <p className="mt-2.5 text-xs sm:text-sm text-rose-200/80 max-w-2xl mx-auto leading-relaxed font-light">
          A keepsake photo album of our sweetest moments, celebrating the most breathtaking girl in the world.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2.5 mt-3 text-xs text-rose-300/75">
          <span className="tabular-nums">
            {memories.length} {memories.length === 1 ? 'Memory' : 'Memories'} Saved
          </span>
          <span aria-hidden="true">·</span>
          <span>Swipe Right for Next Pic</span>
          <span aria-hidden="true">·</span>
          <span className="text-rose-300 font-medium">Made for Tsi</span>
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
              setAlbumState('pages');
              setSlideDirection(1);
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
              setAlbumState('pages');
              setSlideDirection(1);
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
              setAlbumState('pages');
              setSlideDirection(1);
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
              setAlbumState('pages');
              setSlideDirection(1);
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
            <span>Add Photos &amp; Videos</span>
          </button>
        )}
      </div>

      {/* Loading Skeleton State */}
      {isLoading ? (
        <div className="max-w-4xl mx-auto romantic-card rounded-3xl overflow-hidden animate-pulse">
          <div className="h-[380px] sm:h-[490px] bg-rose-950/60" />
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
            <BookOpen className="w-10 h-10 text-rose-400" />
          </div>

          <h2 className="font-serif-cormorant text-2xl sm:text-3xl font-bold text-white mt-2 mb-3">
            Our Birthday Photo Album
          </h2>

          <p className="text-xs sm:text-sm text-rose-200/80 max-w-md mx-auto leading-relaxed font-light mb-6">
            {isOwner
              ? 'Upload photos and videos of Tsi from your device. Every memory turns smoothly like pages in a keepsake photo album.'
              : 'Sign in with your creator Google account to upload photos and videos of Tsi so she sees them inside her album when you share the link.'}
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
        /* Real Keepsake Photo Album with Front Cover + 3D Page Flip + End Closing Animation */
        <section aria-label="Tsi's Photo Album" className="max-w-4xl mx-auto space-y-5">
          {/* Top Album Controls */}
          <div className="flex items-center justify-between gap-3 px-1 text-xs">
            <div className="flex items-center gap-2 text-rose-200/90 min-w-0">
              <BookOpen className="w-3.5 h-3.5 text-amber-300/90 shrink-0" />
              {albumState === 'frontCover' ? (
                <span className="font-semibold whitespace-nowrap text-white">
                  Front Cover · {filteredMemories.length}{' '}
                  {filteredMemories.length === 1 ? 'Page' : 'Pages'}
                </span>
              ) : albumState === 'endCover' ? (
                <span className="font-semibold whitespace-nowrap text-white">
                  Album Closed · End of Volume I
                </span>
              ) : (
                <>
                  <span className="font-semibold tabular-nums whitespace-nowrap text-white">
                    Page {currentIndex + 1} of {filteredMemories.length}
                  </span>
                  <span aria-hidden="true" className="text-rose-500/50">·</span>
                  <span className="truncate text-rose-300/80">
                    {isLastSlide ? 'Final Page' : activeItem.tag}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {albumState === 'pages' ? (
                <>
                  <button
                    type="button"
                    onClick={handleCloseToFrontCover}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900/70 border border-rose-500/25 text-rose-100 transition-colors whitespace-nowrap cursor-pointer"
                    title="Close back to Album Cover"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-amber-200" />
                    <span>Cover</span>
                  </button>

                  {filteredMemories.length > 1 && activeItem.type === 'photo' && (
                    <button
                      type="button"
                      onClick={() => setIsAutoPlaying((prev) => !prev)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900/70 border border-rose-500/25 text-rose-100 transition-colors whitespace-nowrap cursor-pointer"
                      aria-label={isAutoPlaying ? 'Pause album auto-turn' : 'Auto-turn album pages'}
                    >
                      {isAutoPlaying ? (
                        <>
                          <Pause className="w-3.5 h-3.5" />
                          <span>Pause</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Auto-Turn</span>
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
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleOpenAlbum}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold transition-colors whitespace-nowrap cursor-pointer"
                >
                  <span>{albumState === 'endCover' ? 'Open From Page 1' : 'Open Album'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Hardcover Book Casing & Stacked Paper Thickness */}
          <div className="relative rounded-[28px] p-2.5 sm:p-4 bg-gradient-to-br from-[#3d0613] via-[#26030b] to-[#160105] border border-amber-200/25 shadow-[0_32px_80px_-18px_rgba(0,0,0,0.9)]">
            {/* Outer Gold Foil Book Rim */}
            <div className="pointer-events-none absolute inset-1.5 sm:inset-2.5 rounded-[22px] border border-amber-200/15" />

            {/* Book Thickness: Layered Cream Paper Edges on the Right Side */}
            <div className="relative rounded-2xl bg-[#dfd0b8] p-1 sm:p-1.5 pr-2 sm:pr-3 shadow-inner">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-2 right-0.5 w-1.5 rounded-r-md bg-gradient-to-b from-[#efe3cf] via-[#d3c1a5] to-[#e6d6bc] border-l border-[#b49c79]/40"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-3 right-1.5 w-1 rounded-r-sm bg-[#cbb89b]/70"
              />

              {/* 3D Spine-Hinged Page Flipping Viewport */}
              <div
                className="relative h-[420px] sm:h-[515px] md:h-[565px] rounded-xl overflow-hidden bg-[#2b030c]"
                style={{ perspective: '1800px' }}
              >
                <AnimatePresence initial={false} custom={slideDirection}>
                  {albumState === 'frontCover' ? (
                    /* ================= FRONT COVER PAGE ================= */
                    <motion.div
                      key="album-front-cover"
                      custom={slideDirection}
                      variants={albumFlipVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{
                        duration: 0.68,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      onPanStart={() => {
                        isDraggingRef.current = true;
                      }}
                      onPanEnd={(_, info) => {
                        setTimeout(() => {
                          isDraggingRef.current = false;
                        }, 80);

                        // Swiping right opens the cover onto Page 1; swiping left is blocked on Front Cover
                        if (info.offset.x > 35 || info.velocity.x > 200) {
                          handleOpenAlbum();
                        }
                      }}
                      onClick={() => {
                        if (isDraggingRef.current) return;
                        handleOpenAlbum();
                      }}
                      style={{
                        transformOrigin: '0% 50%',
                        transformStyle: 'preserve-3d',
                        backfaceVisibility: 'hidden',
                        backgroundImage:
                          'radial-gradient(circle at 65% 28%, rgba(180, 40, 72, 0.28), transparent 58%), linear-gradient(135deg, #5d0a1e 0%, #3a0411 52%, #24020a 100%)',
                      }}
                      className="absolute inset-0 z-30 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.75)] flex flex-col justify-between p-6 sm:p-10 pl-10 sm:pl-14 cursor-pointer select-none touch-pan-y border border-amber-200/30"
                    >
                      {/* Ribbed Leather Spine Hinge on Left */}
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 left-0 w-7 sm:w-10 bg-gradient-to-r from-[#1a0106] via-[#2c030c] to-transparent border-r border-amber-200/20 flex flex-col justify-evenly py-8 px-1.5"
                      >
                        <span className="h-2 rounded-sm bg-gradient-to-r from-amber-300/35 to-amber-100/10" />
                        <span className="h-2 rounded-sm bg-gradient-to-r from-amber-300/35 to-amber-100/10" />
                        <span className="h-2 rounded-sm bg-gradient-to-r from-amber-300/35 to-amber-100/10" />
                        <span className="h-2 rounded-sm bg-gradient-to-r from-amber-300/35 to-amber-100/10" />
                      </div>

                      {/* Gold Foil Embossed Inner Frame */}
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-3.5 sm:inset-5 left-9 sm:left-12 rounded-lg border border-amber-200/35"
                      />
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-5 sm:inset-7 left-10.5 sm:left-14 rounded-md border border-dashed border-amber-200/20"
                      />

                      {/* Brass Corner Protectors on Right Corners */}
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute top-0 right-0 w-7 h-7 border-t-[4px] border-r-[4px] border-amber-300/55 rounded-tr-xl"
                      />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute bottom-0 right-0 w-7 h-7 border-b-[4px] border-r-[4px] border-amber-300/55 rounded-br-xl"
                      />

                      {/* Cover Top Dedication */}
                      <div className="relative z-10 text-center pt-2">
                        <p className="text-[11px] sm:text-xs uppercase tracking-[0.28em] text-amber-200/80 font-medium">
                          Birthday Keepsake Edition
                        </p>
                      </div>

                      {/* Cover Center Cameo Portrait Window & Gold Foil Title */}
                      <div className="relative z-10 flex flex-col items-center text-center my-auto px-2">
                        {filteredMemories[0]?.type === 'photo' && filteredMemories[0]?.url ? (
                          <div className="mb-4 sm:mb-5 p-1.5 rounded-xl bg-[#faf3e7] border-2 border-amber-300/60 shadow-2xl -rotate-1">
                            <img
                              src={filteredMemories[0].url}
                              alt={filteredMemories[0].title}
                              referrerPolicy="no-referrer"
                              draggable={false}
                              className="w-24 h-24 sm:w-32 sm:h-32 object-cover rounded-lg"
                            />
                          </div>
                        ) : (
                          <div className="mb-4 w-16 h-16 rounded-full border border-amber-200/45 bg-rose-950/60 flex items-center justify-center text-amber-200 shadow-lg">
                            <Heart className="w-7 h-7 fill-current text-rose-400" />
                          </div>
                        )}

                        <h2 className="font-serif-cormorant text-3xl sm:text-5xl font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-b from-amber-100 via-amber-200 to-amber-400 drop-shadow">
                          Moments With Tsi
                        </h2>

                        <div className="flex items-center justify-center gap-3 my-3 w-44">
                          <span className="h-px flex-1 bg-amber-200/35" />
                          <Heart className="w-3.5 h-3.5 text-rose-300 fill-current shrink-0" />
                          <span className="h-px flex-1 bg-amber-200/35" />
                        </div>

                        <p className="text-xs sm:text-sm text-rose-100/80 max-w-sm font-light leading-relaxed">
                          Every photograph here holds a smile, a memory, and a piece of my heart for you.
                        </p>

                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenAlbum();
                          }}
                          className="mt-5 sm:mt-6 inline-flex items-center gap-2.5 px-6 py-3 min-h-[44px] rounded-xl bg-gradient-to-r from-amber-300 via-amber-200 to-amber-300 hover:from-amber-200 hover:to-amber-100 text-[#330610] text-xs sm:text-sm font-bold tracking-wide shadow-xl shadow-black/50 active:scale-95 transition-all cursor-pointer"
                        >
                          <BookOpen className="w-4 h-4" />
                          <span>Open Photo Album</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Cover Bottom Gold Stamp */}
                      <div className="relative z-10 flex items-center justify-between text-[11px] text-amber-200/70 pb-1">
                        <span>Volume I · For Tsi</span>
                        <span className="tabular-nums">
                          {filteredMemories.length}{' '}
                          {filteredMemories.length === 1 ? 'Memory' : 'Memories'}
                        </span>
                      </div>
                    </motion.div>
                  ) : albumState === 'endCover' ? (
                    /* ================= CLOSING PHOTO ALBUM ANIMATION & BACK COVER ================= */
                    <motion.div
                      key="album-end-cover"
                      variants={albumEndCloseVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{
                        duration: 0.78,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      onPanStart={() => {
                        isDraggingRef.current = true;
                      }}
                      onPanEnd={(_, info) => {
                        setTimeout(() => {
                          isDraggingRef.current = false;
                        }, 80);

                        // Swiping left on the closed End Cover reopens the final photo page
                        if (info.offset.x < -35 || info.velocity.x < -200) {
                          handleReopenLastPageFromEnd();
                        }
                      }}
                      style={{
                        transformOrigin: '0% 50%',
                        transformStyle: 'preserve-3d',
                        backfaceVisibility: 'hidden',
                        backgroundImage:
                          'radial-gradient(circle at 35% 35%, rgba(168, 32, 64, 0.25), transparent 62%), linear-gradient(145deg, #4b0717 0%, #2d030d 55%, #1c0107 100%)',
                      }}
                      className="absolute inset-0 z-40 rounded-xl shadow-[0_24px_55px_rgba(0,0,0,0.85)] flex flex-col justify-between p-6 sm:p-10 pl-10 sm:pl-14 select-none touch-pan-y border border-amber-200/30"
                    >
                      {/* Ribbed Leather Spine Hinge on Left */}
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 left-0 w-7 sm:w-10 bg-gradient-to-r from-[#140105] via-[#27030b] to-transparent border-r border-amber-200/20 flex flex-col justify-evenly py-8 px-1.5"
                      >
                        <span className="h-2 rounded-sm bg-gradient-to-r from-amber-300/35 to-amber-100/10" />
                        <span className="h-2 rounded-sm bg-gradient-to-r from-amber-300/35 to-amber-100/10" />
                        <span className="h-2 rounded-sm bg-gradient-to-r from-amber-300/35 to-amber-100/10" />
                        <span className="h-2 rounded-sm bg-gradient-to-r from-amber-300/35 to-amber-100/10" />
                      </div>

                      {/* Gold Foil Double Inner Frame */}
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-3.5 sm:inset-5 left-9 sm:left-12 rounded-lg border border-amber-200/35"
                      />
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-5 sm:inset-7 left-10.5 sm:left-14 rounded-md border border-dashed border-amber-200/20"
                      />

                      {/* Closing Ribbon / Clasp Accent that settles into place once shut */}
                      <motion.div
                        aria-hidden="true"
                        initial={{ scaleX: 0, opacity: 0 }}
                        animate={{ scaleX: 1, opacity: 1 }}
                        transition={{ delay: 0.42, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                        style={{ originX: 1 }}
                        className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 w-8 sm:w-12 h-11 rounded-l-lg bg-gradient-to-l from-amber-300/90 via-amber-200/80 to-amber-400/70 border-y border-l border-amber-100/60 shadow-lg flex items-center justify-start pl-2.5"
                      >
                        <Heart className="w-3.5 h-3.5 text-[#3a0411] fill-current" />
                      </motion.div>

                      <div className="relative z-10 text-center pt-2">
                        <p className="text-[11px] sm:text-xs uppercase tracking-[0.28em] text-amber-200/80 font-medium">
                          End of Volume I
                        </p>
                      </div>

                      <div className="relative z-10 flex flex-col items-center text-center my-auto px-2">
                        <motion.div
                          initial={{ scale: 0.75, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ delay: 0.32, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                          className="mb-4 w-16 h-16 rounded-full border border-amber-200/50 bg-rose-950/75 flex items-center justify-center text-rose-300 shadow-2xl"
                        >
                          <Heart className="w-7 h-7 fill-current text-rose-400" />
                        </motion.div>

                        <h2 className="font-serif-cormorant text-3xl sm:text-4xl font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-b from-amber-100 via-amber-200 to-amber-400 drop-shadow">
                          Forever With You, Tsi
                        </h2>

                        <div className="flex items-center justify-center gap-3 my-3 w-40">
                          <span className="h-px flex-1 bg-amber-200/35" />
                          <span className="text-[10px] uppercase tracking-[0.2em] text-amber-200/75">
                            Sealed
                          </span>
                          <span className="h-px flex-1 bg-amber-200/35" />
                        </div>

                        <p className="text-xs sm:text-sm text-rose-100/80 max-w-sm font-light leading-relaxed">
                          All {filteredMemories.length} favorite moments tucked safely inside. Ready for the next part of your birthday surprise?
                        </p>

                        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-sm">
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={handleOpenAlbum}
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-amber-200/35 text-amber-100 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Reopen Album</span>
                          </button>

                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={onNavigateToLetter}
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-gradient-to-r from-amber-300 via-amber-200 to-amber-300 hover:from-amber-200 hover:to-amber-100 text-[#330610] text-xs font-bold shadow-xl shadow-black/50 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                          >
                            <span>Open Love Letter</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="relative z-10 flex items-center justify-between text-[11px] text-amber-200/70 pb-1">
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={handleReopenLastPageFromEnd}
                          className="inline-flex items-center gap-1 hover:text-amber-100 transition-colors cursor-pointer"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                          <span>Back to Last Photo</span>
                        </button>
                        <span>Happy Birthday, Tsi ❤️</span>
                      </div>
                    </motion.div>
                  ) : (
                    /* ================= FLIPPING ALBUM PHOTO PAGE ================= */
                    <motion.div
                      key={activeItem.id}
                      custom={slideDirection}
                      variants={albumFlipVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{
                        duration: 0.62,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      onPanStart={() => {
                        if (activeItem.type !== 'video') {
                          isDraggingRef.current = true;
                        }
                      }}
                      onPanEnd={(_, info) => {
                        if (activeItem.type === 'video') return;
                        setTimeout(() => {
                          isDraggingRef.current = false;
                        }, 80);

                        // Swiping RIGHT -> Next pic (or Close Album on the end slide)
                        // Swiping LEFT -> Previous pic (or Front Cover on the first slide; never wraps to last slide)
                        if (info.offset.x > 40 || info.velocity.x > 220) {
                          setIsAutoPlaying(false);
                          paginate(1);
                        } else if (info.offset.x < -40 || info.velocity.x < -220) {
                          setIsAutoPlaying(false);
                          paginate(-1);
                        }
                      }}
                      onClick={() => {
                        if (isDraggingRef.current) return;
                        if (activeItem.type === 'photo') {
                          setIsAutoPlaying(false);
                          onSelectMemory(activeItem);
                        }
                      }}
                      style={{
                        transformOrigin: '0% 50%',
                        transformStyle: 'preserve-3d',
                        backfaceVisibility: 'hidden',
                        backgroundImage:
                          'radial-gradient(circle at 25% 20%, rgba(255,255,255,0.7), transparent 65%), linear-gradient(90deg, rgba(105,62,48,0.18) 0%, rgba(105,62,48,0.04) 5%, rgba(255,255,255,0) 14%, rgba(255,255,255,0) 94%, rgba(105,62,48,0.09) 100%)',
                      }}
                      className="absolute inset-0 z-20 flex flex-col bg-[#faf4e8] rounded-xl shadow-[0_18px_40px_-10px_rgba(24,4,8,0.55)] touch-pan-y select-none cursor-grab active:cursor-grabbing"
                    >
                      {/* Active Auto-Turn Progress Bar along top edge of album page */}
                      {isAutoPlaying && activeItem.type === 'photo' && (
                        <div className="absolute top-0 left-0 right-0 h-1 bg-rose-900/15 z-30">
                          <motion.div
                            key={`album-progress-${activeItem.id}-${currentIndex}`}
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{ duration: SLIDE_DURATION_MS / 1000, ease: 'linear' }}
                            style={{ originX: 0 }}
                            className="h-full w-full bg-gradient-to-r from-rose-600 via-rose-400 to-amber-400"
                          />
                        </div>
                      )}

                      {/* Left Album Spine Crease & Binding Stitch Rings */}
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 left-0 w-7 sm:w-9 bg-gradient-to-r from-[#7c4d3e]/22 via-[#7c4d3e]/6 to-transparent z-10 flex flex-col justify-evenly py-7 pl-1.5"
                      >
                        <span className="w-3 h-1 rounded-full bg-[#6d3f32]/40" />
                        <span className="w-3 h-1 rounded-full bg-[#6d3f32]/40" />
                        <span className="w-3 h-1 rounded-full bg-[#6d3f32]/40" />
                        <span className="w-3 h-1 rounded-full bg-[#6d3f32]/40" />
                      </div>

                      {/* Mounted Photo Print Area inside the Album Page */}
                      <div className="relative flex-1 min-h-0 flex items-center justify-center p-4 sm:p-7 pl-8 sm:pl-11">
                        <div className="relative w-full h-full flex items-center justify-center rounded-lg bg-white p-2 sm:p-3 shadow-[0_10px_28px_-8px_rgba(38,14,18,0.28)] border border-[#e3d4be]">
                          {/* Classic Photo Album Corner Mounts */}
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute -top-1 -left-1 w-4 h-4 border-t-[3px] border-l-[3px] border-amber-700/55 rounded-tl-sm z-20"
                          />
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute -top-1 -right-1 w-4 h-4 border-t-[3px] border-r-[3px] border-amber-700/55 rounded-tr-sm z-20"
                          />
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute -bottom-1 -left-1 w-4 h-4 border-b-[3px] border-l-[3px] border-amber-700/55 rounded-bl-sm z-20"
                          />
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute -bottom-1 -right-1 w-4 h-4 border-b-[3px] border-r-[3px] border-amber-700/55 rounded-br-sm z-20"
                          />

                          {activeItem.type === 'photo' ? (
                            activeItem.url ? (
                              <img
                                src={activeItem.url}
                                alt={activeItem.title}
                                referrerPolicy="no-referrer"
                                draggable={false}
                                className="max-h-full max-w-full w-auto h-auto object-contain rounded-sm select-none"
                              />
                            ) : (
                              <div className="flex flex-col items-center justify-center text-rose-900/60">
                                <Camera className="w-10 h-10 mb-2" />
                                <span className="text-xs">Photo preview unavailable</span>
                              </div>
                            )
                          ) : activeItem.url ? (
                            <video
                              src={activeItem.url}
                              controls
                              playsInline
                              onPointerDown={(e) => e.stopPropagation()}
                              onPlay={() => setIsAutoPlaying(false)}
                              className="max-h-full max-w-full w-full h-full object-contain rounded-sm bg-black"
                            />
                          ) : (
                            <div className="w-full h-full rounded-sm bg-[#1b0409] flex flex-col items-center justify-center p-6 text-center space-y-3">
                              {loadingVideoId === activeItem.id ? (
                                <>
                                  <Loader2 className="w-9 h-9 animate-spin text-rose-400" />
                                  <p className="text-xs text-rose-200/80">Loading video memory...</p>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleLoadInlineVideo(activeItem);
                                    }}
                                    className="w-16 h-16 rounded-full bg-rose-600/90 hover:bg-rose-500 text-white flex items-center justify-center shadow-xl transition-transform hover:scale-105 cursor-pointer"
                                    aria-label="Play Video"
                                  >
                                    <Play className="w-7 h-7 fill-current ml-0.5" />
                                  </button>
                                  <p className="text-xs text-rose-200/85 font-medium">
                                    {videoError ? videoError : 'Tap to Play Video'}
                                  </p>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Subtle Archival Page Footer Margin */}
                      <div className="shrink-0 flex items-center justify-between gap-3 px-8 sm:px-11 pb-3 pt-0.5 text-[11px] text-[#6d3b42]/80">
                        <span className="truncate font-serif-cormorant italic text-sm text-[#4f1f27]">
                          {activeItem.title}
                        </span>
                        <span className="shrink-0 tabular-nums font-medium">
                          {String(currentIndex + 1).padStart(2, '0')} /{' '}
                          {String(filteredMemories.length).padStart(2, '0')}
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Left / Right Album Page Flip Buttons (when viewing pages) */}
                {albumState === 'pages' && (
                  <>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsAutoPlaying(false);
                        paginate(-1);
                      }}
                      aria-label={isFirstSlide ? 'Close to front cover' : 'Previous photo'}
                      title={isFirstSlide ? 'Back to front cover' : 'Previous photo'}
                      className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 z-40 min-w-[44px] min-h-[44px] rounded-full bg-[#240309]/80 hover:bg-rose-700 text-white border border-amber-200/30 flex items-center justify-center transition-colors shadow-xl cursor-pointer"
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </button>

                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsAutoPlaying(false);
                        paginate(1);
                      }}
                      aria-label={isLastSlide ? 'Close photo album' : 'Next photo'}
                      title={isLastSlide ? 'Close photo album' : 'Next photo'}
                      className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 z-40 min-w-[44px] min-h-[44px] rounded-full bg-[#240309]/80 hover:bg-rose-700 text-white border border-amber-200/30 flex items-center justify-center transition-colors shadow-xl cursor-pointer"
                    >
                      <ChevronRight className="w-6 h-6" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Below-Album Controls depending on Album State */}
          {albumState === 'frontCover' ? (
            <div className="text-center pt-1">
              <p className="text-xs text-rose-200/75 inline-flex items-center gap-1.5">
                <span>Tap &ldquo;Open Photo Album&rdquo; or swipe right on the cover to flip to Page 1</span>
                <ArrowRight className="w-3.5 h-3.5 text-amber-300" />
              </p>
            </div>
          ) : albumState === 'endCover' ? (
            <div className="text-center pt-1">
              <p className="text-xs text-rose-200/75">
                Photo album closed · Swipe left or tap &ldquo;Back to Last Photo&rdquo; to look again
              </p>
            </div>
          ) : (
            <>
              {/* Album Page Dots + Swipe Direction Hint */}
              <div className="flex flex-col items-center gap-2 pt-0.5">
                {filteredMemories.length > 1 && (
                  <div className="flex items-center justify-center gap-1.5" role="tablist" aria-label="Album pages">
                    {filteredMemories.map((item, idx) => {
                      const isActive = idx === currentIndex;
                      return (
                        <button
                          key={`dot-${item.id}`}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          aria-label={`Page ${idx + 1}`}
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

                <p className="text-[11px] text-rose-300/70 flex items-center gap-1.5">
                  {isLastSlide ? (
                    <>
                      <span>Final page · Swipe right to close the photo album</span>
                      <ArrowRight className="w-3 h-3 text-amber-300" />
                    </>
                  ) : (
                    <>
                      <span>Swipe right to flip to next photo</span>
                      <ArrowRight className="w-3 h-3" />
                    </>
                  )}
                </p>
              </div>

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
                      aria-label={`Go to page ${idx + 1}: ${item.title}`}
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

              {/* Full Active Photo Caption Card at the Bottom */}
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
                          <span>Tap photo to zoom</span>
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
            </>
          )}
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
