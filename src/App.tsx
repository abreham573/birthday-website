/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { TabType, MemoryItem, LoveLetterData } from './types';
import { INITIAL_MEMORIES } from './data/initialMemories';
import { DEFAULT_LOVE_LETTER } from './data/defaultLetter';
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

  // Memories state: Starts with permanent INITIAL_MEMORIES, synced across devices
  const [memories, setMemories] = useState<MemoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('tsi_memories_v4');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Ensure INITIAL_MEMORIES are preserved if not in saved list
          const existingIds = new Set(parsed.map((m: MemoryItem) => m.id));
          const missingInitial = INITIAL_MEMORIES.filter((m) => !existingIds.has(m.id));
          return [...parsed, ...missingInitial];
        }
      }
    } catch {
      // Fallback
    }
    return INITIAL_MEMORIES;
  });

  // Love Letter state (persisted in localStorage)
  const [letterData, setLetterData] = useState<LoveLetterData>(() => {
    try {
      const saved = localStorage.getItem('tsi_love_letter_v2');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // Fallback
    }
    return DEFAULT_LOVE_LETTER;
  });

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [selectedLightboxItem, setSelectedLightboxItem] = useState<MemoryItem | null>(null);

  // Hidden Heart Animation Hook for Love Letter
  const { triggerHeartBurst, tapCount, renderFloatingHearts } = useHeartTapEffect();

  // Fetch server-persisted memories on mount so Tsi sees any added memories on her device
  useEffect(() => {
    fetch('/api/memories')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.success && Array.isArray(data.memories)) {
          if (data.memories.length > 0) {
            setMemories(data.memories);
            try {
              localStorage.setItem('tsi_memories_v4', JSON.stringify(data.memories));
            } catch {}
          }
        }
      })
      .catch(() => {
        // Graceful fallback to initial memories
      });
  }, []);

  // Save memories to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('tsi_memories_v4', JSON.stringify(memories));
    } catch {
      // ignore quota error
    }
  }, [memories]);

  // Save letter to localStorage
  const handleUpdateLetter = (updated: LoveLetterData) => {
    setLetterData(updated);
    try {
      localStorage.setItem('tsi_love_letter_v2', JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  // Add new photo or video
  const handleAddMemory = (newItem: MemoryItem) => {
    setMemories((prev) => [newItem, ...prev.filter((m) => m.id !== newItem.id)]);
  };

  // Add multiple photos or videos
  const handleAddMultipleMemories = (newItems: MemoryItem[]) => {
    setMemories((prev) => [...newItems, ...prev.filter((m) => !newItems.some((n) => n.id === m.id))]);
  };

  // Delete memory (locally and from server)
  const handleDeleteMemory = (id: string) => {
    setMemories((prev) => prev.filter((m) => m.id !== id));
    fetch(`/api/memories/${id}`, {
      method: 'DELETE',
    }).catch(() => {});
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
            onOpenAddModal={() => setIsAddModalOpen(true)}
            onSelectMemory={(item) => setSelectedLightboxItem(item)}
            onNavigateToLetter={() => handleSelectTab('letter')}
            onNavigateToSong={() => handleSelectTab('song')}
          />
        )}

        {activeTab === 'letter' && (
          <LoveLetterPage
            letterData={letterData}
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
      />

      {/* Footer */}
      <footer className="relative z-10 border-t border-rose-500/15 py-8 text-center text-xs text-rose-300/60 pb-24 md:pb-8">
        <p>Made with all my love for Tsi ❤️ Happy Birthday</p>
      </footer>
    </div>
  );
}
