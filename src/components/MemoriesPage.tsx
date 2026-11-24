import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, useMotionValue, animate } from 'motion/react';
import {
  Play,
  Pause,
  Plus,
  ArrowRight,
  Heart,
  Camera,
  ChevronLeft,
  Maximize2,
  Loader2,
  Film,
  Edit3,
  Check,
  BookOpen,
  RotateCcw,
} from 'lucide-react';
import { MemoryItem } from '../types';
import { getReadableFirestoreErrorMessage } from '../lib/memoriesService';

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

interface FlipSheetState {
  id: number;
  direction: 1 | -1; // 1 = lifts & flips open to the left (0 -> -168deg), -1 = swings shut onto the stack (-168deg -> 0)
  kind: 'frontCover' | 'page' | 'endCover';
  item: MemoryItem | null;
  pageIndex: number;
  commitState: AlbumViewState;
  commitIndex: number;
}

const SLIDE_DURATION_MS = 5000;
const PAGE_FLIP_DURATION = 0.72;
const PAGE_FLIP_EASE: [number, number, number, number] = [0.24, 0.9, 0.32, 1];

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
  const [albumState, setAlbumState] = useState<AlbumViewState>('frontCover');
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [flipSheet, setFlipSheet] = useState<FlipSheetState | null>(null);
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(false);
  const [loadingVideoId, setLoadingVideoId] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [brokenImageIds, setBrokenImageIds] = useState<Record<string, boolean>>({});

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
  const swipeGestureRef = useRef<{
    x: number;
    y: number;
    time: number;
    lockedAxis: 'x' | 'y' | null;
    moved: boolean;
  } | null>(null);
  const flipCounterRef = useRef<number>(0);
  const flipSheetIdRef = useRef<number | null>(null);
  const dragResetTimerRef = useRef<number | null>(null);
  const dragTilt = useMotionValue(0);
  const showAddButton = isOwner || (!isLoading && memories.length === 0);

  const filteredMemories = memories;

  useEffect(() => {
    flipSheetIdRef.current = flipSheet?.id ?? null;
  }, [flipSheet]);

  useEffect(() => {
    return () => {
      if (dragResetTimerRef.current !== null) {
        window.clearTimeout(dragResetTimerRef.current);
      }
    };
  }, []);

  // Reset or clamp slide index when list changes
  useEffect(() => {
    flipSheetIdRef.current = null;
    setFlipSheet(null);
    dragTilt.set(0);
    if (filteredMemories.length === 0) {
      setAlbumState('frontCover');
      setCurrentIndex(0);
    } else {
      setCurrentIndex((prev) => (prev >= filteredMemories.length ? 0 : prev));
    }
    setVideoError(null);
  }, [filteredMemories.length, dragTilt]);

  const activeItem = filteredMemories[currentIndex] ?? null;
  const isFirstSlide = currentIndex === 0;
  const isLastSlide =
    filteredMemories.length > 0 && currentIndex === filteredMemories.length - 1;

  // Close inline caption editor whenever switching slides or album states
  useEffect(() => {
    setIsEditingCaption(false);
    setCaptionSaveError(null);
  }, [activeItem?.id, albumState]);

  // If user flips to an uncached chunked photo before background fetch reaches it, resolve it immediately
  useEffect(() => {
    if (
      albumState === 'pages' &&
      activeItem &&
      activeItem.type === 'photo' &&
      activeItem.isChunked &&
      !activeItem.url &&
      onResolveMedia
    ) {
      void onResolveMedia(activeItem.id).catch(() => {});
    }
  }, [albumState, activeItem, onResolveMedia]);

  // Preload upcoming page images so turning pages renders instantaneously
  useEffect(() => {
    if (filteredMemories.length === 0) return;
    const indicesToPreload =
      albumState === 'frontCover'
        ? [0, 1]
        : [currentIndex + 1, currentIndex + 2, currentIndex - 1];

    indicesToPreload.forEach((idx) => {
      const candidate = filteredMemories[idx];
      if (candidate?.type === 'photo' && candidate.url) {
        const img = new Image();
        img.decoding = 'async';
        img.src = candidate.url;
      }
    });
  }, [albumState, currentIndex, filteredMemories]);

  /**
   * Commit any in-progress page flip immediately if a new flip is triggered rapidly,
   * returning the logical view state and index we are flipping from.
   */
  const resolveBaseBeforeNewFlip = useCallback(() => {
    dragTilt.set(0);
    if (flipSheet) {
      return {
        state: flipSheet.commitState,
        index: flipSheet.commitIndex,
      };
    }
    return {
      state: albumState,
      index: currentIndex,
    };
  }, [albumState, currentIndex, flipSheet, dragTilt]);

  const handleOpenAlbum = useCallback(() => {
    if (filteredMemories.length === 0) return;
    const base = resolveBaseBeforeNewFlip();
    if (base.state === 'pages' && base.index === 0) {
      setFlipSheet(null);
      return;
    }

    setVideoError(null);
    const id = ++flipCounterRef.current;

    // Immediately reveal Page 1 underneath while the Front (or End) Cover flips open to the left
    setAlbumState('pages');
    setCurrentIndex(0);
    setFlipSheet({
      id,
      direction: 1,
      kind: base.state === 'endCover' ? 'endCover' : 'frontCover',
      item: filteredMemories[0] ?? null,
      pageIndex: 0,
      commitState: 'pages',
      commitIndex: 0,
    });
  }, [filteredMemories, resolveBaseBeforeNewFlip]);

  const handleCloseToFrontCover = useCallback(() => {
    const base = resolveBaseBeforeNewFlip();
    setIsAutoPlaying(false);
    setVideoError(null);
    if (base.state === 'frontCover') {
      setFlipSheet(null);
      return;
    }

    const id = ++flipCounterRef.current;
    // Keep the current page visible underneath while the Front Cover swings shut from the left
    setAlbumState('pages');
    setCurrentIndex(base.index);
    setFlipSheet({
      id,
      direction: -1,
      kind: 'frontCover',
      item: filteredMemories[0] ?? null,
      pageIndex: 0,
      commitState: 'frontCover',
      commitIndex: 0,
    });
  }, [filteredMemories, resolveBaseBeforeNewFlip]);

  const handleCloseAlbumAtEnd = useCallback(() => {
    const base = resolveBaseBeforeNewFlip();
    setIsAutoPlaying(false);
    setVideoError(null);
    if (base.state === 'endCover') {
      setFlipSheet(null);
      return;
    }

    const lastIdx = Math.max(0, filteredMemories.length - 1);
    const id = ++flipCounterRef.current;

    // Keep the last page visible underneath while the heavy leather closing cover swings shut from the left
    setAlbumState('pages');
    setCurrentIndex(lastIdx);
    setFlipSheet({
      id,
      direction: -1,
      kind: 'endCover',
      item: filteredMemories[lastIdx] ?? null,
      pageIndex: lastIdx,
      commitState: 'endCover',
      commitIndex: lastIdx,
    });
  }, [filteredMemories, resolveBaseBeforeNewFlip]);

  const handleReopenLastPageFromEnd = useCallback(() => {
    if (filteredMemories.length === 0) return;
    resolveBaseBeforeNewFlip();
    setIsAutoPlaying(false);
    setVideoError(null);

    const lastIdx = filteredMemories.length - 1;
    const id = ++flipCounterRef.current;

    // Reveal the last page underneath while the closing cover lifts open to the left
    setAlbumState('pages');
    setCurrentIndex(lastIdx);
    setFlipSheet({
      id,
      direction: 1,
      kind: 'endCover',
      item: filteredMemories[lastIdx] ?? null,
      pageIndex: lastIdx,
      commitState: 'pages',
      commitIndex: lastIdx,
    });
  }, [filteredMemories, resolveBaseBeforeNewFlip]);

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
        getReadableFirestoreErrorMessage(err, 'Could not save caption right now.')
      );
    } finally {
      setIsSavingCaption(false);
    }
  };

  /**
   * Non-wrapping physical album page turn:
   * - Front Cover: swipe right -> lifts cover open to Page 1; swipe left -> stays closed (never wraps).
   * - Page 1: swipe left -> swings Front Cover shut (never wraps to last slide).
   * - Last Slide: swipe right -> plays closing photo album animation (endCover) (never wraps to Page 1).
   * - End Cover: swipe left -> lifts cover open back to Last Slide; swipe right -> stays closed.
   */
  const paginate = useCallback(
    (delta: number) => {
      if (filteredMemories.length === 0) return;

      const base = resolveBaseBeforeNewFlip();

      if (base.state === 'frontCover') {
        if (delta > 0) {
          handleOpenAlbum();
        }
        return;
      }

      if (base.state === 'endCover') {
        if (delta < 0) {
          handleReopenLastPageFromEnd();
        }
        return;
      }

      // Currently viewing inside 'pages'
      if (delta > 0) {
        if (base.index >= filteredMemories.length - 1) {
          // Reached the end slide -> play the closing photo album animation!
          handleCloseAlbumAtEnd();
          return;
        }
        const nextIdx = Math.min(filteredMemories.length - 1, base.index + 1);
        const leavingItem = filteredMemories[base.index] ?? null;
        const id = ++flipCounterRef.current;

        setVideoError(null);
        // Reveal next page underneath while the current page flips open to the left
        setAlbumState('pages');
        setCurrentIndex(nextIdx);
        setFlipSheet({
          id,
          direction: 1,
          kind: 'page',
          item: leavingItem,
          pageIndex: base.index,
          commitState: 'pages',
          commitIndex: nextIdx,
        });
      } else if (delta < 0) {
        if (base.index <= 0) {
          // On the first slide -> swing Front Cover shut instead of wrapping to the last slide
          handleCloseToFrontCover();
          return;
        }
        const prevIdx = Math.max(0, base.index - 1);
        const returningItem = filteredMemories[prevIdx] ?? null;
        const id = ++flipCounterRef.current;

        setVideoError(null);
        // Keep current page underneath while previous page swings back down from the left
        setAlbumState('pages');
        setCurrentIndex(base.index);
        setFlipSheet({
          id,
          direction: -1,
          kind: 'page',
          item: returningItem,
          pageIndex: prevIdx,
          commitState: 'pages',
          commitIndex: prevIdx,
        });
      }
    },
    [
      filteredMemories,
      resolveBaseBeforeNewFlip,
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
      const base = resolveBaseBeforeNewFlip();

      if (base.state !== 'pages') {
        const id = ++flipCounterRef.current;
        setVideoError(null);
        setAlbumState('pages');
        setCurrentIndex(clampedIdx);
        setFlipSheet({
          id,
          direction: 1,
          kind: base.state,
          item: filteredMemories[clampedIdx] ?? null,
          pageIndex: clampedIdx,
          commitState: 'pages',
          commitIndex: clampedIdx,
        });
        return;
      }

      if (clampedIdx === base.index) {
        setFlipSheet(null);
        return;
      }

      setVideoError(null);
      const id = ++flipCounterRef.current;
      if (clampedIdx > base.index) {
        setAlbumState('pages');
        setCurrentIndex(clampedIdx);
        setFlipSheet({
          id,
          direction: 1,
          kind: 'page',
          item: filteredMemories[base.index] ?? null,
          pageIndex: base.index,
          commitState: 'pages',
          commitIndex: clampedIdx,
        });
      } else {
        setAlbumState('pages');
        setCurrentIndex(base.index);
        setFlipSheet({
          id,
          direction: -1,
          kind: 'page',
          item: filteredMemories[clampedIdx] ?? null,
          pageIndex: clampedIdx,
          commitState: 'pages',
          commitIndex: clampedIdx,
        });
      }
    },
    [filteredMemories, resolveBaseBeforeNewFlip]
  );

  // Auto-advance album pages when open and Auto-Turn is active; closes album at the end slide
  useEffect(() => {
    if (albumState !== 'pages' || !isAutoPlaying || filteredMemories.length === 0 || !activeItem) {
      return;
    }
    if (activeItem.type === 'video') return;

    const timer = window.setTimeout(() => {
      paginate(1);
    }, SLIDE_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [albumState, isAutoPlaying, filteredMemories.length, activeItem, paginate]);

  // Keyboard arrow navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"]')) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }
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

  const beginSwipe = useCallback((x: number, y: number) => {
    if (dragResetTimerRef.current !== null) {
      window.clearTimeout(dragResetTimerRef.current);
      dragResetTimerRef.current = null;
    }
    swipeGestureRef.current = {
      x,
      y,
      time: Date.now(),
      lockedAxis: null,
      moved: false,
    };
  }, []);

  const moveSwipe = useCallback(
    (x: number, y: number, allowNextLift: boolean, allowPrevTilt: boolean) => {
      const g = swipeGestureRef.current;
      if (!g) return;
      const dx = x - g.x;
      const dy = y - g.y;

      if (g.lockedAxis === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        g.lockedAxis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      }

      if (g.lockedAxis === 'x') {
        g.moved = true;
        isDraggingRef.current = true;
        if (dx < 0 && allowNextLift) {
          // Swiping left lifts the right side of the page around the left spine
          dragTilt.set(-Math.min(24, Math.abs(dx) * 0.22));
        } else if (dx > 0 && allowPrevTilt) {
          dragTilt.set(Math.min(10, dx * 0.08));
        }
      }
    },
    [dragTilt]
  );

  const endSwipe = useCallback(
    (x: number, y: number, onSwipeNext: () => void, onSwipePrev: () => void) => {
      animate(dragTilt, 0, { duration: 0.22 });
      const g = swipeGestureRef.current;
      swipeGestureRef.current = null;
      if (!g) return;

      const dx = x - g.x;
      const dy = y - g.y;
      const dt = Math.max(1, Date.now() - g.time);
      const velocityX = dx / (dt / 1000);

      if (g.moved || Math.abs(dx) > 10) {
        isDraggingRef.current = true;
        if (dragResetTimerRef.current !== null) {
          window.clearTimeout(dragResetTimerRef.current);
        }
        dragResetTimerRef.current = window.setTimeout(() => {
          isDraggingRef.current = false;
          dragResetTimerRef.current = null;
        }, 120);
      }

      const isHorizontalSwipe = g.lockedAxis !== 'y' && Math.abs(dx) > Math.abs(dy) * 0.8;
      if (!isHorizontalSwipe) return;

      // Natural phone book swipe:
      // - Swipe LEFT (finger moves right-to-left: dx < 0) -> Next Photo / Turn Page Forward
      // - Swipe RIGHT (finger moves left-to-right: dx > 0) -> Previous Photo / Turn Page Back
      if (dx < -28 || (dx < -14 && velocityX < -180)) {
        onSwipeNext();
      } else if (dx > 28 || (dx > 14 && velocityX > 180)) {
        onSwipePrev();
      }
    },
    [dragTilt]
  );

  const cancelSwipe = useCallback(() => {
    swipeGestureRef.current = null;
    animate(dragTilt, 0, { duration: 0.2 });
    if (dragResetTimerRef.current !== null) {
      window.clearTimeout(dragResetTimerRef.current);
    }
    dragResetTimerRef.current = window.setTimeout(() => {
      isDraggingRef.current = false;
      dragResetTimerRef.current = null;
    }, 80);
  }, [dragTilt]);

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
      setVideoError(
        getReadableFirestoreErrorMessage(err, 'Could not load video right now.')
      );
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
          <span>Swipe to Turn Pages</span>
          <span aria-hidden="true">·</span>
          <span className="text-rose-300 font-medium">Made for Tsi</span>
        </div>
      </section>

      {/* Owner Add Button Bar (Filter tabs removed) */}
      {showAddButton && (
        <div className="flex items-center justify-end mb-5 max-w-4xl mx-auto">
          <button
            type="button"
            onClick={onOpenAddModal}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-rose-600 to-red-600 rounded-xl hover:from-rose-500 hover:to-red-500 active:scale-95 transition-all shadow-lg shadow-rose-950/40 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Photos &amp; Videos</span>
          </button>
        </div>
      )}

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
      ) : !activeItem ? null : (
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
                style={{ perspective: '2000px' }}
              >
                {/* ================= BASE LAYER (ALWAYS FLAT UNDERNEATH) ================= */}
                {albumState === 'frontCover' ? (
                  <motion.div
                    style={{
                      transformOrigin: '0% 50%',
                      rotateY: dragTilt,
                      backgroundImage:
                        'radial-gradient(circle at 65% 28%, rgba(180, 40, 72, 0.28), transparent 58%), linear-gradient(135deg, #5d0a1e 0%, #3a0411 52%, #24020a 100%)',
                    }}
                    onTouchStart={(e) => {
                      const t = e.touches[0];
                      if (t) beginSwipe(t.clientX, t.clientY);
                    }}
                    onTouchMove={(e) => {
                      const t = e.touches[0];
                      if (t) moveSwipe(t.clientX, t.clientY, true, false);
                    }}
                    onTouchEnd={(e) => {
                      const t = e.changedTouches[0];
                      if (t) endSwipe(t.clientX, t.clientY, handleOpenAlbum, () => {});
                    }}
                    onTouchCancel={cancelSwipe}
                    onPointerDown={(e) => {
                      if (e.pointerType === 'touch') return;
                      beginSwipe(e.clientX, e.clientY);
                    }}
                    onPointerMove={(e) => {
                      if (e.pointerType === 'touch') return;
                      moveSwipe(e.clientX, e.clientY, true, false);
                    }}
                    onPointerUp={(e) => {
                      if (e.pointerType === 'touch') return;
                      endSwipe(e.clientX, e.clientY, handleOpenAlbum, () => {});
                    }}
                    onPointerCancel={cancelSwipe}
                    onPointerLeave={(e) => {
                      if (e.pointerType !== 'touch' && swipeGestureRef.current) cancelSwipe();
                    }}
                    onClick={() => {
                      if (isDraggingRef.current) return;
                      handleOpenAlbum();
                    }}
                    className="absolute inset-0 z-10 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.75)] flex flex-col justify-between p-4 sm:p-10 pl-9 sm:pl-14 cursor-pointer select-none touch-pan-y border border-amber-200/30"
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
                      className="pointer-events-none absolute inset-3 sm:inset-5 left-8.5 sm:left-12 rounded-lg border border-amber-200/35"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-4.5 sm:inset-7 left-10 sm:left-14 rounded-md border border-dashed border-amber-200/20"
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
                    <div className="relative z-10 text-center pt-1 sm:pt-2">
                      <p className="text-[10px] sm:text-xs uppercase tracking-[0.26em] text-amber-200/80 font-medium">
                        Birthday Keepsake Edition
                      </p>
                    </div>

                    {/* Cover Center Cameo Portrait Window & Gold Foil Title */}
                    <div className="relative z-10 flex flex-col items-center text-center my-auto px-2">
                      {filteredMemories[0]?.type === 'photo' && filteredMemories[0]?.url ? (
                        <div className="mb-3 sm:mb-5 p-1.5 rounded-xl bg-[#faf3e7] border-2 border-amber-300/60 shadow-2xl -rotate-1">
                          <img
                            src={filteredMemories[0].url}
                            alt={filteredMemories[0].title}
                            referrerPolicy="no-referrer"
                            decoding="async"
                            draggable={false}
                            className="w-20 h-20 sm:w-32 sm:h-32 object-cover rounded-lg"
                          />
                        </div>
                      ) : (
                        <div className="mb-3 sm:mb-4 w-12 h-12 sm:w-16 sm:h-16 rounded-full border border-amber-200/45 bg-rose-950/60 flex items-center justify-center text-amber-200 shadow-lg">
                          <Heart className="w-6 h-6 sm:w-7 sm:h-7 fill-current text-rose-400" />
                        </div>
                      )}

                      <h2 className="font-serif-cormorant text-2xl sm:text-5xl font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-b from-amber-100 via-amber-200 to-amber-400 drop-shadow">
                        Moments With Tsi
                      </h2>

                      <div className="flex items-center justify-center gap-3 my-2 sm:my-3 w-36 sm:w-44">
                        <span className="h-px flex-1 bg-amber-200/35" />
                        <Heart className="w-3.5 h-3.5 text-rose-300 fill-current shrink-0" />
                        <span className="h-px flex-1 bg-amber-200/35" />
                      </div>

                      <p className="text-[11px] sm:text-sm text-rose-100/80 max-w-xs sm:max-w-sm font-light leading-snug sm:leading-relaxed">
                        Every photograph here holds a smile, a memory, and a piece of my heart for you.
                      </p>

                      <button
                        type="button"
                        onTouchStart={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenAlbum();
                        }}
                        className="mt-4 sm:mt-6 inline-flex items-center gap-2.5 px-5 sm:px-6 py-2.5 sm:py-3 min-h-[44px] rounded-xl bg-gradient-to-r from-amber-300 via-amber-200 to-amber-300 hover:from-amber-200 hover:to-amber-100 text-[#330610] text-xs sm:text-sm font-bold tracking-wide shadow-xl shadow-black/50 active:scale-95 transition-all cursor-pointer"
                      >
                        <BookOpen className="w-4 h-4" />
                        <span>Open Photo Album</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Cover Bottom Gold Stamp */}
                    <div className="relative z-10 flex items-center justify-between text-[10px] sm:text-[11px] text-amber-200/70 pb-0.5 sm:pb-1">
                      <span>Volume I · For Tsi</span>
                      <span className="tabular-nums">
                        {filteredMemories.length}{' '}
                        {filteredMemories.length === 1 ? 'Memory' : 'Memories'}
                      </span>
                    </div>
                  </motion.div>
                ) : albumState === 'endCover' ? (
                  <motion.div
                    style={{
                      transformOrigin: '0% 50%',
                      rotateY: dragTilt,
                      backgroundImage:
                        'radial-gradient(circle at 35% 35%, rgba(168, 32, 64, 0.25), transparent 62%), linear-gradient(145deg, #4b0717 0%, #2d030d 55%, #1c0107 100%)',
                    }}
                    onTouchStart={(e) => {
                      const t = e.touches[0];
                      if (t) beginSwipe(t.clientX, t.clientY);
                    }}
                    onTouchMove={(e) => {
                      const t = e.touches[0];
                      if (t) moveSwipe(t.clientX, t.clientY, false, true);
                    }}
                    onTouchEnd={(e) => {
                      const t = e.changedTouches[0];
                      if (t) {
                        endSwipe(t.clientX, t.clientY, () => {}, handleReopenLastPageFromEnd);
                      }
                    }}
                    onTouchCancel={cancelSwipe}
                    onPointerDown={(e) => {
                      if (e.pointerType === 'touch') return;
                      beginSwipe(e.clientX, e.clientY);
                    }}
                    onPointerMove={(e) => {
                      if (e.pointerType === 'touch') return;
                      moveSwipe(e.clientX, e.clientY, false, true);
                    }}
                    onPointerUp={(e) => {
                      if (e.pointerType === 'touch') return;
                      endSwipe(e.clientX, e.clientY, () => {}, handleReopenLastPageFromEnd);
                    }}
                    onPointerCancel={cancelSwipe}
                    onPointerLeave={(e) => {
                      if (e.pointerType !== 'touch' && swipeGestureRef.current) cancelSwipe();
                    }}
                    className="absolute inset-0 z-10 rounded-xl shadow-[0_24px_55px_rgba(0,0,0,0.85)] flex flex-col justify-between p-4 sm:p-10 pl-9 sm:pl-14 select-none touch-pan-y border border-amber-200/30"
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
                      className="pointer-events-none absolute inset-3 sm:inset-5 left-8.5 sm:left-12 rounded-lg border border-amber-200/35"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-4.5 sm:inset-7 left-10 sm:left-14 rounded-md border border-dashed border-amber-200/20"
                    />

                    {/* Gold Clasp Settled Into Place */}
                    <motion.div
                      aria-hidden="true"
                      initial={{ scaleX: 0, opacity: 0 }}
                      animate={{ scaleX: 1, opacity: 1 }}
                      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                      style={{ originX: 1 }}
                      className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 w-7 sm:w-12 h-10 sm:h-11 rounded-l-lg bg-gradient-to-l from-amber-300/90 via-amber-200/80 to-amber-400/70 border-y border-l border-amber-100/60 shadow-lg flex items-center justify-start pl-2 sm:pl-2.5"
                    >
                      <Heart className="w-3.5 h-3.5 text-[#3a0411] fill-current" />
                    </motion.div>

                    <div className="relative z-10 text-center pt-1 sm:pt-2">
                      <p className="text-[10px] sm:text-xs uppercase tracking-[0.26em] text-amber-200/80 font-medium">
                        End of Volume I
                      </p>
                    </div>

                    <div className="relative z-10 flex flex-col items-center text-center my-auto px-2">
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                        className="mb-2.5 sm:mb-4 w-11 h-11 sm:w-16 sm:h-16 rounded-full border border-amber-200/50 bg-rose-950/75 flex items-center justify-center text-rose-300 shadow-2xl"
                      >
                        <Heart className="w-5 h-5 sm:w-7 sm:h-7 fill-current text-rose-400" />
                      </motion.div>

                      <h2 className="font-serif-cormorant text-2xl sm:text-4xl font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-b from-amber-100 via-amber-200 to-amber-400 drop-shadow">
                        Forever With You, Tsi
                      </h2>

                      <div className="flex items-center justify-center gap-3 my-2 sm:my-3 w-36 sm:w-40">
                        <span className="h-px flex-1 bg-amber-200/35" />
                        <span className="text-[10px] uppercase tracking-[0.2em] text-amber-200/75">
                          Sealed
                        </span>
                        <span className="h-px flex-1 bg-amber-200/35" />
                      </div>

                      <p className="text-[11px] sm:text-sm text-rose-100/80 max-w-xs sm:max-w-sm font-light leading-snug sm:leading-relaxed">
                        All {filteredMemories.length} favorite moments tucked safely inside. Ready for the next part of your birthday surprise?
                      </p>

                      <div className="mt-4 sm:mt-6 flex flex-wrap items-center justify-center gap-2 sm:gap-3 w-full max-w-sm">
                        <button
                          type="button"
                          onTouchStart={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={onNavigateToLetter}
                          className="inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2.5 min-h-[44px] rounded-xl bg-gradient-to-r from-amber-300 via-amber-200 to-amber-300 hover:from-amber-200 hover:to-amber-100 text-[#330610] text-[11px] sm:text-xs font-bold shadow-xl shadow-black/50 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                        >
                          <span>Open Love Letter</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onTouchStart={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={handleOpenAlbum}
                          className="inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2.5 min-h-[44px] rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-amber-200/35 text-amber-100 text-[11px] sm:text-xs font-semibold transition-all cursor-pointer whitespace-nowrap"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Reopen Album</span>
                        </button>
                      </div>
                    </div>

                    <div className="relative z-10 flex items-center justify-between text-[10px] sm:text-[11px] text-amber-200/70 pt-2 pb-0.5 sm:pb-1">
                      <button
                        type="button"
                        onTouchStart={(e) => e.stopPropagation()}
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
                  /* ================= ACTIVE ARCHIVAL PHOTO ALBUM PAGE (NO NEXT BUTTON) ================= */
                  <motion.div
                    key={activeItem.id}
                    style={{
                      transformOrigin: '0% 50%',
                      rotateY: dragTilt,
                      backgroundImage:
                        'radial-gradient(circle at 25% 20%, rgba(255,255,255,0.72), transparent 65%), linear-gradient(90deg, rgba(105,62,48,0.2) 0%, rgba(105,62,48,0.05) 5%, rgba(255,255,255,0) 14%, rgba(255,255,255,0) 94%, rgba(105,62,48,0.09) 100%)',
                    }}
                    onTouchStart={(e) => {
                      const t = e.touches[0];
                      if (t) beginSwipe(t.clientX, t.clientY);
                    }}
                    onTouchMove={(e) => {
                      const t = e.touches[0];
                      if (t) moveSwipe(t.clientX, t.clientY, true, true);
                    }}
                    onTouchEnd={(e) => {
                      const t = e.changedTouches[0];
                      if (t) {
                        endSwipe(
                          t.clientX,
                          t.clientY,
                          () => {
                            setIsAutoPlaying(false);
                            paginate(1);
                          },
                          () => {
                            setIsAutoPlaying(false);
                            paginate(-1);
                          }
                        );
                      }
                    }}
                    onTouchCancel={cancelSwipe}
                    onPointerDown={(e) => {
                      if (e.pointerType === 'touch') return;
                      beginSwipe(e.clientX, e.clientY);
                    }}
                    onPointerMove={(e) => {
                      if (e.pointerType === 'touch') return;
                      moveSwipe(e.clientX, e.clientY, true, true);
                    }}
                    onPointerUp={(e) => {
                      if (e.pointerType === 'touch') return;
                      endSwipe(
                        e.clientX,
                        e.clientY,
                        () => {
                          setIsAutoPlaying(false);
                          paginate(1);
                        },
                        () => {
                          setIsAutoPlaying(false);
                          paginate(-1);
                        }
                      );
                    }}
                    onPointerCancel={cancelSwipe}
                    onPointerLeave={(e) => {
                      if (e.pointerType !== 'touch' && swipeGestureRef.current) cancelSwipe();
                    }}
                    onClick={() => {
                      if (isDraggingRef.current) return;
                      if (activeItem.type === 'photo') {
                        setIsAutoPlaying(false);
                        onSelectMemory(activeItem);
                      }
                    }}
                    className="group/page absolute inset-0 z-10 flex flex-col bg-[#faf4e8] rounded-xl shadow-[0_18px_40px_-10px_rgba(24,4,8,0.55)] touch-pan-y select-none cursor-grab active:cursor-grabbing"
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

                    {/* Left Album Spine Crease & Binding Stitch Rings (Tap left spine edge to turn back a page) */}
                    <button
                      type="button"
                      onTouchStart={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsAutoPlaying(false);
                        paginate(-1);
                      }}
                      aria-label={isFirstSlide ? 'Flip back to front cover' : 'Flip back to previous page'}
                      title={isFirstSlide ? 'Flip back to cover' : 'Flip back one page'}
                      className="absolute inset-y-0 left-0 w-8 sm:w-10 bg-gradient-to-r from-[#7c4d3e]/24 via-[#7c4d3e]/8 to-transparent z-20 flex flex-col justify-evenly py-7 pl-1.5 cursor-pointer hover:from-[#7c4d3e]/34 transition-colors"
                    >
                      <span className="w-3 h-1 rounded-full bg-[#6d3f32]/45" />
                      <span className="w-3 h-1 rounded-full bg-[#6d3f32]/45" />
                      <span className="w-3 h-1 rounded-full bg-[#6d3f32]/45" />
                      <span className="w-3 h-1 rounded-full bg-[#6d3f32]/45" />
                    </button>

                    {/* Mounted Photo Print Area inside the Album Page */}
                    <div className="relative flex-1 min-h-0 flex items-center justify-center p-4 sm:p-7 pl-9 sm:pl-12">
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
                          activeItem.url && !brokenImageIds[activeItem.id] ? (
                            <img
                              src={activeItem.url}
                              alt={activeItem.title}
                              referrerPolicy="no-referrer"
                              decoding="async"
                              draggable={false}
                              onError={() =>
                                setBrokenImageIds((prev) => ({
                                  ...prev,
                                  [activeItem.id]: true,
                                }))
                              }
                              className="max-h-full max-w-full w-auto h-auto object-contain rounded-sm select-none"
                            />
                          ) : activeItem.isChunked && !brokenImageIds[activeItem.id] ? (
                            <div className="flex flex-col items-center justify-center text-rose-900/70 gap-2">
                              <Loader2 className="w-8 h-8 animate-spin text-rose-600" />
                              <span className="text-xs font-medium">Loading photo...</span>
                            </div>
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
                              onTouchStart={(e) => e.stopPropagation()}
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
                                  onTouchStart={(e) => e.stopPropagation()}
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
                    <div className="shrink-0 flex items-center justify-between gap-3 px-9 sm:px-14 pb-3 pt-0.5 text-[11px] text-[#6d3b42]/80">
                      <span className="truncate font-serif-cormorant italic text-sm text-[#4f1f27]">
                        {activeItem.title}
                      </span>
                      <span className="shrink-0 tabular-nums font-medium pr-8 sm:pr-10">
                        {String(currentIndex + 1).padStart(2, '0')} /{' '}
                        {String(filteredMemories.length).padStart(2, '0')}
                      </span>
                    </div>

                    {/* Realistic Curled Paper Page Corner (Bottom-Right) — Tap or swipe right to flip the page */}
                    <button
                      type="button"
                      onTouchStart={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsAutoPlaying(false);
                        paginate(1);
                      }}
                      aria-label={isLastSlide ? 'Flip to close album' : 'Flip page forward'}
                      title={isLastSlide ? 'Tap corner to close album' : 'Tap corner to flip page'}
                      className="absolute bottom-0 right-0 z-20 w-12 h-12 sm:w-14 sm:h-14 cursor-pointer focus:outline-none group/corner"
                    >
                      {/* Shadow underneath curled triangle */}
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute bottom-0 right-0 w-10 h-10 sm:w-12 sm:h-12 transition-transform duration-300 group-hover/page:scale-110 group-hover/corner:scale-125 origin-bottom-right"
                        style={{
                          background:
                            'linear-gradient(135deg, transparent 48%, rgba(62,24,28,0.22) 50%, rgba(28,8,12,0.5) 100%)',
                        }}
                      />
                      {/* Curled cream paper fold */}
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute bottom-0 right-0 w-10 h-10 sm:w-12 sm:h-12 transition-transform duration-300 group-hover/page:scale-110 group-hover/corner:scale-125 origin-bottom-right rounded-tl-md"
                        style={{
                          background:
                            'linear-gradient(135deg, #f3e6d0 0%, #e5d2b5 47%, rgba(168,138,104,0.35) 50%, transparent 51%)',
                          boxShadow: '-3px -3px 8px rgba(45,14,18,0.18)',
                        }}
                      />
                    </button>
                  </motion.div>
                )}

                {/* ================= REAL TWO-SIDED 3D FLIPPING PAGE SHEET LAYER ================= */}
                {flipSheet && (
                  <>
                    {/* Dynamic shadow cast across the underlying page during the turn */}
                    <motion.div
                      key={`flip-shadow-${flipSheet.id}`}
                      initial={{ opacity: flipSheet.direction === 1 ? 0.45 : 0 }}
                      animate={{ opacity: flipSheet.direction === 1 ? 0 : 0.48 }}
                      transition={{ duration: PAGE_FLIP_DURATION, ease: 'easeInOut' }}
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-r from-black/75 via-black/35 to-transparent"
                    />

                    {/* Rotating 3D Double-Sided Book Leaf */}
                    <motion.div
                      key={`flip-leaf-${flipSheet.id}`}
                      initial={{
                        rotateY: flipSheet.direction === 1 ? 0 : -168,
                      }}
                      animate={{
                        rotateY: flipSheet.direction === 1 ? -168 : 0,
                      }}
                      transition={{
                        duration: PAGE_FLIP_DURATION,
                        ease: PAGE_FLIP_EASE,
                      }}
                      onAnimationComplete={() => {
                        if (flipSheetIdRef.current !== flipSheet.id) return;
                        flipSheetIdRef.current = null;
                        setAlbumState(flipSheet.commitState);
                        setCurrentIndex(flipSheet.commitIndex);
                        setFlipSheet(null);
                      }}
                      style={{
                        transformOrigin: '0% 50%',
                        transformStyle: 'preserve-3d',
                      }}
                      className="pointer-events-none absolute inset-0 z-30"
                    >
                      {/* FRONT FACE OF THE FLIPPING SHEET */}
                      <div
                        style={{ backfaceVisibility: 'hidden' }}
                        className="absolute inset-0 rounded-xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.65)]"
                      >
                        {flipSheet.kind === 'frontCover' ? (
                          <div
                            style={{
                              backgroundImage:
                                'radial-gradient(circle at 65% 28%, rgba(180, 40, 72, 0.28), transparent 58%), linear-gradient(135deg, #5d0a1e 0%, #3a0411 52%, #24020a 100%)',
                            }}
                            className="w-full h-full flex flex-col justify-between p-6 sm:p-10 pl-10 sm:pl-14 border border-amber-200/30"
                          >
                            <div
                              aria-hidden="true"
                              className="absolute inset-y-0 left-0 w-7 sm:w-10 bg-gradient-to-r from-[#1a0106] via-[#2c030c] to-transparent border-r border-amber-200/20 flex flex-col justify-evenly py-8 px-1.5"
                            >
                              <span className="h-2 rounded-sm bg-gradient-to-r from-amber-300/35 to-amber-100/10" />
                              <span className="h-2 rounded-sm bg-gradient-to-r from-amber-300/35 to-amber-100/10" />
                              <span className="h-2 rounded-sm bg-gradient-to-r from-amber-300/35 to-amber-100/10" />
                              <span className="h-2 rounded-sm bg-gradient-to-r from-amber-300/35 to-amber-100/10" />
                            </div>
                            <div
                              aria-hidden="true"
                              className="absolute inset-3.5 sm:inset-5 left-9 sm:left-12 rounded-lg border border-amber-200/35"
                            />
                            <div className="relative z-10 text-center pt-2">
                              <p className="text-[11px] sm:text-xs uppercase tracking-[0.28em] text-amber-200/80 font-medium">
                                Birthday Keepsake Edition
                              </p>
                            </div>
                            <div className="relative z-10 flex flex-col items-center text-center my-auto px-2">
                              {filteredMemories[0]?.type === 'photo' && filteredMemories[0]?.url ? (
                                <div className="mb-4 sm:mb-5 p-1.5 rounded-xl bg-[#faf3e7] border-2 border-amber-300/60 shadow-2xl -rotate-1">
                                  <img
                                    src={filteredMemories[0].url}
                                    alt={filteredMemories[0].title}
                                    referrerPolicy="no-referrer"
                                    className="w-24 h-24 sm:w-32 sm:h-32 object-cover rounded-lg"
                                  />
                                </div>
                              ) : (
                                <div className="mb-4 w-16 h-16 rounded-full border border-amber-200/45 bg-rose-950/60 flex items-center justify-center text-amber-200 shadow-lg">
                                  <Heart className="w-7 h-7 fill-current text-rose-400" />
                                </div>
                              )}
                              <h2 className="font-serif-cormorant text-3xl sm:text-5xl font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-b from-amber-100 via-amber-200 to-amber-400">
                                Moments With Tsi
                              </h2>
                            </div>
                            <div className="relative z-10 flex items-center justify-between text-[11px] text-amber-200/70 pb-1">
                              <span>Volume I · For Tsi</span>
                              <span>{filteredMemories.length} Memories</span>
                            </div>
                          </div>
                        ) : flipSheet.kind === 'endCover' ? (
                          <div
                            style={{
                              backgroundImage:
                                'radial-gradient(circle at 35% 35%, rgba(168, 32, 64, 0.25), transparent 62%), linear-gradient(145deg, #4b0717 0%, #2d030d 55%, #1c0107 100%)',
                            }}
                            className="w-full h-full flex flex-col justify-between p-6 sm:p-10 pl-10 sm:pl-14 border border-amber-200/30"
                          >
                            <div
                              aria-hidden="true"
                              className="absolute inset-y-0 left-0 w-7 sm:w-10 bg-gradient-to-r from-[#140105] via-[#27030b] to-transparent border-r border-amber-200/20 flex flex-col justify-evenly py-8 px-1.5"
                            >
                              <span className="h-2 rounded-sm bg-gradient-to-r from-amber-300/35 to-amber-100/10" />
                              <span className="h-2 rounded-sm bg-gradient-to-r from-amber-300/35 to-amber-100/10" />
                              <span className="h-2 rounded-sm bg-gradient-to-r from-amber-300/35 to-amber-100/10" />
                              <span className="h-2 rounded-sm bg-gradient-to-r from-amber-300/35 to-amber-100/10" />
                            </div>
                            <div
                              aria-hidden="true"
                              className="absolute inset-3.5 sm:inset-5 left-9 sm:left-12 rounded-lg border border-amber-200/35"
                            />
                            <div className="relative z-10 text-center pt-2">
                              <p className="text-[11px] sm:text-xs uppercase tracking-[0.28em] text-amber-200/80 font-medium">
                                End of Volume I
                              </p>
                            </div>
                            <div className="relative z-10 flex flex-col items-center text-center my-auto px-2">
                              <div className="mb-4 w-16 h-16 rounded-full border border-amber-200/50 bg-rose-950/75 flex items-center justify-center text-rose-300 shadow-2xl">
                                <Heart className="w-7 h-7 fill-current text-rose-400" />
                              </div>
                              <h2 className="font-serif-cormorant text-3xl sm:text-4xl font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-b from-amber-100 via-amber-200 to-amber-400">
                                Forever With You, Tsi
                              </h2>
                            </div>
                            <div className="relative z-10 flex items-center justify-between text-[11px] text-amber-200/70 pb-1">
                              <span>Sealed With Love</span>
                              <span>Happy Birthday, Tsi ❤️</span>
                            </div>
                          </div>
                        ) : (
                          /* Cream Photo Album Paper Sheet Front Face */
                          <div
                            style={{
                              backgroundImage:
                                'radial-gradient(circle at 25% 20%, rgba(255,255,255,0.72), transparent 65%), linear-gradient(90deg, rgba(105,62,48,0.2) 0%, rgba(105,62,48,0.05) 5%, rgba(255,255,255,0) 14%, rgba(255,255,255,0) 94%, rgba(105,62,48,0.09) 100%)',
                            }}
                            className="w-full h-full flex flex-col bg-[#faf4e8]"
                          >
                            <div
                              aria-hidden="true"
                              className="absolute inset-y-0 left-0 w-7 sm:w-9 bg-gradient-to-r from-[#7c4d3e]/22 via-[#7c4d3e]/6 to-transparent z-10 flex flex-col justify-evenly py-7 pl-1.5"
                            >
                              <span className="w-3 h-1 rounded-full bg-[#6d3f32]/40" />
                              <span className="w-3 h-1 rounded-full bg-[#6d3f32]/40" />
                              <span className="w-3 h-1 rounded-full bg-[#6d3f32]/40" />
                              <span className="w-3 h-1 rounded-full bg-[#6d3f32]/40" />
                            </div>
                            <div className="relative flex-1 min-h-0 flex items-center justify-center p-4 sm:p-7 pl-9 sm:pl-12">
                              <div className="relative w-full h-full flex items-center justify-center rounded-lg bg-white p-2 sm:p-3 shadow-[0_10px_28px_-8px_rgba(38,14,18,0.28)] border border-[#e3d4be]">
                                {flipSheet.item?.type === 'photo' && flipSheet.item.url ? (
                                  <img
                                    src={flipSheet.item.url}
                                    alt={flipSheet.item.title}
                                    referrerPolicy="no-referrer"
                                    className="max-h-full max-w-full w-auto h-auto object-contain rounded-sm"
                                  />
                                ) : flipSheet.item?.thumbnailUrl ? (
                                  <img
                                    src={flipSheet.item.thumbnailUrl}
                                    alt={flipSheet.item.title}
                                    referrerPolicy="no-referrer"
                                    className="max-h-full max-w-full w-auto h-auto object-contain rounded-sm"
                                  />
                                ) : (
                                  <div className="flex flex-col items-center justify-center text-rose-900/60">
                                    <Film className="w-10 h-10 mb-2" />
                                    <span className="text-xs">{flipSheet.item?.title}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 flex items-center justify-between gap-3 px-9 sm:px-14 pb-3 pt-0.5 text-[11px] text-[#6d3b42]/80">
                              <span className="truncate font-serif-cormorant italic text-sm text-[#4f1f27]">
                                {flipSheet.item?.title}
                              </span>
                              <span className="shrink-0 tabular-nums font-medium">
                                {String(flipSheet.pageIndex + 1).padStart(2, '0')} /{' '}
                                {String(filteredMemories.length).padStart(2, '0')}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* BACK FACE OF THE FLIPPING SHEET (VISIBLE PAST -90DEG AS IT TURNS!) */}
                      <div
                        style={{
                          transform: 'rotateY(180deg)',
                          backfaceVisibility: 'hidden',
                        }}
                        className="absolute inset-0 rounded-xl overflow-hidden border border-[#d8c3a4]"
                      >
                        {flipSheet.kind === 'frontCover' || flipSheet.kind === 'endCover' ? (
                          <div
                            style={{
                              backgroundImage:
                                'linear-gradient(135deg, #3f0614 0%, #2a030c 60%, #1c0107 100%)',
                            }}
                            className="w-full h-full flex items-center justify-center p-8"
                          >
                            <div className="w-full h-full rounded-lg border border-amber-200/25 flex flex-col items-center justify-center text-center">
                              <Heart className="w-7 h-7 text-rose-400/60 fill-current mb-2" />
                              <p className="font-serif-cormorant italic text-lg text-amber-200/70">
                                For Tsi, With Love
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div
                            style={{
                              backgroundImage:
                                'linear-gradient(270deg, rgba(105,62,48,0.16) 0%, rgba(247,238,223,1) 12%, rgba(242,230,210,1) 100%)',
                            }}
                            className="w-full h-full flex items-center justify-center p-8"
                          >
                            <div className="w-full h-full rounded-lg border border-[#d8c3a4]/70 border-dashed flex flex-col items-center justify-center text-center">
                              <Heart className="w-6 h-6 text-rose-800/25 fill-current mb-2" />
                              <span className="font-serif-cormorant italic text-base text-[#7c4d3e]/45">
                                Memories With Tsi
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Below-Album Controls depending on Album State */}
          {albumState === 'frontCover' ? (
            <div className="text-center pt-1">
              <p className="text-xs text-rose-200/75 inline-flex items-center gap-1.5">
                <span>Tap &ldquo;Open Photo Album&rdquo; or swipe left on the cover to flip to Page 1</span>
                <ArrowRight className="w-3.5 h-3.5 text-amber-300" />
              </p>
            </div>
          ) : albumState === 'endCover' ? (
            <div className="text-center pt-1">
              <p className="text-xs text-rose-200/75">
                Photo album closed · Swipe right or tap &ldquo;Back to Last Photo&rdquo; to look again
              </p>
            </div>
          ) : (
            <>
              {/* Album Page Dots + Swipe / Page-Curl Direction Hint */}
              <div className="flex flex-col items-center gap-2 pt-0.5">
                {filteredMemories.length > 1 && (
                  <div
                    className="flex flex-wrap items-center justify-center gap-1.5 max-w-full px-2"
                    role="tablist"
                    aria-label="Album pages"
                  >
                    {(() => {
                      const total = filteredMemories.length;
                      const maxDots = 15;
                      let start = 0;
                      let end = total;
                      if (total > maxDots) {
                        const half = Math.floor(maxDots / 2);
                        start = Math.max(0, Math.min(total - maxDots, currentIndex - half));
                        end = start + maxDots;
                      }
                      return filteredMemories.slice(start, end).map((item, offset) => {
                        const idx = start + offset;
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
                      });
                    })()}
                  </div>
                )}

                <p className="text-[11px] text-rose-300/70 flex items-center gap-1.5">
                  {isLastSlide ? (
                    <>
                      <span>Final page · Swipe left or tap the curled corner to close the album</span>
                      <ArrowRight className="w-3 h-3 text-amber-300" />
                    </>
                  ) : (
                    <>
                      <span>Swipe left or tap the curled page corner to turn the page</span>
                      <ArrowRight className="w-3 h-3" />
                    </>
                  )}
                </p>
              </div>

              {/* Compact Filmstrip Thumbnail Bar */}
              <div
                ref={filmstripRef}
                className="relative overflow-x-auto py-2 px-1"
              >
                <div className="flex items-center justify-center gap-2.5 w-max min-w-full">
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
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover"
                          />
                        ) : item.thumbnailUrl ? (
                          <img
                            src={item.thumbnailUrl}
                            alt={item.title}
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            decoding="async"
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
    </div>
  );
};
