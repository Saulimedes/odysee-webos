import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Stack, Text, Card, Group } from '@mantine/core';
import { useWindowEvent } from '@mantine/hooks';
import { IconHistory, IconClock, IconStar, IconPlaylist } from '@tabler/icons-react';
import VideoCard from './VideoCard';
import { STORAGE_KEYS, KEYCODE_UP, KEYCODE_DOWN, KEYCODE_LEFT, KEYCODE_RIGHT, KEYCODE_ENTER } from '../constants';

const ALL_SECTIONS = [
  { id: 'playlists', label: 'Playlists', icon: IconPlaylist, isPlaylist: true },
  { id: 'history', label: 'Watch History', icon: IconHistory, storageKey: STORAGE_KEYS.WATCH_HISTORY, hideCount: true },
  { id: 'watch-later', label: 'Watch Later', icon: IconClock, storageKey: STORAGE_KEYS.WATCH_LATER },
  { id: 'favorites', label: 'Favorites', icon: IconStar, storageKey: STORAGE_KEYS.FAVORITES },
];

const PREVIEW_COUNT = 10;

export default function Library({ onFocusSidebar, sidebarFocused, onNavigateToSection, onPlayVideo, isPlayerActive }) {
  // Focus state: 'cards' or 'rows'
  const [focusArea, setFocusArea] = useState('cards');
  // Index within the visible cards (0 to visibleSections.length - 1)
  const [focusedCardIndex, setFocusedCardIndex] = useState(0);
  // Which video row is focused
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);
  // Which video within the row is focused
  const [focusedVideoIndex, setFocusedVideoIndex] = useState(0);
  // Section data
  const [sectionData, setSectionData] = useState({});

  const cardRefs = useRef([]);
  const rowRefs = useRef([]);
  const videoRefs = useRef({});

  // Load preview data for each section
  useEffect(() => {
    const loaded = {};
    ALL_SECTIONS.forEach(section => {
      if (section.isPlaylist) {
        loaded[section.id] = { count: 0, videos: [], thumbnail: null };
        return;
      }
      try {
        const saved = localStorage.getItem(section.storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          const items = Array.isArray(parsed) ? parsed : [];
          const maxItems = section.id === 'history' ? Math.min(items.length, 200) : items.length;
          loaded[section.id] = {
            count: maxItems,
            videos: items.slice(0, PREVIEW_COUNT),
            thumbnail: items[0]?.thumbnail || null,
          };
        } else {
          loaded[section.id] = { count: 0, videos: [], thumbnail: null };
        }
      } catch (err) {
        loaded[section.id] = { count: 0, videos: [], thumbnail: null };
      }
    });
    setSectionData(loaded);
  }, []);

  // Filter to only sections with videos (or playlists which we always show for now)
  const visibleSections = useMemo(() => {
    return ALL_SECTIONS.filter(section => {
      // Always hide playlists for now since they're not implemented
      if (section.isPlaylist) return false;
      const data = sectionData[section.id];
      return data && data.videos && data.videos.length > 0;
    });
  }, [sectionData]);

  // Scroll focused card into view
  useEffect(() => {
    if (focusArea === 'cards' && cardRefs.current[focusedCardIndex]) {
      cardRefs.current[focusedCardIndex].scrollIntoView({ behavior: 'instant', block: 'nearest' });
    }
  }, [focusArea, focusedCardIndex]);

  // Scroll focused row into view
  useEffect(() => {
    if (focusArea === 'rows' && rowRefs.current[focusedRowIndex]) {
      rowRefs.current[focusedRowIndex].scrollIntoView({ behavior: 'instant', block: 'nearest' });
    }
  }, [focusArea, focusedRowIndex]);

  // Scroll focused video into view
  useEffect(() => {
    const section = visibleSections[focusedRowIndex];
    const sectionId = section?.id;
    if (focusArea === 'rows' && sectionId && videoRefs.current[sectionId]?.[focusedVideoIndex]) {
      videoRefs.current[sectionId][focusedVideoIndex].scrollIntoView({
        behavior: 'instant',
        block: 'nearest',
        inline: 'nearest'
      });
    }
  }, [focusArea, focusedRowIndex, focusedVideoIndex, visibleSections]);

  // Handle keyboard navigation
  useWindowEvent('keydown', (event) => {
    if (sidebarFocused || isPlayerActive) return;
    if (visibleSections.length === 0) return;

    const keyCode = event.keyCode.toString();

    if (focusArea === 'cards') {
      switch (keyCode) {
        case KEYCODE_LEFT:
          event.preventDefault();
          if (focusedCardIndex === 0) {
            onFocusSidebar();
          } else {
            setFocusedCardIndex(prev => prev - 1);
          }
          break;
        case KEYCODE_RIGHT:
          event.preventDefault();
          if (focusedCardIndex < visibleSections.length - 1) {
            setFocusedCardIndex(prev => prev + 1);
          }
          break;
        case KEYCODE_DOWN:
          event.preventDefault();
          setFocusArea('rows');
          // Go to the corresponding row (same index as the card)
          const targetRow = Math.min(focusedCardIndex, visibleSections.length - 1);
          setFocusedRowIndex(targetRow);
          setFocusedVideoIndex(0);
          break;
        case KEYCODE_ENTER:
          event.preventDefault();
          if (onNavigateToSection && visibleSections[focusedCardIndex]) {
            onNavigateToSection(visibleSections[focusedCardIndex].id);
          }
          break;
      }
    } else if (focusArea === 'rows') {
      const currentSection = visibleSections[focusedRowIndex];
      const currentVideos = sectionData[currentSection?.id]?.videos || [];

      switch (keyCode) {
        case KEYCODE_UP:
          event.preventDefault();
          if (focusedRowIndex === 0) {
            // Go back to cards, try to match position
            setFocusArea('cards');
            setFocusedCardIndex(Math.min(focusedVideoIndex, visibleSections.length - 1));
          } else {
            // Move to previous row, maintain video index (clamped to available videos)
            const prevRowIndex = focusedRowIndex - 1;
            const prevSection = visibleSections[prevRowIndex];
            const prevVideos = sectionData[prevSection?.id]?.videos || [];
            setFocusedRowIndex(prevRowIndex);
            setFocusedVideoIndex(Math.min(focusedVideoIndex, prevVideos.length - 1));
          }
          break;
        case KEYCODE_DOWN:
          event.preventDefault();
          if (focusedRowIndex < visibleSections.length - 1) {
            // Move to next row, maintain video index (clamped to available videos)
            const nextRowIndex = focusedRowIndex + 1;
            const nextSection = visibleSections[nextRowIndex];
            const nextVideos = sectionData[nextSection?.id]?.videos || [];
            setFocusedRowIndex(nextRowIndex);
            setFocusedVideoIndex(Math.min(focusedVideoIndex, Math.max(0, nextVideos.length - 1)));
          }
          break;
        case KEYCODE_LEFT:
          event.preventDefault();
          if (focusedVideoIndex === 0) {
            onFocusSidebar();
          } else {
            setFocusedVideoIndex(prev => prev - 1);
          }
          break;
        case KEYCODE_RIGHT:
          event.preventDefault();
          if (focusedVideoIndex < currentVideos.length - 1) {
            setFocusedVideoIndex(prev => prev + 1);
          }
          break;
        case KEYCODE_ENTER:
          event.preventDefault();
          if (currentVideos[focusedVideoIndex] && onPlayVideo) {
            onPlayVideo(currentVideos[focusedVideoIndex]);
          }
          break;
      }
    }
  });

  const handleCardClick = useCallback((index) => {
    setFocusArea('cards');
    setFocusedCardIndex(index);
    if (onNavigateToSection && visibleSections[index]) {
      onNavigateToSection(visibleSections[index].id);
    }
  }, [onNavigateToSection, visibleSections]);

  const handleVideoClick = useCallback((rowIndex, videoIndex, video) => {
    setFocusArea('rows');
    setFocusedRowIndex(rowIndex);
    setFocusedVideoIndex(videoIndex);
    if (onPlayVideo) {
      onPlayVideo(video);
    }
  }, [onPlayVideo]);

  // Get subtitle text for a section
  const getSubtitle = (section) => {
    const data = sectionData[section.id] || { count: 0 };
    if (section.isPlaylist) return 'Your playlists';
    if (section.hideCount) return 'Your watch history';
    return `${data.count} video${data.count !== 1 ? 's' : ''}`;
  };

  // Show empty state if no sections have videos
  if (visibleSections.length === 0) {
    return (
      <div className="category-container">
        <Stack p="md" spacing="lg">
          <Text size="xl" weight={700} color="white">
            Library
          </Text>
          <Stack align="center" spacing="md" py="xl">
            <IconHistory size={83} color="#666" />
            <Text color="dimmed" size="xl">Your library is empty</Text>
            <Text color="dimmed" size="md">Videos you watch, save, or favorite will appear here</Text>
          </Stack>
        </Stack>
      </div>
    );
  }

  return (
    <div className="category-container">
      <Stack p="md" spacing="lg">
        <Text size="xl" weight={700} color="white">
          Library
        </Text>

        {/* Top row: rectangular cards for sections with videos */}
        <div className="library-cards-row" style={{
          display: 'flex',
          gap: '26px',
          overflowX: 'auto',
          paddingBottom: '10px',
          paddingTop: '5px',
          paddingLeft: '5px',
          paddingRight: '20px',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}>
          {visibleSections.map((section, index) => {
            const Icon = section.icon;
            const data = sectionData[section.id] || { count: 0, thumbnail: null };
            const isSelected = focusArea === 'cards' && focusedCardIndex === index;

            return (
              <Card
                key={section.id}
                ref={el => cardRefs.current[index] = el}
                className={`library-card ${isSelected ? 'library-card--active' : ''}`}
                p="lg"
                radius="md"
                style={{
                  backgroundColor: '#1a1a1a',
                  border: isSelected ? '5px solid #de0050' : '5px solid #333',
                  cursor: 'pointer',
                  
                  minWidth: '655px',
                  flexShrink: 0,
                }}
                onClick={() => handleCardClick(index)}
              >
                <Group spacing="xl" noWrap>
                  {/* Thumbnail on the left */}
                  <div
                    style={{
                      width: 260,
                      height: 146,
                      backgroundColor: '#222',
                      borderRadius: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      flexShrink: 0,
                    }}
                  >
                    {data.thumbnail ? (
                      <img
                        src={data.thumbnail}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        loading="lazy"
                      />
                    ) : (
                      <Icon size={62} color="#666" />
                    )}
                  </div>
                  {/* Text on the right */}
                  <Stack spacing={8} style={{ flex: 1, minWidth: 0 }}>
                    <Text color="white" weight={600} size="xl">
                      {section.label}
                    </Text>
                    <Text color="dimmed" size="lg">
                      {getSubtitle(section)}
                    </Text>
                  </Stack>
                </Group>
              </Card>
            );
          })}
        </div>

        {/* Video rows for each visible section */}
        {visibleSections.map((section, rowIndex) => {
          const data = sectionData[section.id] || { count: 0, videos: [] };

          // Initialize refs for this section
          if (!videoRefs.current[section.id]) {
            videoRefs.current[section.id] = [];
          }

          return (
            <div
              key={section.id}
              ref={el => rowRefs.current[rowIndex] = el}
            >
              <Text color="white" weight={600} size="lg" mb="sm">
                {section.label}
              </Text>
              <div className="library-video-row">
                {data.videos.map((video, videoIndex) => {
                  const isVideoSelected = focusArea === 'rows' &&
                    focusedRowIndex === rowIndex &&
                    focusedVideoIndex === videoIndex;

                  return (
                    <div
                      key={video.id}
                      ref={el => videoRefs.current[section.id][videoIndex] = el}
                      style={{ flexShrink: 0 }}
                    >
                      <VideoCard
                        video={video}
                        isActive={isVideoSelected}
                        onClick={() => handleVideoClick(rowIndex, videoIndex, video)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </Stack>
    </div>
  );
}
