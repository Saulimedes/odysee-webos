import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Stack, Text, Center, Loader } from '@mantine/core';
import { useWindowEvent } from '@mantine/hooks';
import { IconClock, IconStar, IconPlaylist, IconHistory } from '@tabler/icons-react';
import VideoCard from './VideoCard';
import { STORAGE_KEYS, KEYCODE_UP, KEYCODE_DOWN, KEYCODE_LEFT, KEYCODE_RIGHT, KEYCODE_ENTER } from '../constants';
import { isLoggedIn, refreshWatchLaterFromCloud, refreshFavoritesFromCloud } from '../api/odysee';
import { storageCache } from './Watchlist';

const iconMap = {
  clock: IconClock,
  star: IconStar,
  playlist: IconPlaylist,
  history: IconHistory,
};

const ITEMS_PER_PAGE = 20;
const MAX_HISTORY_ITEMS = 200;

export default function VideoList({
  title,
  storageKey,
  emptyIcon,
  emptyMessage,
  emptySubtext,
  onPlayVideo,
  onFocusSidebar,
  sidebarFocused
}) {
  const [allVideos, setAllVideos] = useState([]);
  const [displayedVideos, setDisplayedVideos] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const videoRefs = useRef([]);
  const gridRef = useRef(null);

  // Calculate actual column count from grid
  const getColumnCount = useCallback(() => {
    if (!gridRef.current || displayedVideos.length === 0) return 4;
    const gridStyle = window.getComputedStyle(gridRef.current);
    const columns = gridStyle.getPropertyValue('grid-template-columns').split(' ').length;
    return columns || 4;
  }, [displayedVideos.length]);

  // Load videos from localStorage and refresh from cloud for Watch Later/Favorites
  useEffect(() => {
    const loadVideos = async () => {
      try {
        // First load from localStorage for immediate display
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          let parsed = JSON.parse(saved);
          parsed = Array.isArray(parsed) ? parsed : [];
          // Cap history at MAX_HISTORY_ITEMS
          if (storageKey === STORAGE_KEYS.WATCH_HISTORY) {
            parsed = parsed.slice(0, MAX_HISTORY_ITEMS);
          }
          setAllVideos(parsed);
          setDisplayedVideos(parsed.slice(0, ITEMS_PER_PAGE));
        }

        // For Watch Later and Favorites, refresh from cloud if logged in
        if (isLoggedIn()) {
          let cloudVideos = null;
          if (storageKey === STORAGE_KEYS.WATCH_LATER) {
            cloudVideos = await refreshWatchLaterFromCloud();
            // Invalidate the in-memory cache
            storageCache.invalidate(STORAGE_KEYS.WATCH_LATER);
          } else if (storageKey === STORAGE_KEYS.FAVORITES) {
            cloudVideos = await refreshFavoritesFromCloud();
            // Invalidate the in-memory cache
            storageCache.invalidate(STORAGE_KEYS.FAVORITES);
          }

          // Update state if cloud returned different data
          if (cloudVideos !== null) {
            setAllVideos(cloudVideos);
            setDisplayedVideos(cloudVideos.slice(0, ITEMS_PER_PAGE));
            setSelectedIndex(0);
          }
        }
      } catch (err) {
        console.error(`Failed to load ${title}:`, err);
      }
    };

    loadVideos();
  }, [storageKey, title]);

  // Load more videos
  const loadMore = useCallback(() => {
    if (loadingMore || displayedVideos.length >= allVideos.length) return;

    setLoadingMore(true);
    // Simulate async for smoother UI
    setTimeout(() => {
      const nextBatch = allVideos.slice(
        displayedVideos.length,
        displayedVideos.length + ITEMS_PER_PAGE
      );
      setDisplayedVideos(prev => [...prev, ...nextBatch]);
      setLoadingMore(false);
    }, 100);
  }, [loadingMore, displayedVideos.length, allVideos]);

  // Scroll selected video into view
  useEffect(() => {
    if (videoRefs.current[selectedIndex]) {
      videoRefs.current[selectedIndex].scrollIntoView({
        behavior: 'instant',
        block: 'nearest',
      });
    }
  }, [selectedIndex]);

  // Handle keyboard navigation
  useWindowEvent('keydown', (event) => {
    if (sidebarFocused || displayedVideos.length === 0) return;

    const keyCode = event.keyCode.toString();
    const columns = getColumnCount();
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
        {
          const nextIndex = selectedIndex + columns;
          if (nextIndex < displayedVideos.length) {
            setSelectedIndex(nextIndex);
            // Load more when approaching end
            const totalRows = Math.ceil(displayedVideos.length / columns);
            const nextRow = Math.floor(nextIndex / columns);
            if (nextRow >= totalRows - 2 && displayedVideos.length < allVideos.length) {
              loadMore();
            }
          } else if (displayedVideos.length < allVideos.length) {
            // At the end, try to load more
            loadMore();
          }
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
        if (currentCol < columns - 1 && selectedIndex < displayedVideos.length - 1) {
          setSelectedIndex(prev => prev + 1);
        }
        break;
      case KEYCODE_ENTER:
        event.preventDefault();
        if (displayedVideos[selectedIndex]) {
          onPlayVideo(displayedVideos[selectedIndex]);
        }
        break;
    }
  });

  const handleVideoClick = useCallback((video, index) => {
    setSelectedIndex(index);
    onPlayVideo(video);
  }, [onPlayVideo]);

  const EmptyIcon = iconMap[emptyIcon] || IconClock;

  if (allVideos.length === 0) {
    return (
      <div className="category-container">
        <Stack p="md" spacing="md">
          <Text size="xl" weight={700} color="white">
            {title}
          </Text>
          <Center py="xl" style={{ minHeight: '50vh' }}>
            <Stack align="center" spacing="md">
              <EmptyIcon size={64} color="#888" />
              <Text color="dimmed" size="lg" align="center">
                {emptyMessage}
              </Text>
              <Text color="dimmed" size="sm" align="center">
                {emptySubtext}
              </Text>
            </Stack>
          </Center>
        </Stack>
      </div>
    );
  }

  return (
    <div className="category-container">
      <Stack p="md" spacing="md">
        <Text size="xl" weight={700} color="white">
          {title}
        </Text>

        <div className={`video-grid ${!sidebarFocused ? 'content-has-focus' : ''}`} ref={gridRef}>
          {displayedVideos.map((video, index) => (
            <div
              key={video.id}
              ref={el => videoRefs.current[index] = el}
            >
              <VideoCard
                video={video}
                isActive={index === selectedIndex}
                onClick={() => handleVideoClick(video, index)}
              />
            </div>
          ))}
        </div>

        {loadingMore && (
          <Center py="md">
            <Loader color="pink" size="sm" />
          </Center>
        )}

        {displayedVideos.length < allVideos.length && !loadingMore && (
          <Center>
            <Text color="dimmed" size="sm">
              Showing {displayedVideos.length} of {allVideos.length} • Scroll down for more
            </Text>
          </Center>
        )}
      </Stack>
    </div>
  );
}
