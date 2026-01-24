import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Stack, Text, Center, Box, Image, Group } from '@mantine/core';
import { useWindowEvent } from '@mantine/hooks';
import { IconPlaylist, IconChevronRight, IconLock, IconWorld, IconClock, IconStar } from '@tabler/icons-react';
import { getUserPlaylists, resolveClaimIds, isLoggedIn } from '../api/odysee';
import VideoCard from './VideoCard';
import { KEYCODE_UP, KEYCODE_DOWN, KEYCODE_LEFT, KEYCODE_RIGHT, KEYCODE_ENTER, KEYCODE_WEBOS_BACK, KEYCODE_ESCAPE } from '../constants';

// Extract claim ID from LBRY URI
function extractClaimIdFromUri(uri) {
  if (!uri) return null;
  const hashIndex = uri.lastIndexOf('#');
  if (hashIndex !== -1) {
    return uri.substring(hashIndex + 1);
  }
  return null;
}

// Get the appropriate icon for a playlist
function getPlaylistIcon(playlist) {
  if (playlist.isBuiltIn) {
    if (playlist.icon === 'clock') return IconClock;
    if (playlist.icon === 'star') return IconStar;
  }
  return IconPlaylist;
}

export default function PlaylistList({
  onPlayVideo,
  onFocusSidebar,
  sidebarFocused,
  isPlayerActive
}) {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playlistIndex, setPlaylistIndex] = useState(0);
  const [videoIndex, setVideoIndex] = useState(0);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [playlistVideos, setPlaylistVideos] = useState([]);
  const [loadingVideos, setLoadingVideos] = useState(false);

  const videoRefs = useRef([]);

  // Fetch playlists from cloud
  useEffect(() => {
    async function loadPlaylists() {
      if (!isLoggedIn()) {
        setLoading(false);
        return;
      }

      try {
        console.log('Loading user playlists...');
        const userPlaylists = await getUserPlaylists();
        console.log('User playlists loaded:', userPlaylists);
        setPlaylists(userPlaylists);
      } catch (err) {
        console.error('Failed to load playlists:', err);
      }
      setLoading(false);
    }
    loadPlaylists();
  }, []);

  // Load videos when a playlist is selected
  useEffect(() => {
    async function loadPlaylistVideos() {
      if (!selectedPlaylist) {
        setPlaylistVideos([]);
        return;
      }

      // For built-in playlists with pre-loaded local videos, use them directly
      if (selectedPlaylist._localVideos && selectedPlaylist._localVideos.length > 0) {
        setPlaylistVideos(selectedPlaylist._localVideos);
        return;
      }

      if (!selectedPlaylist.items || selectedPlaylist.items.length === 0) {
        setPlaylistVideos([]);
        return;
      }

      setLoadingVideos(true);
      try {
        // Check if items are claim IDs (simple strings) or LBRY URIs
        const firstItem = selectedPlaylist.items[0];
        let claimIds;

        if (typeof firstItem === 'string' && firstItem.startsWith('lbry://')) {
          // Items are LBRY URIs, extract claim IDs
          claimIds = selectedPlaylist.items
            .map(extractClaimIdFromUri)
            .filter(id => id != null);
        } else {
          // Items are already claim IDs
          claimIds = selectedPlaylist.items.filter(id => id != null);
        }

        if (claimIds.length > 0) {
          const videos = await resolveClaimIds(claimIds);
          setPlaylistVideos(videos);
        }
      } catch (err) {
        console.error('Failed to load playlist videos:', err);
      }
      setLoadingVideos(false);
    }
    loadPlaylistVideos();
  }, [selectedPlaylist]);

  // Restore scroll position when returning from player
  useEffect(() => {
    if (!isPlayerActive && selectedPlaylist && videoRefs.current[videoIndex]) {
      setTimeout(() => {
        videoRefs.current[videoIndex]?.scrollIntoView({
          behavior: 'instant',
          block: 'nearest',
        });
      }, 50);
    }
  }, [isPlayerActive, selectedPlaylist, videoIndex]);

  // Handle keyboard navigation
  useWindowEvent('keydown', (event) => {
    if (sidebarFocused || isPlayerActive) return;

    const keyCode = event.keyCode.toString();

    // When viewing playlist videos
    if (selectedPlaylist) {
      if (playlistVideos.length === 0) {
        // No videos, just handle back
        if (keyCode === KEYCODE_LEFT || keyCode === KEYCODE_WEBOS_BACK || keyCode === KEYCODE_ESCAPE) {
          event.preventDefault();
          setSelectedPlaylist(null);
        }
        return;
      }

      const columns = 4;
      const currentRow = Math.floor(videoIndex / columns);
      const currentCol = videoIndex % columns;

      switch (keyCode) {
        case KEYCODE_UP:
          event.preventDefault();
          if (currentRow > 0) {
            setVideoIndex(prev => prev - columns);
          }
          break;
        case KEYCODE_DOWN:
          event.preventDefault();
          const nextIndex = videoIndex + columns;
          if (nextIndex < playlistVideos.length) {
            setVideoIndex(nextIndex);
          }
          break;
        case KEYCODE_LEFT:
          event.preventDefault();
          if (currentCol === 0) {
            // Go back to playlist list
            setSelectedPlaylist(null);
          } else {
            setVideoIndex(prev => Math.max(0, prev - 1));
          }
          break;
        case KEYCODE_RIGHT:
          event.preventDefault();
          if (videoIndex < playlistVideos.length - 1) {
            setVideoIndex(prev => prev + 1);
          }
          break;
        case KEYCODE_ENTER:
          event.preventDefault();
          if (playlistVideos[videoIndex]) {
            onPlayVideo(playlistVideos[videoIndex]);
          }
          break;
        case KEYCODE_WEBOS_BACK:
        case KEYCODE_ESCAPE:
          event.preventDefault();
          setSelectedPlaylist(null);
          break;
      }
      return;
    }

    // When viewing playlist list
    switch (keyCode) {
      case KEYCODE_UP:
        event.preventDefault();
        setPlaylistIndex(prev => Math.max(0, prev - 1));
        break;
      case KEYCODE_DOWN:
        event.preventDefault();
        setPlaylistIndex(prev => Math.min(playlists.length - 1, prev + 1));
        break;
      case KEYCODE_LEFT:
        event.preventDefault();
        onFocusSidebar();
        break;
      case KEYCODE_RIGHT:
      case KEYCODE_ENTER:
        event.preventDefault();
        if (playlists[playlistIndex]) {
          setSelectedPlaylist(playlists[playlistIndex]);
          setVideoIndex(0);
        }
        break;
    }
  });

  const handlePlaylistClick = useCallback((playlist, index) => {
    setPlaylistIndex(index);
    setSelectedPlaylist(playlist);
    setVideoIndex(0);
  }, []);

  const handleVideoClick = useCallback((video, index) => {
    setVideoIndex(index);
    onPlayVideo(video);
  }, [onPlayVideo]);

  const handleBack = useCallback(() => {
    setSelectedPlaylist(null);
  }, []);

  // Show playlist videos view
  if (selectedPlaylist) {
    return (
      <div className="category-container">
        <Stack p="md" spacing="md">
          <Group spacing="sm">
            <Text
              size="md"
              color="dimmed"
              style={{ cursor: 'pointer' }}
              onClick={handleBack}
            >
              Playlists
            </Text>
            <IconChevronRight size={18} color="#888" />
            <Text size="xl" weight={700} color="white">
              {selectedPlaylist.name}
            </Text>
          </Group>

          {loadingVideos ? (
            <Center py="xl">
              <Text color="dimmed" size="lg">Loading videos...</Text>
            </Center>
          ) : playlistVideos.length === 0 ? (
            <Center py="xl" style={{ minHeight: '50vh' }}>
              <Stack align="center" spacing="md">
                <IconPlaylist size={83} color="#888" />
                <Text color="dimmed" size="xl" align="center">
                  This playlist is empty
                </Text>
              </Stack>
            </Center>
          ) : (
            <div className={`video-grid ${!sidebarFocused && !isPlayerActive ? 'content-has-focus' : ''}`}>
              {playlistVideos.map((video, index) => (
                <div key={video.id} ref={el => videoRefs.current[index] = el}>
                  <VideoCard
                    video={video}
                    isActive={index === videoIndex}
                    onClick={() => handleVideoClick(video, index)}
                  />
                </div>
              ))}
            </div>
          )}
        </Stack>
      </div>
    );
  }

  // Show loading state
  if (loading) {
    return (
      <div className="category-container">
        <Stack p="md" spacing="md">
          <Text size="xl" weight={700} color="white">
            Playlists
          </Text>
          <Center py="xl">
            <Text color="dimmed" size="lg">Loading playlists...</Text>
          </Center>
        </Stack>
      </div>
    );
  }

  // Show login prompt if not logged in
  if (!isLoggedIn()) {
    return (
      <div className="category-container">
        <Stack p="md" spacing="md">
          <Text size="xl" weight={700} color="white">
            Playlists
          </Text>
          <Center py="xl" style={{ minHeight: '50vh' }}>
            <Stack align="center" spacing="md">
              <IconPlaylist size={83} color="#888" />
              <Text color="dimmed" size="xl" align="center">
                Login to see your playlists
              </Text>
            </Stack>
          </Center>
        </Stack>
      </div>
    );
  }

  // Show empty state
  if (playlists.length === 0) {
    return (
      <div className="category-container">
        <Stack p="md" spacing="md">
          <Text size="xl" weight={700} color="white">
            Playlists
          </Text>
          <Center py="xl" style={{ minHeight: '50vh' }}>
            <Stack align="center" spacing="md">
              <IconPlaylist size={83} color="#888" />
              <Text color="dimmed" size="xl" align="center">
                No playlists yet
              </Text>
              <Text color="dimmed" size="md" align="center">
                Create playlists on odysee.com to see them here
              </Text>
            </Stack>
          </Center>
        </Stack>
      </div>
    );
  }

  // Show playlist list
  const isActive = (index) => !isPlayerActive && index === playlistIndex;

  return (
    <div className="category-container">
      <Stack p="md" spacing="md">
        <Text size="xl" weight={700} color="white">
          Playlists
        </Text>

        <Stack spacing="sm">
          {playlists.map((playlist, index) => (
            <Box
              key={playlist.id}
              className={`playlist-item ${isActive(index) ? 'playlist-item--active' : ''}`}
              onClick={() => handlePlaylistClick(playlist, index)}
              p="lg"
              style={{
                backgroundColor: isActive(index) ? '#333' : '#1a1a1a',
                borderRadius: '10px',
                cursor: 'pointer',
                border: isActive(index) ? '5px solid #de0050' : '5px solid transparent',
                
              }}
            >
              <Group spacing="lg" noWrap>
                {(() => {
                  const PlaylistIcon = getPlaylistIcon(playlist);
                  return playlist.thumbnail ? (
                    <Image
                      src={playlist.thumbnail}
                      width={156}
                      height={88}
                      radius="sm"
                      fit="cover"
                      withPlaceholder
                      placeholder={
                        <Center style={{ width: 156, height: 88, backgroundColor: '#333' }}>
                          <PlaylistIcon size={31} color="#888" />
                        </Center>
                      }
                    />
                  ) : (
                    <Center style={{ width: 156, height: 88, backgroundColor: playlist.isBuiltIn ? '#2a2a3a' : '#333', borderRadius: '5px' }}>
                      <PlaylistIcon size={36} color={playlist.isBuiltIn ? '#de0050' : '#888'} />
                    </Center>
                  );
                })()}
                <Stack spacing={6} style={{ flex: 1 }}>
                  <Group spacing="sm" noWrap>
                    <Text color="white" weight={600} size="lg" lineClamp={1} style={{ flex: 1 }}>
                      {playlist.name}
                    </Text>
                    {!playlist.isBuiltIn && (
                      playlist.isPublished ? (
                        <IconWorld size={18} color="#888" title="Public" />
                      ) : (
                        <IconLock size={18} color="#888" title="Private" />
                      )
                    )}
                  </Group>
                  <Text color="dimmed" size="md">
                    {playlist.itemCount} {playlist.itemCount === 1 ? 'video' : 'videos'}
                  </Text>
                  {playlist.description && !playlist.isBuiltIn && (
                    <Text color="dimmed" size="sm" lineClamp={1}>
                      {playlist.description}
                    </Text>
                  )}
                </Stack>
                <IconChevronRight size={26} color="#888" />
              </Group>
            </Box>
          ))}
        </Stack>
      </Stack>
    </div>
  );
}
