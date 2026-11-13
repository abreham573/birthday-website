import React, { useEffect, useCallback, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Trash2, Loader2 } from 'lucide-react';
import { MemoryItem } from '../types';

interface LightboxModalProps {
  item: MemoryItem | null;
  items: MemoryItem[];
  isOwner?: boolean;
  onClose: () => void;
  onSelect: (item: MemoryItem) => void;
  onDelete?: (id: string) => void;
  onResolveMedia?: (id: string) => Promise<string>;
}

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

  const currentIndex = item ? items.findIndex((i) => i.id === item.id) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < items.length - 1;

  const handlePrev = useCallback(() => {
    if (hasPrev) onSelect(items[currentIndex - 1]);
  }, [hasPrev, currentIndex, items, onSelect]);

  const handleNext = useCallback(() => {
    if (hasNext) onSelect(items[currentIndex + 1]);
  }, [hasNext, currentIndex, items, onSelect]);

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
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item, handlePrev, handleNext, onClose]);

  // Early return only after all hooks are declared
  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-xl animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-50 p-2.5 rounded-full bg-black/60 text-white/80 hover:text-white hover:bg-black/90 transition-colors"
        aria-label="Close Lightbox"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Prev / Next arrows */}
      {hasPrev && (
        <button
          onClick={handlePrev}
          className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 z-50 p-3 rounded-full bg-black/60 text-white/90 hover:text-white hover:bg-rose-900/60 transition-colors"
          aria-label="Previous Memory"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {hasNext && (
        <button
          onClick={handleNext}
          className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 z-50 p-3 rounded-full bg-black/60 text-white/90 hover:text-white hover:bg-rose-900/60 transition-colors"
          aria-label="Next Memory"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Main Content Modal */}
      <div className="relative max-w-4xl w-full max-h-[92vh] flex flex-col bg-[#1c0207] border border-rose-500/20 rounded-3xl overflow-hidden shadow-2xl">
        {/* Media Container */}
        <div className="relative flex-1 bg-black/40 flex items-center justify-center min-h-[300px] max-h-[60vh] sm:max-h-[65vh] overflow-hidden">
          {loadingMedia ? (
            <div className="flex flex-col items-center gap-3 p-8 text-rose-200/80">
              <Loader2 className="w-8 h-8 animate-spin text-rose-400" />
              <span className="text-xs">Loading memory...</span>
            </div>
          ) : mediaError ? (
            <div className="p-8 text-center max-w-md">
              <p className="text-sm text-rose-200">{mediaError}</p>
            </div>
          ) : item.type === 'photo' ? (
            <img
              src={item.url}
              alt={item.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain select-none"
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
        <div className="p-4 sm:p-6 bg-gradient-to-t from-[#140104] to-[#1c0207] border-t border-rose-500/15">
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
                onClick={() => {
                  onDelete(item.id);
                  onClose();
                }}
                className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors p-1 cursor-pointer"
                title="Delete this memory"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            )}
          </div>

          <h3 className="font-serif-cormorant text-xl sm:text-2xl font-bold text-white mt-1.5">
            {item.title}
          </h3>

          <p className="text-xs sm:text-sm text-rose-200/90 mt-2 leading-relaxed font-light">
            {item.caption}
          </p>
        </div>
      </div>
    </div>
  );
};
