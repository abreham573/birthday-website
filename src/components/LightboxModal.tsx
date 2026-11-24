import React, { useEffect, useCallback, useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Loader2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { MemoryItem } from '../types';

interface LightboxModalProps {
  item: MemoryItem | null;
  items: MemoryItem[];
  isOwner?: boolean;
  onClose: () => void;
  onSelect: (item: MemoryItem) => void;
  onDelete?: (id: string) => Promise<void> | void;
  onResolveMedia?: (id: string) => Promise<string>;
}

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3] as const;

const ZOOM_CLASS_MAP: Record<number, string> = {
  0.5: 'max-h-[38vh] max-w-[55%] w-auto h-auto object-contain',
  0.75: 'max-h-[54vh] max-w-[78%] w-auto h-auto object-contain',
  1: 'max-h-full max-w-full w-auto h-auto object-contain',
  1.25: 'w-[125%] max-w-none h-auto',
  1.5: 'w-[150%] max-w-none h-auto',
  2: 'w-[200%] max-w-none h-auto',
  2.5: 'w-[250%] max-w-none h-auto',
  3: 'w-[300%] max-w-none h-auto',
};

export const LightboxModal: React.FC<LightboxModalProps> = ({
  item,
  items,
  isOwner = false,
  onClose,
  onSelect,
  onDelete,
  onResolveMedia,
}) => {
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [zoomIndex, setZoomIndex] = useState<number>(2); // 1.0 (100% Fit)
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const zoom = ZOOM_STEPS[zoomIndex] ?? 1;

  const currentIndex = item ? items.findIndex((i) => i.id === item.id) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < items.length - 1;

  const handlePrev = useCallback(() => {
    if (hasPrev) onSelect(items[currentIndex - 1]);
  }, [hasPrev, currentIndex, items, onSelect]);

  const handleNext = useCallback(() => {
    if (hasNext) onSelect(items[currentIndex + 1]);
  }, [hasNext, currentIndex, items, onSelect]);

  const handleZoomOut = useCallback(() => {
    setZoomIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoomIndex((prev) => Math.min(ZOOM_STEPS.length - 1, prev + 1));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoomIndex(2);
  }, []);

  // Reset zoom and delete error when switching between photos
  useEffect(() => {
    setZoomIndex(2);
    setDeleteError(null);
    setIsDeleting(false);
  }, [item?.id]);

  // Lazy-load chunked media only when opened
  useEffect(() => {
    if (!item || item.url || !item.isChunked || !onResolveMedia) {
      setLoadingMedia(false);
      setMediaError(null);
      return;
    }

    let cancelled = false;
    setLoadingMedia(true);
    setMediaError(null);

    onResolveMedia(item.id)
      .then((resolvedUrl) => {
        if (!cancelled && !resolvedUrl) {
          setMediaError('Video could not be loaded right now.');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.toLowerCase().includes('quota')) {
            setMediaError('Daily free database read limit reached. Please try again tomorrow or upgrade the Firebase plan.');
          } else {
            setMediaError('Could not load video right now.');
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMedia(false);
      });

    return () => {
      cancelled = true;
    };
  }, [item?.id, item?.url, item?.isChunked, onResolveMedia]);

  // Keyboard navigation hook called unconditionally
  useEffect(() => {
    if (!item) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === '+' || e.key === '=') handleZoomIn();
      if (e.key === '-') handleZoomOut();
      if (e.key === '0') handleResetZoom();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item, handlePrev, handleNext, handleZoomIn, handleZoomOut, handleResetZoom, onClose]);

  // Early return only after all hooks are declared
  if (!item) return null;

  const isPhotoReady =
    item.type === 'photo' && Boolean(item.url) && !loadingMedia && !mediaError;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 bg-black/90 backdrop-blur-xl animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-3 right-3 sm:top-4 sm:right-4 z-50 p-2.5 rounded-full bg-black/70 text-white/80 hover:text-white hover:bg-black/90 transition-colors cursor-pointer"
        aria-label="Close Lightbox"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Prev / Next arrows */}
      {hasPrev && (
        <button
          onClick={handlePrev}
          className="absolute left-2 sm:left-5 top-1/2 -translate-y-1/2 z-50 p-2.5 sm:p-3 rounded-full bg-black/65 text-white/90 hover:text-white hover:bg-rose-900/70 transition-colors cursor-pointer"
          aria-label="Previous Memory"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {hasNext && (
        <button
          onClick={handleNext}
          className="absolute right-2 sm:right-5 top-1/2 -translate-y-1/2 z-50 p-2.5 sm:p-3 rounded-full bg-black/65 text-white/90 hover:text-white hover:bg-rose-900/70 transition-colors cursor-pointer"
          aria-label="Next Memory"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Main Content Modal */}
      <div
        className={`relative w-full flex flex-col bg-[#1c0207] border border-rose-500/20 rounded-3xl overflow-hidden shadow-2xl transition-all ${
          isExpanded ? 'max-w-7xl h-[94vh]' : 'max-w-5xl max-h-[92vh]'
        }`}
      >
        {/* Photo Resize / Zoom Controls Bar */}
        {isPhotoReady && (
          <div className="flex items-center justify-between gap-2 px-4 pr-12 sm:pr-14 py-2.5 bg-[#140104]/95 border-b border-rose-500/15 text-xs text-rose-200">
            <span className="hidden sm:inline text-[11px] text-rose-300/70">
              Double-click photo or use controls to resize
            </span>
            <div className="flex items-center gap-1.5 sm:gap-2 mx-auto sm:mx-0">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoomIndex === 0}
                className="p-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900/70 text-rose-100 disabled:opacity-40 transition-colors cursor-pointer"
                title="Zoom Out"
                aria-label="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>

              <input
                type="range"
                min={0}
                max={ZOOM_STEPS.length - 1}
                step={1}
                value={zoomIndex}
                onChange={(e) => setZoomIndex(Number(e.target.value))}
                aria-label="Resize photo"
                className="w-24 sm:w-32 accent-rose-500 cursor-pointer"
              />

              <span className="min-w-[44px] text-center font-medium tabular-nums text-rose-100">
                {Math.round(zoom * 100)}%
              </span>

              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoomIndex === ZOOM_STEPS.length - 1}
                className="p-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900/70 text-rose-100 disabled:opacity-40 transition-colors cursor-pointer"
                title="Zoom In"
                aria-label="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>

              {zoomIndex !== 2 && (
                <button
                  type="button"
                  onClick={handleResetZoom}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-950/70 hover:bg-rose-900/70 text-rose-200 transition-colors cursor-pointer"
                  title="Fit to screen"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Fit</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsExpanded((prev) => !prev)}
                className="p-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900/70 text-rose-100 transition-colors cursor-pointer"
                title={isExpanded ? 'Restore window size' : 'Expand fullscreen'}
                aria-label={isExpanded ? 'Restore window size' : 'Expand fullscreen'}
              >
                {isExpanded ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Media Container */}
        <div
          className={`relative flex-1 bg-black/50 min-h-[280px] ${
            isExpanded ? 'h-full' : 'max-h-[68vh] sm:max-h-[72vh]'
          } ${
            zoom > 1 && isPhotoReady
              ? 'overflow-auto p-2'
              : 'flex items-center justify-center overflow-hidden p-2'
          }`}
        >
          {loadingMedia || (!item.url && item.isChunked && !mediaError) ? (
            <div className="flex flex-col items-center gap-3 p-8 text-rose-200/80">
              <Loader2 className="w-8 h-8 animate-spin text-rose-400" />
              <span className="text-xs">Loading memory...</span>
            </div>
          ) : mediaError || !item.url ? (
            <div className="p-8 text-center max-w-md">
              <p className="text-sm text-rose-200">
                {mediaError || 'This memory is unavailable right now.'}
              </p>
            </div>
          ) : item.type === 'photo' ? (
            <img
              src={item.url}
              alt={item.title}
              referrerPolicy="no-referrer"
              onDoubleClick={() => setZoomIndex((prev) => (prev === 2 ? 4 : 2))}
              className={`select-none transition-all duration-200 mx-auto ${
                ZOOM_CLASS_MAP[zoom] ?? ZOOM_CLASS_MAP[1]
              } ${zoom > 1 ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
            />
          ) : (
            <video
              src={item.url}
              controls
              autoPlay
              playsInline
              className="w-full h-full object-contain"
            />
          )}
        </div>

        {/* Caption & Metadata Info */}
        {!isExpanded && (
          <div className="p-4 sm:p-5 bg-gradient-to-t from-[#140104] to-[#1c0207] border-t border-rose-500/15">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs text-rose-300/70">
                <span>{item.date}</span>
                <span aria-hidden="true">·</span>
                <span className="text-rose-400 font-medium">{item.tag}</span>
                <span aria-hidden="true">·</span>
                <span>Memory {currentIndex + 1} of {items.length}</span>
              </div>

              {isOwner && onDelete && (
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={async () => {
                    setDeleteError(null);
                    setIsDeleting(true);
                    try {
                      await onDelete(item.id);
                      onClose();
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : String(err);
                      setDeleteError(
                        msg.toLowerCase().includes('quota')
                          ? 'Daily free database write limit reached. Cannot remove right now.'
                          : 'Could not remove this memory right now.'
                      );
                    } finally {
                      setIsDeleting(false);
                    }
                  }}
                  className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors p-1 cursor-pointer disabled:opacity-50"
                  title="Delete this memory"
                >
                  {isDeleting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  <span>{isDeleting ? 'Removing...' : 'Remove'}</span>
                </button>
              )}
            </div>

            {deleteError && (
              <p className="text-xs text-red-300 bg-red-950/60 border border-red-500/30 rounded-lg px-3 py-1.5 mt-2">
                {deleteError}
              </p>
            )}

            <h3 className="font-serif-cormorant text-xl sm:text-2xl font-bold text-white mt-1.5">
              {item.title}
            </h3>

            <p className="text-xs sm:text-sm text-rose-200/90 mt-1.5 leading-relaxed font-light">
              {item.caption}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
