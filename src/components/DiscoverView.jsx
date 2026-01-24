import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Stack, Text, Loader, Center } from '@mantine/core';
import { useWindowEvent } from '@mantine/hooks';
import { IconBulb } from '@tabler/icons-react';
import VideoCard from './VideoCard';
import { getExploreVideos } from '../api/odysee';
import { KEYCODE_UP, KEYCODE_DOWN, KEYCODE_LEFT, KEYCODE_RIGHT, KEYCODE_ENTER } from '../constants';

const PAGE_SIZE = 40;

export default function DiscoverView({ onPlayVideo, onFocusSidebar, sidebarFocused }) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const videoRefs = useRef([]);
  const gridRef = useRef(null);

  // Calculate actual column count from grid
  const getColumnCount = useCallback(() => {
    if (!gridRef.current || videos.length === 0) return 4;
    const gridStyle = window.getComputedStyle(gridRef.current);
    const columns = gridStyle.getPropertyValue('grid-template-columns').split(' ').length;
    return columns || 4;
  }, [videos.length]);

  // Load discover/explore videos (trending content from across Odysee)
  useEffect(() => {
    async function loadDiscover() {
      setLoading(true);
      setError(null);

      try {
        const data = await getExploreVideos({
          pageSize: PAGE_SIZE,
          page: 1,
          orderBy: 'trending',
          daysOfContent: 30, // Last 30 days of content
        });

        setVideos(data || []);
        setHasMore((data || []).length >= PAGE_SIZE);
        setSelectedIndex(0);
      } catch (err) {
        console.error('Failed to load discover:', err);
        setError('Failed to load discover content');
      } finally {
        setLoading(false);
      }
    }

    loadDiscover();
  }, []);

  // Load more videos
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const moreVideos = await getExploreVideos({
        pageSize: PAGE_SIZE,
        page: nextPage,
        orderBy: 'trending',
        daysOfContent: 30,
      });

      if (moreVideos && moreVideos.length > 0) {
        setVideos(prev => {
          // Deduplicate by claim ID - more efficient with Set
          const existingIds = new Set(prev.map(v => v.id));
          const newVideos = moreVideos.filter(v => !existingIds.has(v.id));
          return [...prev, ...newVideos];
        });
        setPage(nextPage);
        setHasMore(moreVideos.length >= PAGE_SIZE);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error('Failed to load more discover:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page]);

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
    if (sidebarFocused) return;

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
          if (nextIndex < videos.length) {
            setSelectedIndex(nextIndex);
            // Load more when approaching the end
            const totalRows = Math.ceil(videos.length / columns);
            const nextRow = Math.floor(nextIndex / columns);
            if (nextRow >= totalRows - 2 && hasMore && !loadingMore) {
              loadMore();
            }
          } else if (hasMore && !loadingMore) {
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
        if (currentCol < columns - 1 && selectedIndex < videos.length - 1) {
          setSelectedIndex(prev => prev + 1);
        }
        break;
      case KEYCODE_ENTER:
        event.preventDefault();
        if (videos[selectedIndex]) {
          onPlayVideo(videos[selectedIndex]);
        }
        break;
    }
  });

  if (loading) {
    return (
      <Center style={{ height: '100vh' }}>
        <Loader color="pink" size="xl" />
      </Center>
    );
  }

  if (error) {
    return (
      <Center style={{ height: '100vh' }}>
        <Stack align="center" spacing="md">
          <IconBulb size={64} color="#888" />
          <Text color="dimmed" size="lg" align="center">{error}</Text>
        </Stack>
      </Center>
    );
  }

  return (
    <Stack p="md" spacing="md" style={{ height: '100vh', overflowY: 'auto', overflowX: 'hidden' }}>
      <Text size="xl" weight={700} color="white">Discover</Text>
      <Text size="sm" color="dimmed">Trending videos on Odysee</Text>

      {videos.length === 0 ? (
        <Center py="xl">
          <Stack align="center" spacing="md">
            <IconBulb size={64} color="#888" />
            <Text color="dimmed" size="lg" align="center">No discover content</Text>
          </Stack>
        </Center>
      ) : (
        <>
          <div className={`following-video-grid ${!sidebarFocused ? 'content-has-focus' : ''}`} ref={gridRef}>
            {videos.map((video, index) => (
              <div key={video.id} ref={el => videoRefs.current[index] = el}>
                <VideoCard
                  video={video}
                  isActive={index === selectedIndex}
                  onClick={() => {
                    setSelectedIndex(index);
                    onPlayVideo(video);
                  }}
                />
              </div>
            ))}
          </div>
          {loadingMore && (
            <Center py="md">
              <Loader color="pink" size="sm" />
            </Center>
          )}
        </>
      )}
    </Stack>
  );
}
