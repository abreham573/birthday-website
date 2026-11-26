import React, { useState, useEffect, useRef } from 'react';
import {
  ExternalLink,
  Heart,
  Sparkles,
  Youtube,
  Camera,
  Edit3,
  Check,
  Loader2,
  Lock,
  Upload,
  ImagePlus,
  RotateCcw,
  X,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import austinCover from '../assets/images/austin_mahone_cover_1794420838531.jpg';
import { MemoryItem, SongConfig } from '../types';
import {
  DEFAULT_SONG_CONFIG,
  compressImageFileToDataUrl,
  getReadableFirestoreErrorMessage,
} from '../lib/memoriesService';

interface SongPageProps {
  songConfig?: SongConfig;
  albumPhotos?: MemoryItem[];
  isOwner?: boolean;
  onSignInOwner?: () => Promise<void>;
  onUpdateSong?: (updated: SongConfig) => Promise<void>;
  onNavigateToMemories: () => void;
  onNavigateToLetter: () => void;
}

export const SongPage: React.FC<SongPageProps> = ({
  songConfig = DEFAULT_SONG_CONFIG,
  albumPhotos = [],
  isOwner = false,
  onSignInOwner,
  onUpdateSong,
  onNavigateToMemories,
  onNavigateToLetter,
}) => {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [draft, setDraft] = useState<SongConfig>(songConfig);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [isPhotoPickerOpen, setIsPhotoPickerOpen] = useState<boolean>(false);
  const [isUpdatingPhoto, setIsUpdatingPhoto] = useState<boolean>(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isEditing) {
      setDraft(songConfig);
    }
  }, [songConfig, isEditing]);

  const activeCoverPhoto = songConfig.coverPhotoUrl?.trim() || '';
  const hasCustomPhoto = Boolean(activeCoverPhoto);

  const convertUrlToSafeDataUrl = async (url: string): Promise<string> => {
    if (!url.startsWith('blob:') && url.length <= 900000) {
      return url;
    }
    const response = await fetch(url);
    const blob = await response.blob();
    const file = new File([blob], 'song-cover.jpg', {
      type: blob.type || 'image/jpeg',
    });
    return compressImageFileToDataUrl(file);
  };

  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setPhotoError(null);
    if (!file.type.startsWith('image/')) {
      setPhotoError('Please choose an image file (JPG, PNG, or WEBP).');
      return;
    }

    setIsUpdatingPhoto(true);
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      if (isEditing) {
        setDraft((prev) => ({ ...prev, coverPhotoUrl: dataUrl }));
      } else if (isOwner && onUpdateSong) {
        await onUpdateSong({ ...songConfig, coverPhotoUrl: dataUrl });
        setDraft((prev) => ({ ...prev, coverPhotoUrl: dataUrl }));
        setIsPhotoPickerOpen(false);
      }
    } catch (err) {
      setPhotoError(
        getReadableFirestoreErrorMessage(
          err,
          'Could not save this photo right now.'
        )
      );
    } finally {
      setIsUpdatingPhoto(false);
    }
  };

  const handleSelectAlbumPhoto = async (photo: MemoryItem) => {
    if (!photo.url) return;
    setPhotoError(null);
    setIsUpdatingPhoto(true);
    try {
      const safePhotoUrl = await convertUrlToSafeDataUrl(photo.url);
      if (isEditing) {
        setDraft((prev) => ({ ...prev, coverPhotoUrl: safePhotoUrl }));
      } else if (isOwner && onUpdateSong) {
        await onUpdateSong({ ...songConfig, coverPhotoUrl: safePhotoUrl });
        setDraft((prev) => ({ ...prev, coverPhotoUrl: safePhotoUrl }));
        setIsPhotoPickerOpen(false);
      }
    } catch (err) {
      setPhotoError(
        getReadableFirestoreErrorMessage(
          err,
          'Could not use that album photo right now.'
        )
      );
    } finally {
      setIsUpdatingPhoto(false);
    }
  };

  const handleResetPhoto = async () => {
    setPhotoError(null);
    if (isEditing) {
      setDraft((prev) => ({ ...prev, coverPhotoUrl: '' }));
      return;
    }
    if (!isOwner || !onUpdateSong) return;
    setIsUpdatingPhoto(true);
    try {
      await onUpdateSong({ ...songConfig, coverPhotoUrl: '' });
      setDraft((prev) => ({ ...prev, coverPhotoUrl: '' }));
      setIsPhotoPickerOpen(false);
    } catch (err) {
      setPhotoError(
        getReadableFirestoreErrorMessage(
          err,
          'Could not reset the photo right now.'
        )
      );
    } finally {
      setIsUpdatingPhoto(false);
    }
  };

  const triggerCelebration = () => {
    confetti({
      particleCount: 80,
      spread: 100,
      origin: { y: 0.6 },
      colors: ['#e11d48', '#fb7185', '#ffd700', '#ffffff', '#fda4af'],
    });
  };

  const parsedLyrics = songConfig.lyricsText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      if (line.startsWith('*')) {
        return {
          type: 'chorus' as const,
          text: line.slice(1).trim(),
        };
      }
      return {
        type: 'verse' as const,
        text: line,
      };
    });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);

    if (!isOwner || !onUpdateSong) {
      setSaveError(
        'Please sign in with your creator Google account to save lyrics & meaning changes.'
      );
      return;
    }

    setIsSaving(true);
    try {
      await onUpdateSong(draft);
      setIsEditing(false);
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(
        getReadableFirestoreErrorMessage(
          err,
          'Could not save lyrics & meaning right now.'
        )
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] pb-8 md:pb-16 pt-4 sm:pt-8 max-w-5xl mx-auto px-4 sm:px-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handlePhotoFileChange}
        className="hidden"
      />

      {/* Chapter 03 Header */}
      <section className="text-center max-w-3xl mx-auto mb-8 sm:mb-12">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-950/60 border border-rose-500/25 text-rose-300 text-xs font-medium mb-3 backdrop-blur-md">
          <Youtube className="w-3.5 h-3.5 text-red-500" />
          <span>Chapter 03 · Dedicated Song</span>
          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
        </div>

        <h1 className="font-serif-cormorant text-3xl sm:text-5xl font-bold text-white tracking-tight leading-tight">
          {songConfig.songTitle} ·{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-300 via-rose-100 to-amber-200">
            {songConfig.artistName}
          </span>
        </h1>

        <p className="mt-3 text-sm sm:text-base text-rose-200/80 max-w-xl mx-auto font-light leading-relaxed">
          This song was chosen especially for your birthday, Tsi. Read what is written for you below first, then open it on YouTube at the bottom.
        </p>

        {isOwner && onUpdateSong && (
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => {
                setSaveError(null);
                setSaveSuccess(false);
                if (isEditing) {
                  setDraft(songConfig);
                  setIsEditing(false);
                } else {
                  setDraft(songConfig);
                  setIsEditing(true);
                }
              }}
              className="inline-flex items-center gap-1.5 text-xs text-rose-200 hover:text-white bg-rose-950/70 hover:bg-rose-900/70 px-4 py-2 rounded-xl border border-rose-500/30 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isEditing ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Done Editing</span>
                </>
              ) : (
                <>
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Lyrics &amp; Meaning</span>
                </>
              )}
            </button>
          </div>
        )}
      </section>

      {/* Creator Editor or Written Dedication & Lyrics First */}
      <div className="max-w-3xl mx-auto space-y-6 mb-10">
        {isEditing ? (
          <form
            onSubmit={handleSave}
            className="romantic-card rounded-3xl p-6 sm:p-8 space-y-5 border border-rose-500/30"
          >
            <div className="flex items-center justify-between border-b border-rose-500/15 pb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-rose-300">
                Edit Song, Lyrics &amp; Meaning
              </span>
              <span className="text-[11px] text-rose-300/60">
                Saves to cloud for Tsi
              </span>
            </div>

            {!isOwner && (
              <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-rose-200">
                  <Lock className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>
                    Sign in with your creator Google account to save changes.
                  </span>
                </div>
                {onSignInOwner && (
                  <button
                    type="button"
                    onClick={() =>
                      onSignInOwner().catch((err) =>
                        setSaveError(
                          getReadableFirestoreErrorMessage(err, 'Sign-in failed.')
                        )
                      )
                    }
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Sign In with Google
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-rose-200/90 uppercase tracking-wider mb-1">
                  Song Title
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={draft.songTitle}
                  onChange={(e) => setDraft({ ...draft, songTitle: e.target.value })}
                  className="w-full bg-black/45 border border-rose-500/30 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-rose-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-rose-200/90 uppercase tracking-wider mb-1">
                  Artist
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={draft.artistName}
                  onChange={(e) => setDraft({ ...draft, artistName: e.target.value })}
                  className="w-full bg-black/45 border border-rose-500/30 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-rose-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-rose-200/90 uppercase tracking-wider mb-1">
                Dedication Heading
              </label>
              <input
                type="text"
                required
                maxLength={160}
                value={draft.dedicationHeading}
                onChange={(e) =>
                  setDraft({ ...draft, dedicationHeading: e.target.value })
                }
                className="w-full bg-black/45 border border-rose-500/30 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-rose-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-rose-200/90 uppercase tracking-wider mb-1">
                Why This Song Is Dedicated To You
              </label>
              <textarea
                rows={4}
                required
                maxLength={2000}
                value={draft.dedicationBody}
                onChange={(e) =>
                  setDraft({ ...draft, dedicationBody: e.target.value })
                }
                className="w-full bg-black/45 border border-rose-500/30 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-rose-400 leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-rose-200/90 uppercase tracking-wider mb-1">
                Song Lyrics
              </label>
              <textarea
                rows={9}
                required
                maxLength={4000}
                value={draft.lyricsText}
                onChange={(e) => setDraft({ ...draft, lyricsText: e.target.value })}
                placeholder="Write each lyric line on a new line..."
                className="w-full bg-black/45 border border-rose-500/30 rounded-xl p-3 text-base text-white font-serif-cormorant focus:outline-none focus:border-rose-400 leading-relaxed"
              />
              <p className="mt-1 text-[11px] text-rose-300/70">
                Tip: Start a line with <span className="font-mono text-rose-200">*</span> to highlight it as a bold chorus line.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-rose-200/90 uppercase tracking-wider mb-1">
                Meaning Behind These Lyrics (Optional)
              </label>
              <textarea
                rows={4}
                maxLength={2000}
                value={draft.meaning}
                onChange={(e) => setDraft({ ...draft, meaning: e.target.value })}
                placeholder="Write what these lyrics mean to you and Tsi..."
                className="w-full bg-black/45 border border-rose-500/30 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-rose-400 leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-rose-200/90 uppercase tracking-wider mb-1">
                YouTube Link
              </label>
              <input
                type="url"
                required
                maxLength={500}
                value={draft.youtubeUrl}
                onChange={(e) => setDraft({ ...draft, youtubeUrl: e.target.value })}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full bg-black/45 border border-rose-500/30 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-rose-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-rose-200/90 uppercase tracking-wider mb-2">
                Photo Above YouTube Link (Optional)
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <img
                  src={draft.coverPhotoUrl?.trim() || austinCover}
                  alt="Song cover preview"
                  className="w-16 h-16 rounded-xl object-cover border border-rose-500/30"
                />
                <button
                  type="button"
                  disabled={isUpdatingPhoto}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-950/70 hover:bg-rose-900/70 border border-rose-500/30 text-xs font-medium text-rose-100 cursor-pointer disabled:opacity-50"
                >
                  {isUpdatingPhoto ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  <span>Upload Photo</span>
                </button>
                {draft.coverPhotoUrl?.trim() && (
                  <button
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, coverPhotoUrl: '' }))}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-black/40 hover:bg-black/60 border border-rose-500/20 text-xs text-rose-300 hover:text-white cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset to Default</span>
                  </button>
                )}
              </div>
            </div>

            {saveError && (
              <p className="text-xs text-red-300 bg-red-950/60 border border-red-500/35 rounded-xl p-3">
                {saveError}
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => {
                  setDraft(songConfig);
                  setSaveError(null);
                  setIsEditing(false);
                }}
                className="px-4 py-2 text-xs font-medium text-rose-300 hover:text-white rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 rounded-xl shadow-lg transition-all cursor-pointer disabled:opacity-60"
              >
                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>{isSaving ? 'Saving...' : 'Save Lyrics & Meaning'}</span>
              </button>
            </div>
          </form>
        ) : (
          <>
            {saveSuccess && (
              <div className="rounded-2xl bg-emerald-950/60 border border-emerald-500/35 px-4 py-2.5 text-xs text-emerald-200 flex items-center justify-between">
                <span>Lyrics &amp; meaning saved! Tsi will see your updated words.</span>
                <button
                  type="button"
                  onClick={() => setSaveSuccess(false)}
                  className="text-emerald-300/80 hover:text-white underline cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Dedication Note Card */}
            <div className="romantic-card rounded-3xl p-6 sm:p-8">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 text-rose-400">
                  <Heart className="w-4 h-4 fill-current" />
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    Why This Song Is Dedicated To You
                  </span>
                </div>
                {isOwner && onUpdateSong && (
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(songConfig);
                      setSaveError(null);
                      setIsEditing(true);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] text-rose-300/80 hover:text-white transition-colors cursor-pointer"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Edit</span>
                  </button>
                )}
              </div>
              <h3 className="font-serif-cormorant text-xl sm:text-2xl font-bold text-white">
                {songConfig.dedicationHeading}
              </h3>
              <p className="text-xs sm:text-sm text-rose-200/90 mt-2 leading-relaxed font-light whitespace-pre-line">
                {songConfig.dedicationBody}
              </p>
            </div>

            {/* Romantic Lyrics & Meaning Card */}
            <div className="romantic-card rounded-3xl p-6 sm:p-8">
              <div className="flex items-center justify-between gap-2 mb-4 border-b border-rose-500/15 pb-3">
                <span className="text-xs font-semibold text-rose-300 uppercase tracking-wider">
                  Lyrics &amp; Meaning
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-rose-400/80">
                    {songConfig.artistName} · {songConfig.songTitle}
                  </span>
                  {isOwner && onUpdateSong && (
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(songConfig);
                        setSaveError(null);
                        setIsEditing(true);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] text-amber-200/90 hover:text-white transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-3 font-serif-cormorant text-lg sm:text-xl">
                {parsedLyrics.map((line, index) => (
                  <p
                    key={index}
                    className={`transition-all duration-300 ${
                      line.type === 'chorus'
                        ? 'text-white font-bold italic text-xl sm:text-2xl pl-3.5 border-l-2 border-rose-400'
                        : 'text-rose-100/95 font-medium'
                    }`}
                  >
                    &ldquo;{line.text}&rdquo;
                  </p>
                ))}
              </div>

              {songConfig.meaning.trim().length > 0 && (
                <div className="mt-6 pt-5 border-t border-rose-500/15">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-200/85 mb-1.5">
                    What These Words Mean To Us
                  </p>
                  <p className="text-xs sm:text-sm text-rose-100/90 leading-relaxed font-light whitespace-pre-line">
                    {songConfig.meaning}
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Dedicated Song Photo + Single YouTube Link Section at the Bottom */}
        <div className="romantic-card rounded-3xl p-6 sm:p-8 flex flex-col items-center text-center gap-5">
          {/* Photo Above the YouTube Link (Acoustic Melody Cover or Custom Photo) */}
          <div className="relative flex flex-col items-center gap-3">
            <div className="relative w-48 h-48 sm:w-56 sm:h-56 rounded-3xl shadow-2xl border-2 border-rose-500/35 overflow-hidden bg-black/40">
              <img
                src={activeCoverPhoto || austinCover}
                alt={`${songConfig.artistName} - ${songConfig.songTitle} cover photo`}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              {isUpdatingPhoto && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                  <Loader2 className="w-7 h-7 animate-spin text-rose-300" />
                </div>
              )}
            </div>

            {isOwner && onUpdateSong && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={isUpdatingPhoto}
                  onClick={() => setIsPhotoPickerOpen((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-950/75 hover:bg-rose-900/75 border border-rose-500/30 text-xs font-semibold text-rose-100 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <ImagePlus className="w-3.5 h-3.5 text-rose-300" />
                  <span>{hasCustomPhoto ? 'Change Photo' : 'Add Photo'}</span>
                </button>

                {hasCustomPhoto && (
                  <button
                    type="button"
                    disabled={isUpdatingPhoto}
                    onClick={() => void handleResetPhoto()}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-black/40 hover:bg-black/60 border border-rose-500/20 text-xs text-rose-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            )}

            {isOwner && isPhotoPickerOpen && (
              <div className="w-full max-w-md rounded-2xl bg-[#1a0308]/95 border border-rose-500/30 p-4 text-left space-y-3 shadow-2xl">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-rose-200">
                    Choose Photo Above YouTube Link
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsPhotoPickerOpen(false)}
                    className="p-1 rounded-lg text-rose-300/75 hover:text-white hover:bg-rose-950/70 cursor-pointer"
                    aria-label="Close photo picker"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  disabled={isUpdatingPhoto}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-xs font-semibold text-white shadow-lg transition-all cursor-pointer disabled:opacity-60"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Photo from Device</span>
                </button>

                {albumPhotos.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <p className="text-[11px] text-rose-300/80 font-medium">
                      Or select a photo from Tsi&apos;s album:
                    </p>
                    <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto pr-1">
                      {albumPhotos.map((photo) => (
                        <button
                          key={photo.id}
                          type="button"
                          disabled={isUpdatingPhoto}
                          onClick={() => void handleSelectAlbumPhoto(photo)}
                          className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all cursor-pointer disabled:opacity-50 ${
                            activeCoverPhoto === photo.url
                              ? 'border-amber-300 ring-2 ring-amber-300/40'
                              : 'border-rose-500/25 hover:border-rose-400'
                          }`}
                          title={photo.caption || photo.title}
                        >
                          <img
                            src={photo.url}
                            alt={photo.caption || photo.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {photoError && (
                  <p className="text-xs text-red-300 bg-red-950/60 border border-red-500/35 rounded-xl p-2.5">
                    {photoError}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="w-full max-w-xl text-center">
            <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-widest block mb-1">
              {songConfig.artistName} · Official Music
            </span>
            <h3 className="font-serif-cormorant text-2xl sm:text-3xl font-bold text-white">
              {songConfig.songTitle}
            </h3>
            <p className="text-xs sm:text-sm text-rose-200/80 mt-1 mb-5">
              Now that you&apos;ve read every word, tap below to listen on YouTube.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <a
                href={songConfig.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 px-6 py-3.5 text-sm sm:text-base font-bold text-white bg-gradient-to-r from-red-600 via-rose-600 to-red-700 rounded-2xl hover:from-red-500 hover:to-rose-500 shadow-2xl shadow-red-950/70 hover:scale-105 active:scale-95 transition-all group border border-rose-400/30"
              >
                <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors">
                  <Youtube className="w-4 h-4 fill-current text-white" />
                </div>
                <span>Open &amp; Listen on YouTube</span>
                <ExternalLink className="w-4 h-4 opacity-90" />
              </a>

              <button
                type="button"
                onClick={triggerCelebration}
                className="inline-flex items-center gap-2 px-5 py-3.5 text-xs sm:text-sm font-semibold text-rose-200 bg-rose-950/60 border border-rose-500/30 rounded-2xl hover:bg-rose-900/40 hover:text-white transition-colors cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Celebrate Tsi&apos;s Birthday 🎂</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Buttons: Jump back to Chapter 01 or 02 */}
      <section className="pt-8 border-t border-rose-500/20">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={onNavigateToMemories}
            className="romantic-card rounded-2xl p-5 flex items-center gap-4 text-left group hover:border-rose-400/40 transition-all cursor-pointer"
          >
            <div className="w-12 h-12 rounded-xl bg-rose-950/70 border border-rose-500/30 flex items-center justify-center text-rose-300 group-hover:scale-105 transition-transform shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-rose-400 uppercase tracking-widest font-semibold block">
                Chapter 01
              </span>
              <span className="text-sm sm:text-base font-serif-cormorant font-bold text-white group-hover:text-rose-200 transition-colors">
                ← View Photos &amp; Videos
              </span>
            </div>
          </button>

          <button
            onClick={onNavigateToLetter}
            className="romantic-card rounded-2xl p-5 flex items-center gap-4 text-left group hover:border-rose-400/40 transition-all cursor-pointer"
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
