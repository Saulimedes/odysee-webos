import React, { useState, useEffect, useCallback } from 'react';
import { Stack, Text, Center } from '@mantine/core';
import { useWindowEvent } from '@mantine/hooks';
import VideoCard from './VideoCard';
import { STORAGE_KEYS, KEYCODE_UP, KEYCODE_DOWN, KEYCODE_LEFT, KEYCODE_RIGHT, KEYCODE_ENTER } from '../constants';
import {
  isLoggedIn,
  addToWatchLaterCloud,
  removeFromWatchLaterCloud,
  addToFavoritesCloud,
  removeFromFavoritesCloud
} from '../api/odysee';

// ============================================
// IN-MEMORY CACHE FOR LOCALSTORAGE
// Reduces JSON parse/stringify overhead
// ============================================
const storageCache = {
  data: {},
  sets: {}, // O(1) lookup sets for video IDs
  writeTimers: {},

  get(key) {
    if (!this.data[key]) {
      try {
        const saved = localStorage.getItem(key);
        this.data[key] = saved ? JSON.parse(saved) : [];
        // Build lookup set for O(1) checks
        this.sets[key] = new Set(this.data[key].map(v => v.id));
      } catch (err) {
        console.error('Failed to load from localStorage:', key, err);
        this.data[key] = [];
        this.sets[key] = new Set();
      }
    }
    return this.data[key];
  },

  set(key, value) {
    this.data[key] = value;
    // Rebuild lookup set
    this.sets[key] = new Set(value.map(v => v.id));
    // Debounce writes to localStorage (500ms)
    clearTimeout(this.writeTimers[key]);
    this.writeTimers[key] = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (err) {
        console.error('Failed to write to localStorage:', key, err);
      }
    }, 500);
  },

  has(key, videoId) {
    // O(1) lookup using Set
    if (!this.sets[key]) {
      this.get(key); // Initialize if needed
    }
    return this.sets[key].has(videoId);
  },

  // Force immediate write (useful before page unload)
  flush(key) {
    if (this.writeTimers[key]) {
      clearTimeout(this.writeTimers[key]);
      delete this.writeTimers[key];
    }
    if (this.data[key]) {
      try {
        localStorage.setItem(key, JSON.stringify(this.data[key]));
      } catch (err) {
        console.error('Failed to flush to localStorage:', key, err);
      }
    }
  },

  // Flush all pending writes
  flushAll() {
    Object.keys(this.writeTimers).forEach(key => this.flush(key));
  },

  // Invalidate cache (call after external changes)
  invalidate(key) {
    delete this.data[key];
    delete this.sets[key];
  },
};

// Flush pending writes before page unload to prevent data loss
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    storageCache.flushAll();
  });
  // Also handle WebOS-specific visibility change
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      storageCache.flushAll();
    }
  });
}

export default function Watchlist({ onPlayVideo, onFocusSidebar, sidebarFocused }) {
  const [watchlist, setWatchlist] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Load watchlist from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.WATCHLIST);
      if (saved) {
        setWatchlist(JSON.parse(saved));
      }
    } catch (err) {
      console.error('Failed to load watchlist:', err);
    }
  }, []);

  // Handle keyboard navigation
  useWindowEvent('keydown', (event) => {
    if (sidebarFocused || watchlist.length === 0) return;

    const keyCode = event.keyCode.toString();
    const columns = 4;
    const currentRow = Math.floor(selectedIndex / columns);
    const currentCol = selectedIndex % columns;

    switch (keyCode) {
      case KEYCODE_UP:
        event.preventDefault();
        if (currentRow > 0) {
          setSelectedIndex(prev => prev - columns);
        }
        break;
      case KEYCODE_DOWN:
        event.preventDefault();
        const nextIndex = selectedIndex + columns;
        if (nextIndex < watchlist.length) {
          setSelectedIndex(nextIndex);
        }
        break;
      case KEYCODE_LEFT:
        event.preventDefault();
        if (currentCol === 0) {
          onFocusSidebar();
        } else {
          setSelectedIndex(prev => Math.max(0, prev - 1));
        }
        break;
      case KEYCODE_RIGHT:
        event.preventDefault();
        if (selectedIndex < watchlist.length - 1) {
          setSelectedIndex(prev => prev + 1);
        }
        break;
      case KEYCODE_ENTER:
        event.preventDefault();
        if (watchlist[selectedIndex]) {
          onPlayVideo(watchlist[selectedIndex]);
        }
        break;
    }
  });

  const handleVideoClick = useCallback((video, index) => {
    setSelectedIndex(index);
    onPlayVideo(video);
  }, [onPlayVideo]);

  return (
    <div className="watchlist-container">
      <Stack p="md" spacing="md">
        <Text size="xl" weight={700} color="white">
          Watchlist
        </Text>

        {watchlist.length === 0 ? (
          <Center py="xl" style={{ height: '60vh' }}>
            <Stack align="center" spacing="sm">
              <Text color="dimmed" size="xl">Your watchlist is empty</Text>
              <Text color="dimmed" size="sm">
                Videos you save will appear here
              </Text>
            </Stack>
          </Center>
        ) : (
          <div className={`video-grid ${!sidebarFocused ? 'content-has-focus' : ''}`}>
            {watchlist.map((video, index) => (
              <VideoCard
                key={video.id}
                video={video}
                isActive={index === selectedIndex}
                onClick={() => handleVideoClick(video, index)}
              />
            ))}
          </div>
        )}
      </Stack>
    </div>
  );
}

// Helper function to add video to watchlist - uses cache
export function addToWatchlist(video) {
  try {
    // O(1) check using cached Set
    if (storageCache.has(STORAGE_KEYS.WATCHLIST, video.id)) {
      return false;
    }

    const watchlist = [...storageCache.get(STORAGE_KEYS.WATCHLIST)];
    watchlist.unshift(video);
    storageCache.set(STORAGE_KEYS.WATCHLIST, watchlist);
    return true;
  } catch (err) {
    console.error('Failed to add to watchlist:', err);
    return false;
  }
}

// Helper function to remove video from watchlist - uses cache
export function removeFromWatchlist(videoId) {
  try {
    const watchlist = storageCache.get(STORAGE_KEYS.WATCHLIST);
    const filtered = watchlist.filter(v => v.id !== videoId);
    storageCache.set(STORAGE_KEYS.WATCHLIST, filtered);
    return true;
  } catch (err) {
    console.error('Failed to remove from watchlist:', err);
    return false;
  }
}

// Helper function to check if video is in watchlist - O(1) lookup
export function isInWatchlist(videoId) {
  return storageCache.has(STORAGE_KEYS.WATCHLIST, videoId);
}

// ============ Watch Later functions ============

// Add video to Watch Later - uses cache and syncs to cloud
export function addToWatchLater(video) {
  try {
    // O(1) check
    if (storageCache.has(STORAGE_KEYS.WATCH_LATER, video.id)) {
      return false;
    }

    const list = [...storageCache.get(STORAGE_KEYS.WATCH_LATER)];
    list.unshift(video);
    storageCache.set(STORAGE_KEYS.WATCH_LATER, list);

    // Sync to cloud if logged in (async, don't wait)
    if (isLoggedIn()) {
      addToWatchLaterCloud(video).catch(err => {
        console.error('Watch Later cloud sync failed:', err);
      });
    }

    return true;
  } catch (err) {
    console.error('Failed to add to watch later:', err);
    return false;
  }
}

// Remove video from Watch Later - uses cache and syncs to cloud
export function removeFromWatchLater(videoId) {
  try {
    const list = storageCache.get(STORAGE_KEYS.WATCH_LATER);
    const filtered = list.filter(v => v.id !== videoId);
    storageCache.set(STORAGE_KEYS.WATCH_LATER, filtered);

    // Sync to cloud if logged in (async, don't wait)
    if (isLoggedIn()) {
      removeFromWatchLaterCloud(videoId).catch(err => {
        console.error('Watch Later cloud remove failed:', err);
      });
    }

    return true;
  } catch (err) {
    console.error('Failed to remove from watch later:', err);
    return false;
  }
}

// Check if video is in Watch Later - O(1) lookup
export function isInWatchLater(videoId) {
  return storageCache.has(STORAGE_KEYS.WATCH_LATER, videoId);
}

// ============ Favorites functions ============

// Add video to Favorites - uses cache and syncs to cloud
export function addToFavorites(video) {
  try {
    // O(1) check
    if (storageCache.has(STORAGE_KEYS.FAVORITES, video.id)) {
      return false;
    }

    const list = [...storageCache.get(STORAGE_KEYS.FAVORITES)];
    list.unshift(video);
    storageCache.set(STORAGE_KEYS.FAVORITES, list);

    // Sync to cloud if logged in (async, don't wait)
    if (isLoggedIn()) {
      addToFavoritesCloud(video).catch(err => {
        console.error('Favorites cloud sync failed:', err);
      });
    }

    return true;
  } catch (err) {
    console.error('Failed to add to favorites:', err);
    return false;
  }
}

// Remove video from Favorites - uses cache and syncs to cloud
export function removeFromFavorites(videoId) {
  try {
    const list = storageCache.get(STORAGE_KEYS.FAVORITES);
    const filtered = list.filter(v => v.id !== videoId);
    storageCache.set(STORAGE_KEYS.FAVORITES, filtered);

    // Sync to cloud if logged in (async, don't wait)
    if (isLoggedIn()) {
      removeFromFavoritesCloud(videoId).catch(err => {
        console.error('Favorites cloud remove failed:', err);
      });
    }

    return true;
  } catch (err) {
    console.error('Failed to remove from favorites:', err);
    return false;
  }
}

// Check if video is in Favorites - O(1) lookup
export function isInFavorites(videoId) {
  return storageCache.has(STORAGE_KEYS.FAVORITES, videoId);
}

// ============ Watch History functions ============

// Add video to Watch History - uses cache
export function addToWatchHistory(video) {
  try {
    let list = [...storageCache.get(STORAGE_KEYS.WATCH_HISTORY)];

    // Remove if already in history (to move to top)
    list = list.filter(v => v.id !== video.id);

    // Add to front with timestamp
    list.unshift({
      ...video,
      watchedAt: Date.now(),
    });

    // Keep only last 200 videos
    list = list.slice(0, 200);

    storageCache.set(STORAGE_KEYS.WATCH_HISTORY, list);
    return true;
  } catch (err) {
    console.error('Failed to add to watch history:', err);
    return false;
  }
}

// Export storage cache for external invalidation if needed
export { storageCache };
