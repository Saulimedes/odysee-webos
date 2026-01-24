import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Stack, Text, Loader, Center, Avatar, Box, ScrollArea } from '@mantine/core';
import { useWindowEvent } from '@mantine/hooks';
import { IconHeart, IconMenu2 } from '@tabler/icons-react';
import VideoCard from './VideoCard';
import { getSubscriptions, getFollowingVideos, getChannelVideos, resolveChannelIds, isLoggedIn, limitConcurrency } from '../api/odysee';
import { KEYCODE_UP, KEYCODE_DOWN, KEYCODE_LEFT, KEYCODE_RIGHT, KEYCODE_ENTER, KEYCODE_WEBOS_BACK, KEYCODE_ESCAPE } from '../constants';

// Number of channels to resolve initially (visible area)
const INITIAL_CHANNELS_TO_RESOLVE = 15;

export default function Following({ onPlayVideo, onFocusSidebar, sidebarFocused, isPlayerActive }) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [sortedSubscriptions, setSortedSubscriptions] = useState([]);
  const [resolvedChannels, setResolvedChannels] = useState({});
  const [channelActivity, setChannelActivity] = useState({});
  const [channelThumbnailsFromVideos, setChannelThumbnailsFromVideos] = useState({});
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [error, setError] = useState(null);
  const [selectedChannelIndex, setSelectedChannelIndex] = useState(0); // 0 = "All"
  const [selectedVideoIndex, setSelectedVideoIndex] = useState(0);
  const [focusArea, setFocusArea] = useState('channels'); // 'channels' or 'videos'
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [includeOlder, setIncludeOlder] = useState(false);
  const [avatarErrors, setAvatarErrors] = useState({});

  // Refs for scrolling
  const channelItemRefs = useRef([]);
  const videoItemRefs = useRef([]);
  const scrollAreaRef = useRef(null);
  const videoScrollAreaRef = useRef(null);
  const videoGridRef = useRef(null);

  // Calculate actual column count from grid
  const getColumnCount = useCallback(() => {
    if (!videoGridRef.current || videos.length === 0) return 3;
    const gridStyle = window.getComputedStyle(videoGridRef.current);
    const columns = gridStyle.getPropertyValue('grid-template-columns').split(' ').length;
    return columns || 3;
  }, [videos.length]);

  // Load subscriptions and initial videos
  useEffect(() => {
    async function loadData() {
      if (!isLoggedIn()) {
        setError('Please log in to see channels you follow');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Load subscriptions
        const subs = await getSubscriptions();
        setSubscriptions(subs);

        // Resolve channel details incrementally - first batch only for faster initial load
        let channelMap = {};
        if (subs.length > 0) {
          const channelIds = subs.map(s => s.claim_id).filter(Boolean);
          if (channelIds.length > 0) {
            // Only resolve first batch initially
            const initialBatch = channelIds.slice(0, INITIAL_CHANNELS_TO_RESOLVE);
            const channels = await resolveChannelIds(initialBatch);
            channels.forEach(ch => {
              channelMap[ch.id] = ch;
            });
            setResolvedChannels(channelMap);

            // Resolve remaining channels in background (if any)
            if (channelIds.length > INITIAL_CHANNELS_TO_RESOLVE) {
              const remainingIds = channelIds.slice(INITIAL_CHANNELS_TO_RESOLVE);
              // Resolve in batches of 10 to not overwhelm
              const batchSize = 10;
              const batches = [];
              for (let i = 0; i < remainingIds.length; i += batchSize) {
                batches.push(remainingIds.slice(i, i + batchSize));
              }

              // Resolve batches with limited concurrency
              limitConcurrency(
                batches.map(batch => async () => {
                  const resolved = await resolveChannelIds(batch);
                  setResolvedChannels(prev => {
                    const updated = { ...prev };
                    resolved.forEach(ch => {
                      updated[ch.id] = ch;
                    });
                    return updated;
                  });
                }),
                2 // Max 2 concurrent batch resolutions
              );
            }
          }
        }

        // Load all videos initially
        const data = await getFollowingVideos({ pageSize: 40 });
        setVideos(data);

        // Sort subscriptions by most recent video activity
        if (data.length > 0 && subs.length > 0) {
          // Build map of channel_id -> most recent video releaseTime
          // Also extract channel thumbnails from videos as fallback
          const activityMap = {};
          const thumbnailMap = {};
          data.forEach(video => {
            const channelId = video.channelId;
            const videoTime = video.releaseTime || 0;
            if (channelId) {
              if (!activityMap[channelId] || videoTime > activityMap[channelId]) {
                activityMap[channelId] = videoTime;
              }
              // Store channel thumbnail from video if not already stored
              if (video.channelThumbnail && !thumbnailMap[channelId]) {
                thumbnailMap[channelId] = video.channelThumbnail;
              }
            }
          });
          setChannelActivity(activityMap);
          setChannelThumbnailsFromVideos(thumbnailMap);

          // Sort subscriptions: channels with recent videos first, then others
          const sorted = [...subs].sort((a, b) => {
            const aTime = activityMap[a.claim_id] || 0;
            const bTime = activityMap[b.claim_id] || 0;
            return bTime - aTime; // Most recent first
          });
          setSortedSubscriptions(sorted);
        } else {
          setSortedSubscriptions(subs);
        }
      } catch (err) {
        console.error('Failed to load following data:', err);
        setError('Failed to load subscriptions');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const PAGE_SIZE = 20;

  // Load videos when channel selection changes
  useEffect(() => {
    async function loadChannelVideos() {
      if (loading) return;

      setLoadingVideos(true);
      setPage(1);
      setHasMore(true);
      setIncludeOlder(false);
      try {
        let data;
        let usingOlder = false;
        if (selectedChannelIndex === 0) {
          // "All" selected - load from all channels
          data = await getFollowingVideos({ pageSize: PAGE_SIZE, page: 1 });
        } else {
          // Specific channel selected
          const channelId = sortedSubscriptions[selectedChannelIndex - 1]?.claim_id;
          if (channelId) {
            // First try recent videos
            data = await getChannelVideos(channelId, { pageSize: PAGE_SIZE, page: 1 });
            // If no recent videos, try loading older ones
            if (!data || data.length === 0) {
              data = await getChannelVideos(channelId, { pageSize: PAGE_SIZE, page: 1, includeOlder: true });
              usingOlder = true;
            }
          } else {
            data = [];
          }
        }
        setVideos(data || []);
        setIncludeOlder(usingOlder);
        setHasMore((data || []).length >= PAGE_SIZE);
        setSelectedVideoIndex(0);

        // Extract channel thumbnail from loaded videos if we don't have one yet
        if (data && data.length > 0) {
          const firstVideo = data[0];
          if (firstVideo.channelId && firstVideo.channelThumbnail) {
            setChannelThumbnailsFromVideos(prev => {
              if (!prev[firstVideo.channelId]) {
                return { ...prev, [firstVideo.channelId]: firstVideo.channelThumbnail };
              }
              return prev;
            });
          }
        }
      } catch (err) {
        console.error('Failed to load channel videos:', err);
      } finally {
        setLoadingVideos(false);
      }
    }

    loadChannelVideos();
  }, [selectedChannelIndex, sortedSubscriptions, loading]);

  // Load more videos (lazy loading)
  const loadMoreVideos = useCallback(async () => {
    if (loadingMore || !hasMore || loadingVideos) return;

    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      let data;
      if (selectedChannelIndex === 0) {
        data = await getFollowingVideos({ pageSize: PAGE_SIZE, page: nextPage });
      } else {
        const channelId = sortedSubscriptions[selectedChannelIndex - 1]?.claim_id;
        if (channelId) {
          data = await getChannelVideos(channelId, { pageSize: PAGE_SIZE, page: nextPage, includeOlder });
        } else {
          data = [];
        }
      }
      if (data && data.length > 0) {
        setVideos(prev => [...prev, ...data]);
        setPage(nextPage);
        setHasMore(data.length >= PAGE_SIZE);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error('Failed to load more videos:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, loadingVideos, page, selectedChannelIndex, sortedSubscriptions, includeOlder]);

  // Scroll selected channel into view
  useEffect(() => {
    if (focusArea === 'channels' && channelItemRefs.current[selectedChannelIndex]) {
      channelItemRefs.current[selectedChannelIndex].scrollIntoView({
        behavior: 'instant',
        block: 'nearest',
      });
    }
  }, [selectedChannelIndex, focusArea]);

  // Scroll selected video into view
  useEffect(() => {
    if (focusArea === 'videos' && videoItemRefs.current[selectedVideoIndex]) {
      videoItemRefs.current[selectedVideoIndex].scrollIntoView({
        behavior: 'instant',
        block: 'nearest',
      });
    }
  }, [selectedVideoIndex, focusArea]);

  // Restore scroll position when returning from player
  useEffect(() => {
    if (!isPlayerActive) {
      setTimeout(() => {
        if (focusArea === 'videos' && videoItemRefs.current[selectedVideoIndex]) {
          videoItemRefs.current[selectedVideoIndex]?.scrollIntoView({
            behavior: 'instant',
            block: 'nearest',
          });
        } else if (focusArea === 'channels' && channelItemRefs.current[selectedChannelIndex]) {
          channelItemRefs.current[selectedChannelIndex]?.scrollIntoView({
            behavior: 'instant',
            block: 'nearest',
          });
        }
      }, 50);
    }
  }, [isPlayerActive, focusArea, selectedVideoIndex, selectedChannelIndex]);

  // Total channel items (All + sortedSubscriptions)
  const totalChannelItems = 1 + sortedSubscriptions.length;

  // Handle keyboard navigation
  useWindowEvent('keydown', (event) => {
    if (sidebarFocused || isPlayerActive) return;

    const keyCode = event.keyCode.toString();

    if (focusArea === 'channels') {
      // Navigation in channel sidebar
      switch (keyCode) {
        case KEYCODE_UP:
          event.preventDefault();
          setSelectedChannelIndex(prev => Math.max(0, prev - 1));
          break;
        case KEYCODE_DOWN:
          event.preventDefault();
          setSelectedChannelIndex(prev => Math.min(totalChannelItems - 1, prev + 1));
          break;
        case KEYCODE_LEFT:
          event.preventDefault();
          onFocusSidebar();
          break;
        case KEYCODE_RIGHT:
        case KEYCODE_ENTER:
          event.preventDefault();
          if (videos.length > 0) {
            setFocusArea('videos');
            setSelectedVideoIndex(0);
          }
          break;
      }
    } else {
      // Navigation in video grid
      const columns = getColumnCount();
      const currentRow = Math.floor(selectedVideoIndex / columns);
      const currentCol = selectedVideoIndex % columns;

      switch (keyCode) {
        case KEYCODE_UP:
          event.preventDefault();
          if (currentRow > 0) {
            // Move up one row, staying in same column
            const newIndex = selectedVideoIndex - columns;
            setSelectedVideoIndex(Math.max(0, newIndex));
          }
          break;
        case KEYCODE_DOWN:
          event.preventDefault();
          {
            const nextIndex = selectedVideoIndex + columns;
            if (nextIndex < videos.length) {
              setSelectedVideoIndex(nextIndex);
              // Load more when approaching the end (within last 2 rows)
              const totalRows = Math.ceil(videos.length / columns);
              const nextRow = Math.floor(nextIndex / columns);
              if (nextRow >= totalRows - 2 && hasMore && !loadingMore) {
                loadMoreVideos();
              }
            } else if (hasMore && !loadingMore) {
              // At the end, try to load more
              loadMoreVideos();
            }
          }
          break;
        case KEYCODE_LEFT:
          event.preventDefault();
          if (currentCol === 0) {
            setFocusArea('channels');
          } else {
            setSelectedVideoIndex(prev => Math.max(0, prev - 1));
          }
          break;
        case KEYCODE_RIGHT:
          event.preventDefault();
          if (currentCol < columns - 1 && selectedVideoIndex < videos.length - 1) {
            setSelectedVideoIndex(prev => prev + 1);
          }
          break;
        case KEYCODE_ENTER:
          event.preventDefault();
          if (videos[selectedVideoIndex]) {
            onPlayVideo(videos[selectedVideoIndex]);
          }
          break;
        case KEYCODE_WEBOS_BACK:
        case KEYCODE_ESCAPE:
          event.preventDefault();
          setFocusArea('channels');
          break;
      }
    }
  });

  const handleChannelClick = useCallback((index) => {
    setSelectedChannelIndex(index);
    setFocusArea('channels');
  }, []);

  const handleVideoClick = useCallback((video, index) => {
    setSelectedVideoIndex(index);
    onPlayVideo(video);
  }, [onPlayVideo]);

  // Get channel info helper
  const getChannelInfo = (subscription) => {
    const resolved = resolvedChannels[subscription.claim_id];
    // Use resolved thumbnail, or fall back to thumbnail extracted from videos
    const thumbnail = resolved?.thumbnail || channelThumbnailsFromVideos[subscription.claim_id] || null;
    return {
      id: subscription.claim_id,
      name: resolved?.name || subscription.channel_name?.replace('@', '') || 'Unknown',
      title: resolved?.title || subscription.channel_name?.replace('@', '') || 'Unknown',
      thumbnail,
    };
  };

  // Check if channel has recent updates (within last 48 hours)
  const hasRecentUpdates = (channelId) => {
    const lastActivity = channelActivity[channelId];
    if (!lastActivity) return false;
    const now = Math.floor(Date.now() / 1000);
    const twoDaysAgo = now - (48 * 60 * 60); // 48 hours in seconds
    return lastActivity > twoDaysAgo;
  };

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
          <IconHeart size={64} color="#888" />
          <Text color="dimmed" size="lg" align="center">{error}</Text>
        </Stack>
      </Center>
    );
  }

  const isChannelsFocused = !sidebarFocused && focusArea === 'channels';
  const isVideosFocused = !sidebarFocused && focusArea === 'videos';

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Secondary Sidebar - Subscriptions */}
      <Box
        className="following-sidebar"
        style={{
          width: isVideosFocused ? '0' : 'auto',
          minWidth: isVideosFocused ? '0' : '450px',
          backgroundColor: '#000000',
          borderRight: isVideosFocused ? 'none' : '1px solid #333',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
          {/* Header */}
          <Box p="md">
            <Text size="lg" weight={700} color="white">
              Following
            </Text>
          </Box>

          {/* Channel List */}
          <ScrollArea style={{ flex: 1 }} offsetScrollbars ref={scrollAreaRef}>
            <Stack spacing={0} p="xs">
              {/* All option */}
              <Box
                ref={el => channelItemRefs.current[0] = el}
                onClick={() => handleChannelClick(0)}
                p="sm"
                className={`following-channel-item ${selectedChannelIndex === 0 ? 'following-channel-item--selected' : ''}`}
                style={{
                  borderRadius: '8px',
                  cursor: 'pointer',
                  
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <IconMenu2 size={40} color={selectedChannelIndex === 0 ? '#de0050' : '#888'} style={{ marginRight: '12px' }} />
                  <Text color={selectedChannelIndex === 0 ? '#de0050' : 'white'} weight={600} className="sidebar-item-label">
                    All
                  </Text>
                </div>
              </Box>

              {/* Subscription list */}
              {sortedSubscriptions.map((sub, index) => {
                const channel = getChannelInfo(sub);
                const itemIndex = index + 1;
                const isSelected = selectedChannelIndex === itemIndex;
                const isRecent = hasRecentUpdates(channel.id);

                return (
                  <Box
                    key={channel.id || index}
                    ref={el => channelItemRefs.current[itemIndex] = el}
                    onClick={() => handleChannelClick(itemIndex)}
                    p="sm"
                    className={`following-channel-item ${isSelected ? 'following-channel-item--selected' : ''}`}
                    style={{
                      borderRadius: '8px',
                      cursor: 'pointer',
                      
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', maxWidth: '320px' }}>
                      <div style={{ position: 'relative', flexShrink: 0, marginRight: '12px' }}>
                        <Avatar
                          src={!avatarErrors[channel.id] ? channel.thumbnail : null}
                          size={40}
                          radius="xl"
                          color="pink"
                          onError={() => setAvatarErrors(prev => ({ ...prev, [channel.id]: true }))}
                        >
                          {channel.title?.charAt(0)?.toUpperCase() || 'C'}
                        </Avatar>
                        {isRecent && (
                          <div
                            style={{
                              position: 'absolute',
                              top: 0,
                              right: 0,
                              width: '10px',
                              height: '10px',
                              backgroundColor: '#de0050',
                              borderRadius: '50%',
                              border: '2px solid #000',
                            }}
                          />
                        )}
                      </div>
                      <Text
                        color={isSelected ? '#de0050' : 'white'}
                        weight={500}
                        className="sidebar-item-label"
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '260px',
                        }}
                      >
                        {channel.title}
                      </Text>
                    </div>
                  </Box>
                );
              })}
            </Stack>
          </ScrollArea>
        </Box>

      {/* Main Content - Videos */}
      <Box style={{ flex: 1, overflow: 'hidden' }}>
        <ScrollArea style={{ height: '100vh' }} scrollbarSize={0}>
          <Stack p="md" spacing="md">
            {/* Title showing current selection */}
            <Text size="xl" weight={700} color="white">
              {selectedChannelIndex === 0
                ? 'Following'
                : getChannelInfo(sortedSubscriptions[selectedChannelIndex - 1])?.title || 'Channel'}
            </Text>

            {loadingVideos ? (
              <Center style={{ height: '70vh' }}>
                <Loader color="pink" size="xl" />
              </Center>
            ) : videos.length === 0 ? (
              <Center py="xl">
                <Stack align="center" spacing="md">
                  <IconHeart size={64} color="#888" />
                  <Text color="dimmed" size="lg" align="center">
                    No recent videos
                  </Text>
                </Stack>
              </Center>
            ) : (
              <>
                <div className="following-video-grid" ref={videoGridRef}>
                  {videos.map((video, index) => (
                    <div
                      key={video.id}
                      ref={el => videoItemRefs.current[index] = el}
                    >
                      <VideoCard
                        video={video}
                        isActive={index === selectedVideoIndex}
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
              </>
            )}
          </Stack>
        </ScrollArea>
      </Box>
    </div>
  );
}
