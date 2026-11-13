/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Lock, AlertTriangle, ExternalLink } from 'lucide-react';
import { TabType, MemoryItem, LoveLetterData } from './types';
import { INITIAL_MEMORIES } from './data/initialMemories';
import { DEFAULT_LOVE_LETTER } from './data/defaultLetter';
import {
  auth,
  isOwnerUser,
  signInOwner,
  signOutOwner,
} from './lib/firebase';
import {
  fetchMemoriesFromFirestore,
  deleteMemoryFromFirestore,
  fetchLetterFromFirestore,
  saveLetterToFirestore,
  resolveChunkedMemoryUrl,
  getCachedMemoriesFallback,
  getCachedLetterFallback,
  isQuotaExceededError,
} from './lib/memoriesService';
import { BackgroundEffects } from './components/BackgroundEffects';
import { Navbar } from './components/Navbar';
import { MemoriesPage } from './components/MemoriesPage';
import { LoveLetterPage } from './components/LoveLetterPage';
import { SongPage } from './components/SongPage';
import { AddMediaModal } from './components/AddMediaModal';
import { LightboxModal } from './components/LightboxModal';
import { YouTubeLinkButton } from './components/YouTubeLinkButton';
import { useHeartTapEffect } from './components/HeartTapEffect';

export default function App() {
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
      setIsAddModalOpen(true);
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Fetch cloud-persisted memories & love letter on mount (with IndexedDB fallback on quota limit)
  useEffect(() => {
    let active = true;

    async function loadCloudData() {
      let hitQuota = false;
      try {
        const [cloudMemories, cloudLetter] = await Promise.all([
          fetchMemoriesFromFirestore().catch(async (err) => {
            if (isQuotaExceededError(err)) {
              hitQuota = true;
            }
            console.error('Failed to load memories from Firestore:', err);
            return await getCachedMemoriesFallback();
          }),
          fetchLetterFromFirestore().catch(async (err) => {
            if (isQuotaExceededError(err)) {
              hitQuota = true;
            }
            console.error('Failed to load letter from Firestore:', err);
            return await getCachedLetterFallback();
          }),
        ]);

        if (!active) return;

        if (hitQuota) {
          setQuotaExceeded(true);
        }
        if (cloudMemories.length > 0) {
          setMemories(cloudMemories);
        }
        if (cloudLetter) {
          setLetterData(cloudLetter);
        }
      } finally {
        if (active) {
          setIsLoadingMemories(false);
        }
      }
    }

    loadCloudData();

    return () => {
      active = false;
    };
  }, []);

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

  // Save letter to Firestore when signed in as owner
  const handleUpdateLetter = async (updated: LoveLetterData) => {
    if (!user || !isOwner) {
      throw new Error('Please sign in with the creator Google account to save changes.');
    }
    await saveLetterToFirestore(updated, user.uid);
    setLetterData(updated);
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

  // Delete memory permanently from Firestore
  const handleDeleteMemory = async (id: string) => {
    if (!isOwner) return;
    try {
      await deleteMemoryFromFirestore(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      console.error('Failed to delete memory from Firestore:', err);
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
                    Daily free Firestore read limit reached
                  </p>
                  <p className="text-amber-100/80 mt-0.5 leading-relaxed">
                    Free daily database read units reset tomorrow. Cached items on this device still load offline, or you can upgrade your database quota in Firebase Console.
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
        user={user}
        isOwner={isOwner}
        onSignInOwner={handleSignInOwner}
        onSignOutOwner={handleSignOutOwner}
      />

      {/* Footer */}
      <footer className="relative z-10 border-t border-rose-500/15 py-8 text-center text-xs text-rose-300/60 pb-24 md:pb-8">
        <div className="inline-flex items-center justify-center gap-2">
          <p>Made with all my love for Tsi ❤️ Happy Birthday</p>
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
      </footer>
    </div>
  );
}
