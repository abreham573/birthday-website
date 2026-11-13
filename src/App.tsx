/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
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

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [selectedLightboxItem, setSelectedLightboxItem] = useState<MemoryItem | null>(null);

  // Hidden Heart Animation Hook for Love Letter
  const { triggerHeartBurst, tapCount, renderFloatingHearts } = useHeartTapEffect();

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Fetch cloud-persisted memories & love letter on mount so Tsi sees everything on any device
  useEffect(() => {
    let active = true;

    async function loadCloudData() {
      try {
        const [cloudMemories, cloudLetter] = await Promise.all([
          fetchMemoriesFromFirestore().catch((err) => {
            console.error('Failed to load memories from Firestore:', err);
            return [] as MemoryItem[];
          }),
          fetchLetterFromFirestore().catch((err) => {
            console.error('Failed to load letter from Firestore:', err);
            return null;
          }),
        ]);

        if (!active) return;

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
      />

      {/* Main Pages: 1. Photos & Videos, 2. Love Letter, 3. Our Song */}
      <main className="relative z-10">
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
        <p>Made with all my love for Tsi ❤️ Happy Birthday</p>
      </footer>
    </div>
  );
}
