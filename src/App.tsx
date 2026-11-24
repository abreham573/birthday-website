/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Lock, AlertTriangle, ExternalLink, KeyRound } from 'lucide-react';
import { TabType, MemoryItem, LoveLetterData, AccessGateConfig } from './types';
import { INITIAL_MEMORIES } from './data/initialMemories';
import { DEFAULT_LOVE_LETTER } from './data/defaultLetter';
import {
  auth,
  isOwnerUser,
  signInOwner,
  signOutOwner,
} from './lib/firebase';
import {
  DEFAULT_GATE_CONFIG,
  fetchGateConfigFromFirestore,
  saveGateConfigToFirestore,
  getCachedGateConfigFallback,
  fetchMemoriesFromFirestore,
  deleteMemoryFromFirestore,
  updateMemoryMetadataInFirestore,
  fetchLetterFromFirestore,
  saveLetterToFirestore,
  resolveChunkedMemoryUrl,
  getCachedMemoriesFallback,
  getCachedLetterFallback,
  isQuotaExceededError,
} from './lib/memoriesService';
import { BackgroundEffects } from './components/BackgroundEffects';
import { PasswordGatePage } from './components/PasswordGatePage';
import { Navbar } from './components/Navbar';
import { MemoriesPage } from './components/MemoriesPage';
import { LoveLetterPage } from './components/LoveLetterPage';
import { SongPage } from './components/SongPage';
import { AddMediaModal } from './components/AddMediaModal';
import { LightboxModal } from './components/LightboxModal';
import { YouTubeLinkButton } from './components/YouTubeLinkButton';
import { useHeartTapEffect } from './components/HeartTapEffect';

const UNLOCK_STORAGE_KEY = 'tsi_birthday_unlocked';

export default function App() {
  // Front-page Password Gate state (starts locked on each new visit/session)
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(UNLOCK_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [gateConfig, setGateConfig] = useState<AccessGateConfig>(DEFAULT_GATE_CONFIG);
  const [isLoadingGate, setIsLoadingGate] = useState<boolean>(true);
  const [adminRequested, setAdminRequested] = useState<boolean>(false);

  // Page Navigation: Memories (1st), Love Letter (2nd), Song (3rd)
  const [activeTab, setActiveTab] = useState<TabType>('memories');

  // Firebase Auth State (only owner uploads/edits; Tsi views publicly without login)
  const [user, setUser] = useState<User | null>(null);
  const isOwner = isOwnerUser(user);

  // Cloud-synced Memories state
  const [memories, setMemories] = useState<MemoryItem[]>(INITIAL_MEMORIES);
  const [isLoadingMemories, setIsLoadingMemories] = useState<boolean>(true);

  // Cloud-synced Love Letter state
  const [letterData, setLetterData] = useState<LoveLetterData>(DEFAULT_LOVE_LETTER);
  const [quotaExceeded, setQuotaExceeded] = useState<boolean>(false);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [selectedLightboxItem, setSelectedLightboxItem] = useState<MemoryItem | null>(null);

  // Hidden Heart Animation Hook for Love Letter
  const { triggerHeartBurst, tapCount, renderFloatingHearts } = useHeartTapEffect();

  // Listen to Firebase Auth state & support ?admin=1 creator access shortcut
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === '1' || params.get('admin') === 'true') {
      setAdminRequested(true);
      setIsAddModalOpen(true);
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Warm gate, memories, and letter immediately from IndexedDB cache on mount (0 Firestore reads!)
  useEffect(() => {
    let active = true;

    async function hydrateLocalCache() {
      const [cachedGate, cachedMemories, cachedLetter] = await Promise.all([
        getCachedGateConfigFallback().catch(() => null),
        getCachedMemoriesFallback().catch(() => []),
        getCachedLetterFallback().catch(() => null),
      ]);

      if (!active) return;

      if (cachedGate) {
        setGateConfig(cachedGate);
        setIsLoadingGate(false);
      }
      if (cachedMemories.length > 0) {
        setMemories((prev) => (prev.length > 0 ? prev : cachedMemories));
        setIsLoadingMemories(false);
      }
      if (cachedLetter) {
        setLetterData(cachedLetter);
      }
    }

    hydrateLocalCache();

    return () => {
      active = false;
    };
  }, []);

  // Refresh Front-Page Password Gate config from Firestore on mount
  useEffect(() => {
    let active = true;

    async function loadGateConfig() {
      try {
        const cloudGate = await fetchGateConfigFromFirestore().catch(async (err) => {
          if (isQuotaExceededError(err)) {
            setQuotaExceeded(true);
          }
          console.error('Failed to load gate config from Firestore:', err);
          return await getCachedGateConfigFallback();
        });

        if (!active) return;
        if (cloudGate) {
          setGateConfig(cloudGate);
        }
      } finally {
        if (active) {
          setIsLoadingGate(false);
        }
      }
    }

    loadGateConfig();

    return () => {
      active = false;
    };
  }, []);

  const hasLoadedCloudRef = useRef<boolean>(false);
  const canLoadCloud = isUnlocked || isOwner;

  // Fetch cloud-persisted memories & love letter independently once unlocked (or signed in as owner)
  useEffect(() => {
    if (!canLoadCloud || hasLoadedCloudRef.current) return;

    let active = true;

    async function syncMemories() {
      try {
        const cloudMemories = await fetchMemoriesFromFirestore().catch((err) => {
          if (isQuotaExceededError(err)) {
            setQuotaExceeded(true);
          }
          console.error('Failed to load memories from Firestore:', err);
          return null;
        });

        if (!active) return;

        const resolvedMemories =
          cloudMemories !== null ? cloudMemories : await getCachedMemoriesFallback();

        if (!active) return;

        if (cloudMemories !== null || resolvedMemories.length > 0) {
          // Preserve existing live URLs for identical items so cached views don't flicker
          setMemories((prev) => {
            const prevUrlById = new Map(
              prev.filter((m) => Boolean(m.url)).map((m) => [m.id, m.url])
            );
            return resolvedMemories.map((item) => {
              const existingUrl = prevUrlById.get(item.id);
              if (existingUrl && !item.url) {
                return { ...item, url: existingUrl };
              }
              return item;
            });
          });
          setIsLoadingMemories(false);

          // Progressively load any uncached chunked photos in the background (cover photo first)
          const pendingChunkedPhotos = resolvedMemories.filter(
            (m) => m.type === 'photo' && m.isChunked && !m.url
          );
          if (pendingChunkedPhotos.length > 0) {
            for (let i = 0; i < pendingChunkedPhotos.length; i += 3) {
              if (!active) break;
              const slice = pendingChunkedPhotos.slice(i, i + 3);
              const results = await Promise.allSettled(
                slice.map(async (photo) => {
                  const url = await resolveChunkedMemoryUrl(photo.id);
                  if (!active || !url) return;
                  setMemories((prev) =>
                    prev.map((m) => (m.id === photo.id && !m.url ? { ...m, url } : m))
                  );
                })
              );
              const hitQuota = results.some(
                (r) => r.status === 'rejected' && isQuotaExceededError(r.reason)
              );
              if (hitQuota) {
                if (active) setQuotaExceeded(true);
                break;
              }
            }
          }
        }
      } finally {
        if (active) {
          setIsLoadingMemories(false);
        }
      }
    }

    async function syncLetter() {
      const cloudLetter = await fetchLetterFromFirestore().catch(async (err) => {
        if (isQuotaExceededError(err)) {
          setQuotaExceeded(true);
        }
        console.error('Failed to load letter from Firestore:', err);
        return await getCachedLetterFallback();
      });

      if (!active) return;
      if (cloudLetter) {
        setLetterData(cloudLetter);
      }
    }

    hasLoadedCloudRef.current = true;
    void syncMemories();
    void syncLetter();

    return () => {
      active = false;
    };
  }, [canLoadCloud]);

  const handleUnlock = () => {
    try {
      sessionStorage.setItem(UNLOCK_STORAGE_KEY, 'true');
    } catch {
      // Ignore private browsing sessionStorage restrictions
    }
    setActiveTab('memories');
    setIsUnlocked(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLockFrontPage = () => {
    try {
      sessionStorage.removeItem(UNLOCK_STORAGE_KEY);
    } catch {
      // Ignore
    }
    setIsUnlocked(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleResolveMedia = useCallback(async (id: string): Promise<string> => {
    const resolvedUrl = await resolveChunkedMemoryUrl(id);
    if (resolvedUrl) {
      setMemories((prev) =>
        prev.map((m) => (m.id === id ? { ...m, url: resolvedUrl } : m))
      );
      setSelectedLightboxItem((prev) =>
        prev && prev.id === id ? { ...prev, url: resolvedUrl } : prev
      );
    }
    return resolvedUrl;
  }, []);

  const handleSignInOwner = async () => {
    await signInOwner();
  };

  const handleSignOutOwner = async () => {
    await signOutOwner();
  };

  // Save custom front-page password & hint to Firestore
  const handleSaveGateConfig = async (params: {
    newPassword?: string;
    hint: string;
    welcomeTitle: string;
    welcomeSubtitle: string;
  }) => {
    if (!user || !isOwner) {
      throw new Error('Please sign in with the creator Google account to update the password.');
    }
    try {
      const updated = await saveGateConfigToFirestore({
        ...params,
        existingPasswordHash: gateConfig.passwordHash,
        authorId: user.uid,
      });
      setGateConfig(updated);
    } catch (err) {
      if (isQuotaExceededError(err)) setQuotaExceeded(true);
      throw err;
    }
  };

  // Save letter to Firestore when signed in as owner
  const handleUpdateLetter = async (updated: LoveLetterData) => {
    if (!user || !isOwner) {
      throw new Error('Please sign in with the creator Google account to save changes.');
    }
    try {
      const saved = await saveLetterToFirestore(updated, user.uid);
      setLetterData(saved);
    } catch (err) {
      if (isQuotaExceededError(err)) setQuotaExceeded(true);
      throw err;
    }
  };

  // Add new photo or video to UI state (already persisted to Firestore by AddMediaModal)
  const handleAddMemory = (newItem: MemoryItem) => {
    setMemories((prev) => [newItem, ...prev.filter((m) => m.id !== newItem.id)]);
  };

  // Add multiple photos or videos to UI state
  const handleAddMultipleMemories = (newItems: MemoryItem[]) => {
    setMemories((prev) => [
      ...newItems,
      ...prev.filter((m) => !newItems.some((n) => n.id === m.id)),
    ]);
  };

  // Update title/caption/date/tag on an existing memory
  const handleUpdateMemory = async (params: {
    id: string;
    title: string;
    caption: string;
    date: string;
    tag: string;
  }) => {
    if (!isOwner) {
      throw new Error('Please sign in with the creator Google account to edit captions.');
    }
    try {
      const updated = await updateMemoryMetadataInFirestore({
        memoryId: params.id,
        title: params.title,
        caption: params.caption,
        date: params.date,
        tag: params.tag,
      });
      setMemories((prev) =>
        prev.map((m) => (m.id === params.id ? { ...m, ...updated } : m))
      );
      setSelectedLightboxItem((prev) =>
        prev && prev.id === params.id ? { ...prev, ...updated } : prev
      );
    } catch (err) {
      if (isQuotaExceededError(err)) setQuotaExceeded(true);
      throw err;
    }
  };

  // Delete memory permanently from Firestore
  const handleDeleteMemory = async (id: string) => {
    if (!isOwner) {
      throw new Error('Please sign in with the creator Google account to remove memories.');
    }
    try {
      const target = memories.find((m) => m.id === id);
      await deleteMemoryFromFirestore(id);
      if (target?.url.startsWith('blob:')) {
        URL.revokeObjectURL(target.url);
      }
      setMemories((prev) => prev.filter((m) => m.id !== id));
      setSelectedLightboxItem((prev) => (prev?.id === id ? null : prev));
    } catch (err) {
      if (isQuotaExceededError(err)) setQuotaExceeded(true);
      console.error('Failed to delete memory from Firestore:', err);
      throw err;
    }
  };

  // Scroll to top when switching pages
  const handleSelectTab = (tab: TabType) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Show Add controls only to the signed-in owner, or before the first memory is uploaded
  const showAddControls = isOwner || (!isLoadingMemories && memories.length === 0);

  return (
    <div className="relative min-h-screen text-rose-50 selection:bg-rose-600 selection:text-white">
      {/* Reddish / Romantic Atmospheric Ambient Gradients & Floating Petals */}
      <BackgroundEffects />

      {/* Floating Hidden Heart Particle Burst Canvas */}
      {renderFloatingHearts()}

      {!isUnlocked ? (
        <main className="relative z-10">
          {quotaExceeded && (
            <div className="max-w-lg mx-auto px-4 pt-6">
              <div className="rounded-2xl bg-amber-950/70 border border-amber-500/35 p-3.5 text-xs text-amber-100 flex items-start gap-2.5 backdrop-blur-md">
                <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                <p className="text-amber-100/85 leading-relaxed">
                  Daily free database quota limit reached. Cached items on this device still work, and free daily limits reset tomorrow.
                </p>
              </div>
            </div>
          )}

          <PasswordGatePage
            gateConfig={gateConfig}
            isLoadingGate={isLoadingGate}
            isOwner={isOwner}
            onUnlock={handleUnlock}
            onSignInOwner={handleSignInOwner}
            onSaveGateConfig={handleSaveGateConfig}
            initialOpenAdmin={adminRequested}
          />
        </main>
      ) : (
        <>
          {/* Header and Mobile Bottom Navigation */}
          <Navbar
            activeTab={activeTab}
            onSelectTab={handleSelectTab}
            onOpenAddModal={() => setIsAddModalOpen(true)}
            heartCount={tapCount}
            showAddButton={showAddControls}
          />

          {/* Main Pages: 1. Photos & Videos, 2. Love Letter, 3. Our Song */}
          <main className="relative z-10">
            {quotaExceeded && (
              <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-4">
                <div className="rounded-2xl bg-amber-950/70 border border-amber-500/35 p-4 text-xs text-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 backdrop-blur-md">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-amber-200">
                        Daily free Firestore quota limit reached
                      </p>
                      <p className="text-amber-100/80 mt-0.5 leading-relaxed">
                        Free daily database read/write limits reset tomorrow. Cached items on this device still load offline, or you can upgrade your database quota in Firebase Console.
                      </p>
                    </div>
                  </div>
                  {isOwner && (
                    <a
                      href="https://console.firebase.google.com/project/gen-lang-client-0717726151/firestore/databases/ai-studio-birthdaywebsite-b4d31af1-dbb6-455d-ae64-69fcad2dc0d4/data?openUpgradeDialog=true"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-100 font-semibold whitespace-nowrap shrink-0 transition-colors"
                    >
                      <span>Upgrade Database</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'memories' && (
              <MemoriesPage
                memories={memories}
                isLoading={isLoadingMemories}
                isOwner={isOwner}
                onOpenAddModal={() => setIsAddModalOpen(true)}
                onSelectMemory={(item) => setSelectedLightboxItem(item)}
                onResolveMedia={handleResolveMedia}
                onUpdateMemory={handleUpdateMemory}
                onNavigateToLetter={() => handleSelectTab('letter')}
                onNavigateToSong={() => handleSelectTab('song')}
              />
            )}

            {activeTab === 'letter' && (
              <LoveLetterPage
                letterData={letterData}
                isOwner={isOwner}
                onSignInOwner={handleSignInOwner}
                onUpdateLetter={handleUpdateLetter}
                onHeartTap={triggerHeartBurst}
                tapCount={tapCount}
                onNavigateToMemories={() => handleSelectTab('memories')}
                onNavigateToSong={() => handleSelectTab('song')}
              />
            )}

            {activeTab === 'song' && (
              <SongPage
                onNavigateToMemories={() => handleSelectTab('memories')}
                onNavigateToLetter={() => handleSelectTab('letter')}
              />
            )}
          </main>

          {/* Floating Shortcut Button that Redirects to YouTube */}
          <YouTubeLinkButton />

          {/* Fullscreen Lightbox Modal */}
          <LightboxModal
            item={selectedLightboxItem}
            items={memories}
            isOwner={isOwner}
            onClose={() => setSelectedLightboxItem(null)}
            onSelect={(item) => setSelectedLightboxItem(item)}
            onDelete={handleDeleteMemory}
            onResolveMedia={handleResolveMedia}
          />

          {/* Add Photo or Video Modal */}
          <AddMediaModal
            isOpen={isAddModalOpen}
            onClose={() => setIsAddModalOpen(false)}
            onAdd={handleAddMemory}
            onAddMultiple={handleAddMultipleMemories}
            onQuotaExceeded={() => setQuotaExceeded(true)}
            user={user}
            isOwner={isOwner}
            onSignInOwner={handleSignInOwner}
            onSignOutOwner={handleSignOutOwner}
          />

          {/* Footer */}
          <footer className="relative z-10 border-t border-rose-500/15 py-8 text-center text-xs text-rose-300/60 pb-24 md:pb-8">
            <div className="inline-flex flex-wrap items-center justify-center gap-2 px-4">
              <p>Made with all my love for Tsi ❤️ Happy Birthday</p>
              <button
                type="button"
                onClick={handleLockFrontPage}
                title="Lock & View Front Password Page"
                aria-label="Lock & View Front Password Page"
                className="text-rose-300/30 hover:text-rose-300/80 transition-colors p-1 cursor-pointer"
              >
                <KeyRound className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                title="Creator Access"
                aria-label="Creator Access"
                className="text-rose-300/25 hover:text-rose-300/80 transition-colors p-1 cursor-pointer"
              >
                <Lock className="w-3 h-3" />
              </button>
            </div>
            <p className="mt-2 font-serif-cormorant italic text-base sm:text-lg text-rose-200/90">
              Te amo mi vida ❤️
            </p>
          </footer>
        </>
      )}
    </div>
  );
}
