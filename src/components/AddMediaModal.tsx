import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Upload,
  Link,
  Camera,
  Video,
  Trash2,
  CheckCircle2,
  Loader2,
  Sparkles,
  Lock,
  LogOut,
  Database,
  RefreshCw,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { MemoryItem } from '../types';
import {
  uploadMemoryFileToFirestore,
  saveMemoryUrlToFirestore,
  isQuotaExceededError,
  getReadableFirestoreErrorMessage,
} from '../lib/memoriesService';
import {
  DbStatus,
  migrateFirebaseToPostgres,
  MigrationResult,
} from '../lib/postgresService';
import { isFirestoreQuotaLocked, OWNER_EMAIL } from '../lib/firebase';
import { EmojiQuickPicker, insertTextAtCursor } from './EmojiQuickPicker';

interface AddMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (item: MemoryItem) => void;
  onAddMultiple?: (items: MemoryItem[]) => void;
  onQuotaExceeded?: () => void;
  dbStatus?: DbStatus | null;
  onMigrationComplete?: () => Promise<void> | void;
  onRefreshDbStatus?: () => Promise<DbStatus>;
  user: User | null;
  isOwner: boolean;
  onSignInOwner: () => Promise<void>;
  onSignOutOwner: () => Promise<void>;
}

interface SelectedMediaFile {
  id: string;
  file: File;
  previewUrl: string;
}

export const AddMediaModal: React.FC<AddMediaModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  onAddMultiple,
  onQuotaExceeded,
  dbStatus,
  onMigrationComplete,
  onRefreshDbStatus,
  user,
  isOwner,
  onSignInOwner,
  onSignOutOwner,
}) => {
  const [mediaType, setMediaType] = useState<'photo' | 'video'>('photo');
  const [sourceMode, setSourceMode] = useState<'upload' | 'url'>('upload');
  const [urlInput, setUrlInput] = useState('');
  const [selectedItems, setSelectedItems] = useState<SelectedMediaFile[]>([]);
  const [caption, setCaption] = useState('');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isMigrating, setIsMigrating] = useState<boolean>(false);
  const [migrationStatus, setMigrationStatus] = useState<string>('');
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [migrationError, setMigrationError] = useState<string | null>(null);

  const selectedItemsRef = useRef<SelectedMediaFile[]>(selectedItems);
  const captionTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  selectedItemsRef.current = selectedItems;

  useEffect(() => {
    return () => {
      selectedItemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  const clearSelectedItems = () => {
    setSelectedItems((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
  };

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setError(null);
    setAuthLoading(true);
    try {
      await onSignInOwner();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not complete Google sign-in. Please try again.'
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    const nextItems: SelectedMediaFile[] = [];

    for (const file of fileList) {
      const isImageFile =
        file.type.startsWith('image/') ||
        (!file.type && /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(file.name));
      const isVideoFile =
        file.type.startsWith('video/') ||
        ((!file.type || file.type === 'application/octet-stream') &&
          /\.(mp4|mov|webm|m4v|3gp|mkv)$/i.test(file.name));

      if (mediaType === 'photo' && !isImageFile) {
        setError('Please select image files (JPG, PNG, WebP, GIF).');
        continue;
      }
      if (mediaType === 'video' && !isVideoFile) {
        setError('Please select video files (MP4, WebM, MOV).');
        continue;
      }
      nextItems.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    // Reset input so re-selecting the same file after removing it still fires onChange
    e.target.value = '';

    if (nextItems.length === 0) return;
    setSelectedItems((prev) => [...prev, ...nextItems]);
  };

  const handleRemovePreview = (index: number) => {
    setSelectedItems((prev) => {
      const target = prev[index];
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const commitUploadedItems = (uploadedItems: MemoryItem[]) => {
    if (uploadedItems.length === 1) {
      onAdd(uploadedItems[0]);
    } else if (uploadedItems.length > 1) {
      if (onAddMultiple) {
        onAddMultiple(uploadedItems);
      } else {
        uploadedItems.forEach((it) => onAdd(it));
      }
    }
  };

  const isPostgresReady = Boolean(dbStatus?.configured && dbStatus?.connected);

  const handleRunMigration = async () => {
    setMigrationError(null);
    setMigrationResult(null);
    setIsMigrating(true);
    setMigrationStatus('Preparing transfer from Firebase...');
    try {
      const res = await migrateFirebaseToPostgres((msg) => setMigrationStatus(msg));
      setMigrationResult(res);
      await onMigrationComplete?.();
    } catch (err) {
      setMigrationError(
        err instanceof Error ? err.message : 'Transfer could not complete right now.'
      );
    } finally {
      setIsMigrating(false);
      setMigrationStatus('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user || !isOwner) {
      setError('Please sign in with the owner Google account first.');
      return;
    }

    const activeStatus =
      dbStatus?.configured && dbStatus?.connected
        ? dbStatus
        : onRefreshDbStatus
          ? await onRefreshDbStatus()
          : dbStatus;
    const pgReady = Boolean(activeStatus?.configured && activeStatus?.connected);

    if (!pgReady && isFirestoreQuotaLocked()) {
      onQuotaExceeded?.();
      setError(
        'PostgreSQL DATABASE_URL is not connected yet, and Firebase free daily quota is full. Add DATABASE_URL in Settings -> Secrets to upload without limits.'
      );
      return;
    }

    if (sourceMode === 'upload') {
      if (selectedItems.length === 0) {
        setError('Please select at least one photo or video of Tsi.');
        return;
      }

      setIsUploading(true);
      const uploadedItems: MemoryItem[] = [];
      let uploadedCount = 0;

      try {
        for (let i = 0; i < selectedItems.length; i++) {
          const { file } = selectedItems[i];
          setUploadStatus(
            `Saving ${i + 1} of ${selectedItems.length} to cloud...`
          );

          const savedItem = await uploadMemoryFileToFirestore({
            file,
            mediaType,
            title: 'Tsi',
            caption: caption.trim(),
            date: '',
            tag: '',
            authorId: user.uid,
            onProgress: (pct) => {
              setUploadStatus(
                `Saving ${i + 1} of ${selectedItems.length} to cloud (${pct}%)...`
              );
            },
          });

          uploadedItems.push(savedItem);
          uploadedCount++;
        }

        commitUploadedItems(uploadedItems);
        handleReset();
        onClose();
      } catch (uploadErr) {
        if (
          !isQuotaExceededError(uploadErr) &&
          !(uploadErr instanceof Error && uploadErr.message.trim().startsWith('{'))
        ) {
          console.error('Cloud upload error:', uploadErr);
        }
        if (uploadedCount > 0) {
          commitUploadedItems(uploadedItems);
          setSelectedItems((prev) => {
            prev.slice(0, uploadedCount).forEach((item) => URL.revokeObjectURL(item.previewUrl));
            return prev.slice(uploadedCount);
          });
        }
        if (isQuotaExceededError(uploadErr)) {
          onQuotaExceeded?.();
        }
        setError(
          getReadableFirestoreErrorMessage(
            uploadErr,
            'Failed to save to cloud. Please try again.'
          )
        );
      } finally {
        setIsUploading(false);
        setUploadStatus('');
      }
    } else {
      // URL mode
      if (!urlInput.trim()) {
        setError('Please enter a valid media link.');
        return;
      }

      setIsUploading(true);
      setUploadStatus('Saving link to cloud...');

      try {
        const savedItem = await saveMemoryUrlToFirestore({
          url: urlInput.trim(),
          mediaType,
          title: 'Tsi',
          caption: caption.trim(),
          date: '',
          tag: '',
          authorId: user.uid,
        });

        onAdd(savedItem);
        handleReset();
        onClose();
      } catch (err) {
        if (isQuotaExceededError(err)) {
          onQuotaExceeded?.();
        }
        setError(
          getReadableFirestoreErrorMessage(
            err,
            'Could not save link. Please try again.'
          )
        );
      } finally {
        setIsUploading(false);
        setUploadStatus('');
      }
    }
  };

  const handleReset = () => {
    setUrlInput('');
    clearSelectedItems();
    setCaption('');
    setError(null);
    setIsUploading(false);
    setUploadStatus('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="relative w-full max-w-lg bg-[#220309] border border-rose-500/30 rounded-3xl p-6 shadow-2xl text-rose-50 max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isUploading}
          className="absolute top-5 right-5 p-2 rounded-full text-rose-300/70 hover:text-white hover:bg-rose-900/40 transition-colors disabled:opacity-50"
          aria-label="Close Modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="mb-6 pr-8">
          <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Permanent Cloud Gallery</span>
          </span>
          <h2
            id="modal-title"
            className="font-serif-cormorant text-2xl sm:text-3xl font-bold text-white mt-1"
          >
            Add Photos & Videos of Tsi
          </h2>
          <p className="text-xs text-rose-300/80 mt-1 leading-relaxed">
            Everything you upload here is saved in the cloud so Tsi sees it automatically on her phone when she opens your link.
          </p>
        </div>

        {/* Owner Authentication Gate */}
        {!isOwner ? (
          <div className="space-y-4 bg-rose-950/40 border border-rose-500/25 rounded-2xl p-5 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-rose-900/60 border border-rose-400/30 flex items-center justify-center text-rose-200">
              <Lock className="w-5 h-5" />
            </div>

            {user && !isOwner ? (
              <>
                <h3 className="font-serif-cormorant text-xl font-bold text-white">
                  Signed in as {user.email}
                </h3>
                <p className="text-xs text-rose-200/80 leading-relaxed">
                  Only the gift creator ({OWNER_EMAIL}) can add or delete photos and videos so nobody else with the link can change Tsi's surprise.
                </p>
                <button
                  type="button"
                  onClick={onSignOutOwner}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-600 rounded-xl transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Switch Google Account</span>
                </button>
              </>
            ) : (
              <>
                <h3 className="font-serif-cormorant text-xl font-bold text-white">
                  Sign In to Upload Photos
                </h3>
                <p className="text-xs text-rose-200/80 leading-relaxed">
                  Sign in with your Google account ({OWNER_EMAIL}) so only you can upload and manage Tsi's gallery. Tsi will still view everything without signing in.
                </p>
                <button
                  type="button"
                  disabled={authLoading}
                  onClick={handleGoogleSignIn}
                  className="w-full py-3 px-5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-sm font-semibold shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {authLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <span>Continue with Google</span>
                  )}
                </button>
              </>
            )}

            {error && (
              <p className="text-xs text-red-300 bg-red-950/60 border border-red-500/30 rounded-lg p-2.5">
                {error}
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Signed-in Owner Banner */}
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-rose-950/50 border border-rose-500/20 text-[11px] text-rose-300/80">
              <span>Signed in as {user?.email}</span>
              <button
                type="button"
                onClick={onSignOutOwner}
                className="text-rose-400 hover:text-white underline cursor-pointer"
              >
                Sign out
              </button>
            </div>

            {/* PostgreSQL Database Status & Firebase Transfer Tool */}
            <div className="rounded-2xl bg-black/35 border border-rose-500/25 p-3.5 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold text-rose-100">
                  <Database className="w-4 h-4 text-rose-300 shrink-0" />
                  <span>
                    {isPostgresReady
                      ? 'PostgreSQL Database Connected'
                      : 'Connect Free PostgreSQL (Supabase / Neon)'}
                  </span>
                </div>
                {onRefreshDbStatus && (
                  <button
                    type="button"
                    disabled={isMigrating}
                    onClick={() => void onRefreshDbStatus()}
                    className="inline-flex items-center gap-1 text-[11px] text-rose-300 hover:text-white cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Refresh</span>
                  </button>
                )}
              </div>

              {!isPostgresReady ? (
                <p className="text-[11px] text-rose-200/80 leading-relaxed">
                  {dbStatus?.configured && !dbStatus?.connected
                    ? `Could not connect yet: ${dbStatus.error || 'Check DATABASE_URL in Settings -> Secrets.'}`
                    : 'Add your Supabase or Neon PostgreSQL URL as DATABASE_URL in Settings -> Secrets, then click Refresh to transfer all photos, videos, letter & song from Firebase.'}
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-emerald-200/90">
                      Saved in Postgres: {dbStatus?.counts.memories ?? 0} photos/videos
                      {dbStatus?.counts.hasLetter ? ' · Letter ✓' : ''}
                      {dbStatus?.counts.hasSong ? ' · Song ✓' : ''}
                    </span>
                    <button
                      type="button"
                      disabled={isMigrating || isUploading}
                      onClick={() => void handleRunMigration()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/85 hover:bg-emerald-500 text-white text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-60"
                    >
                      {isMigrating ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Database className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {isMigrating ? 'Transferring...' : 'Transfer from Firebase'}
                      </span>
                    </button>
                  </div>

                  {migrationStatus && (
                    <p className="text-[11px] text-amber-200">{migrationStatus}</p>
                  )}

                  {migrationResult && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-emerald-200 bg-emerald-950/60 border border-emerald-500/30 rounded-lg p-2">
                        Transferred {migrationResult.memoriesTransferred} of{' '}
                        {migrationResult.memoriesTotalFound} photos/videos
                        {migrationResult.letterTransferred ? ', love letter' : ''}
                        {migrationResult.songTransferred ? ', our song' : ''}
                        {migrationResult.gateTransferred ? ', password gate' : ''}.
                        {migrationResult.skippedDueToQuota > 0
                          ? ` (${migrationResult.skippedDueToQuota} item(s) could not be read because Firebase's daily limit is still active.)`
                          : ''}
                      </p>
                      {migrationResult.firestoreBlockedByQuota && (
                        <p className="text-[11px] text-amber-200 bg-amber-950/60 border border-amber-500/35 rounded-lg p-2 leading-relaxed">
                          Firebase&apos;s free daily read quota is currently still maxed out, so Firebase blocked reading uncached photos/videos right now. Run Transfer from Firebase again tomorrow after Firebase&apos;s daily quota resets (or open this page on the browser/phone where you originally uploaded them to transfer from local cache now).
                        </p>
                      )}
                      {migrationResult.errors.length > 0 && (
                        <p className="text-[11px] text-red-200 bg-red-950/60 border border-red-500/35 rounded-lg p-2">
                          {migrationResult.errors[0]}
                        </p>
                      )}
                    </div>
                  )}

                  {migrationError && (
                    <p className="text-[11px] text-red-300 bg-red-950/60 border border-red-500/30 rounded-lg p-2">
                      {migrationError}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Media Type Selector */}
            <div className="flex gap-2 p-1 bg-rose-950/60 rounded-xl border border-rose-500/20">
              <button
                type="button"
                disabled={isUploading}
                onClick={() => {
                  setMediaType('photo');
                  clearSelectedItems();
                  setError(null);
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg transition-all ${
                  mediaType === 'photo'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-rose-300/70 hover:text-white'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>Photos</span>
              </button>
              <button
                type="button"
                disabled={isUploading}
                onClick={() => {
                  setMediaType('video');
                  clearSelectedItems();
                  setError(null);
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg transition-all ${
                  mediaType === 'video'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-rose-300/70 hover:text-white'
                }`}
              >
                <Video className="w-4 h-4" />
                <span>Video Clips</span>
              </button>
            </div>

            {/* Source Selector: Upload file vs URL */}
            <div className="flex items-center justify-between text-xs text-rose-300/80 px-1">
              <span>Choose Source:</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => {
                    setSourceMode('upload');
                    setError(null);
                  }}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    sourceMode === 'upload'
                      ? 'bg-rose-900/60 text-white font-medium'
                      : 'text-rose-400/60 hover:text-rose-200'
                  }`}
                >
                  Upload from Device
                </button>
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => {
                    setSourceMode('url');
                    setError(null);
                  }}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    sourceMode === 'url'
                      ? 'bg-rose-900/60 text-white font-medium'
                      : 'text-rose-400/60 hover:text-rose-200'
                  }`}
                >
                  Web URL
                </button>
              </div>
            </div>

            {/* Upload Input or URL Input */}
            {sourceMode === 'upload' ? (
              <div className="border-2 border-dashed border-rose-500/30 rounded-2xl p-4 text-center hover:border-rose-400/60 transition-colors bg-rose-950/30">
                {selectedItems.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1 text-xs text-rose-300">
                      <span className="flex items-center gap-1 text-emerald-400 font-medium">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          {selectedItems.length}{' '}
                          {selectedItems.length === 1 ? 'file' : 'files'} selected
                        </span>
                      </span>
                      <button
                        type="button"
                        disabled={isUploading}
                        onClick={clearSelectedItems}
                        className="text-xs text-rose-400 hover:text-rose-200 underline"
                      >
                        Clear all
                      </button>
                    </div>

                    {/* Multi-thumbnail preview grid */}
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1">
                      {selectedItems.map((preview, i) => (
                        <div
                          key={preview.id}
                          className="relative aspect-square rounded-xl overflow-hidden bg-black/60 group border border-rose-500/20"
                        >
                          {preview.previewUrl ? (
                            mediaType === 'photo' ? (
                              <img
                                src={preview.previewUrl}
                                alt={`Preview ${i + 1}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <video
                                src={preview.previewUrl}
                                muted
                                playsInline
                                className="w-full h-full object-cover"
                              />
                            )
                          ) : null}
                          <button
                            type="button"
                            disabled={isUploading}
                            onClick={() => handleRemovePreview(i)}
                            className="absolute top-1 right-1 p-1 rounded-full bg-black/80 text-white hover:text-red-400 transition-colors"
                            title="Remove this item"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Add more files trigger */}
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-900/40 text-xs text-rose-200 hover:text-white cursor-pointer transition-colors border border-rose-500/20">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Select more files</span>
                      <input
                        type="file"
                        multiple
                        accept={mediaType === 'photo' ? 'image/*' : 'video/*'}
                        onChange={handleFileChange}
                        className="hidden"
                        disabled={isUploading}
                      />
                    </label>
                  </div>
                ) : (
                  <label className="cursor-pointer block py-7">
                    <Upload className="w-10 h-10 mx-auto text-rose-400 mb-2 animate-bounce" />
                    <span className="text-sm font-semibold text-rose-200 block">
                      Tap to browse {mediaType === 'photo' ? 'photos' : 'videos'} of Tsi
                    </span>
                    <span className="text-[11px] text-rose-300/70 block mt-1">
                      {mediaType === 'photo'
                        ? 'Select multiple photos at once (JPG, PNG, WebP)'
                        : isPostgresReady
                          ? 'Select video clips up to 100 MB each (MP4, WebM, MOV)'
                          : 'Select video clips up to 18 MB each (MP4, WebM, MOV)'}
                    </span>
                    <input
                      type="file"
                      multiple
                      accept={mediaType === 'photo' ? 'image/*' : 'video/*'}
                      onChange={handleFileChange}
                      className="hidden"
                      disabled={isUploading}
                    />
                  </label>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-rose-300/80 mb-1">
                  Direct {mediaType === 'photo' ? 'Image' : 'Video'} Link
                </label>
                <div className="relative">
                  <input
                    type="url"
                    placeholder={
                      mediaType === 'photo'
                        ? 'https://example.com/tsi.jpg'
                        : 'https://example.com/tsi.mp4'
                    }
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    disabled={isUploading}
                    className="w-full bg-rose-950/50 border border-rose-500/30 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-rose-400/40 focus:outline-none focus:border-rose-400"
                  />
                  <Link className="absolute right-3 top-3 w-4 h-4 text-rose-400/60" />
                </div>
              </div>
            )}

            {/* Caption */}
            <div>
              <label className="block text-xs font-medium text-rose-300/80 mb-1">
                Caption (Optional)
              </label>
              <textarea
                ref={captionTextareaRef}
                rows={2}
                maxLength={1000}
                placeholder="Write a sweet message & emojis about this moment..."
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                disabled={isUploading}
                className="w-full bg-rose-950/50 border border-rose-500/30 rounded-xl px-3.5 py-2 text-xs text-white placeholder-rose-400/40 focus:outline-none focus:border-rose-400 resize-none"
              />
              <EmojiQuickPicker
                disabled={isUploading}
                onSelect={(emoji) => {
                  const { nextValue, nextCursorPos } = insertTextAtCursor(
                    captionTextareaRef.current,
                    caption,
                    emoji,
                    1000
                  );
                  setCaption(nextValue);
                  requestAnimationFrame(() => {
                    const el = captionTextareaRef.current;
                    if (el) {
                      el.focus();
                      el.setSelectionRange(nextCursorPos, nextCursorPos);
                    }
                  });
                }}
              />
            </div>

            {/* Error Message */}
            {error && (
              <p className="text-xs text-red-300 bg-red-950/60 border border-red-500/30 rounded-lg p-2.5">
                {error}
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isUploading}
                className="px-4 py-2 text-xs font-medium text-rose-300 hover:text-white rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUploading}
                className="px-6 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-rose-600 to-red-600 rounded-xl hover:from-rose-500 hover:to-red-500 shadow-lg shadow-rose-950/60 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-70 cursor-pointer"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{uploadStatus || 'Saving to cloud...'}</span>
                  </>
                ) : selectedItems.length > 1 ? (
                  <span>Save {selectedItems.length} Items to Cloud</span>
                ) : (
                  <span>Save to Cloud Gallery</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
