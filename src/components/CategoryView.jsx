import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Stack, Text, Loader, Center } from '@mantine/core';
import { useWindowEvent } from '@mantine/hooks';
import VideoCard from './VideoCard';
import { getVideosByTags, getVideosByChannelIds, getChannelVideos } from '../api/odysee';
import { KEYCODE_UP, KEYCODE_DOWN, KEYCODE_LEFT, KEYCODE_RIGHT, KEYCODE_ENTER } from '../constants';

const ITEMS_PER_PAGE = 20;

export default function CategoryView({ category, onPlayVideo, onFocusSidebar, sidebarFocused }) {
  const [allVideos, setAllVideos] = useState([]);
  const [displayedVideos, setDisplayedVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const videoRefs = useRef([]);
  const gridRef = useRef(null);

  // Calculate actual column count from grid
  const getColumnCount = useCallback(() => {
    if (!gridRef.current || displayedVideos.length === 0) return 4;
    const gridStyle = window.getComputedStyle(gridRef.current);
    const columns = gridStyle.getPropertyValue('grid-template-columns').split(' ').length;
    return columns || 4;
  }, [displayedVideos.length]);

  // Create stable identifiers for category to avoid unnecessary reloads
  const categoryId = category.id;
  const categoryTags = category.tags?.join(',') || '';
  const categoryChannelIds = category.channelIds?.join(',') || '';

  // Load videos for this category
  useEffect(() => {
    async function loadVideos() {
      // Support both tags-based and channelIds-based categories
      const hasTags = category.tags && category.tags.length > 0;
      const hasChannelIds = category.channelIds && category.channelIds.length > 0;

      if (!hasTags && !hasChannelIds) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        let data;
        if (hasChannelIds) {
          // Check if it's a single channel (from search) vs multi-channel category
          if (category.channelIds.length === 1) {
            // Single channel - use getChannelVideos with includeOlder to show all videos
            data = await getChannelVideos(category.channelIds[0], { pageSize: 100, includeOlder: true });
          } else {
            // Multi-channel category from API
            data = await getVideosByChannelIds(category.channelIds, { pageSize: 100 });
          }
        } else {
          // Static category with tags
          data = await getVideosByTags(category.tags, { pageSize: 100 });
        }
        setAllVideos(data);
        // Initially display first page
        setDisplayedVideos(data.slice(0, ITEMS_PER_PAGE));
        setSelectedIndex(0);
      } catch (err) {
        console.error(`Failed to load ${category.label}:`, err);
        setError('Failed to load videos');
      } finally {
        setLoading(false);
      }
    }

    loadVideos();
  }, [categoryId, categoryTags, categoryChannelIds]);

  // Load more videos
  const loadMore = useCallback(() => {
    if (loadingMore || displayedVideos.length >= allVideos.length) return;

    setLoadingMore(true);
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
        <Text color="red" size="xl">{error}</Text>
      </Center>
    );
  }

  if (allVideos.length === 0) {
    return (
      <div className="category-container">
        <Stack p="md" spacing="md">
          <Text size="xl" weight={700} color="white">
            {category.label}
          </Text>
          <Center py="xl">
            <Text color="dimmed" size="lg">No videos found in this category</Text>
          </Center>
        </Stack>
      </div>
    );
  }

  return (
    <div className="category-container">
      <Stack p="md" spacing="md">
        <Text size="xl" weight={700} color="white">
          {category.label}
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
