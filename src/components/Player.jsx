import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Text, Group, ActionIcon, Slider, Stack, Avatar } from '@mantine/core';
import { useWindowEvent } from '@mantine/hooks';
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconPlayerTrackNext,
  IconPlayerTrackPrev,
  IconVolume,
  IconVolumeOff,
  IconArrowLeft,
  IconHeart,
  IconHeartFilled,
  IconClock,
  IconClockFilled,
  IconStar,
  IconStarFilled,
} from '@tabler/icons-react';
import { IconFire, IconSlime } from './OdyseeIcons';
import {
  formatDuration,
  isLoggedIn,
  isFollowingChannel,
  followChannel,
  unfollowChannel,
  getReactions,
  reactToClaim,
  removeReaction,
  getRelatedVideos,
  preloadVideo,
  getStreamUrlWithQuality,
} from '../api/odysee';
import {
  addToWatchLater, removeFromWatchLater, isInWatchLater,
  addToFavorites, removeFromFavorites, isInFavorites,
  addToWatchHistory
} from './Watchlist';
import {
  KEYCODE_WEBOS_BACK, KEYCODE_ESCAPE, KEYCODE_ENTER,
  KEYCODE_LEFT, KEYCODE_RIGHT, KEYCODE_UP, KEYCODE_DOWN,
  KEYCODE_PLAY, KEYCODE_PAUSE, KEYCODE_STOP, KEYCODE_REWIND,
  KEYCODE_FAST_FORWARD, KEYCODE_PLAY_PAUSE, KEYCODE_MEDIA_PLAY_PAUSE,
  STORAGE_KEYS
} from '../constants';

// Control items for navigation (left to right in bottom bar) - progress bar is separate row
const CONTROL_ITEMS = ['channel', 'follow', 'favorites', 'watchLater', 'skipBack', 'play', 'skipForward', 'like', 'dislike'];

export default function Player({ video, onClose, onNavigateToChannel, user, onPlayNext }) {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState(null);
  const [focusedControl, setFocusedControl] = useState('play');
  const [focusRow, setFocusRow] = useState('buttons'); // 'topbar', 'progress', or 'buttons'
  const controlsTimeout = useRef(null);
  const lastTimeUpdate = useRef(0);

  // Reaction states
  const [isFollowing, setIsFollowing] = useState(false);
  const [hasLiked, setHasLiked] = useState(false);
  const [hasDisliked, setHasDisliked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [dislikeCount, setDislikeCount] = useState(0);

  // Watch Later and Favorites states
  const [isInWatchLaterState, setIsInWatchLaterState] = useState(false);
  const [isInFavoritesState, setIsInFavoritesState] = useState(false);

  // Autoplay and next video states
  const [nextVideo, setNextVideo] = useState(null);
  const [autoplayEnabled, setAutoplayEnabled] = useState(true);

  // Refs to access current values in event handlers (avoids stale closure)
  const autoplayEnabledRef = useRef(true);
  const nextVideoRef = useRef(null);
  const onPlayNextRef = useRef(onPlayNext);
  const onCloseRef = useRef(onClose);

  const loggedIn = user && isLoggedIn();

  // Load autoplay setting from localStorage
  useEffect(() => {
    try {
      const settings = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '{}');
      // Default to true if not set
      const enabled = settings.autoplay !== false;
      setAutoplayEnabled(enabled);
      autoplayEnabledRef.current = enabled;
    } catch (err) {
      setAutoplayEnabled(true);
      autoplayEnabledRef.current = true;
    }
  }, []);

  // Keep refs in sync with state/props
  useEffect(() => {
    nextVideoRef.current = nextVideo;
  }, [nextVideo]);

  useEffect(() => {
    onPlayNextRef.current = onPlayNext;
  }, [onPlayNext]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Fetch related videos and preload the next one
  useEffect(() => {
    async function loadRelatedVideos() {
      if (!video || !video.channelId) return;

      try {
        const related = await getRelatedVideos(video, { pageSize: 5 });
        if (related && related.length > 0) {
          setNextVideo(related[0]);
          // Preload the next video for faster playback
          preloadVideo(related[0]);
        }
      } catch (err) {
        console.error('Failed to load related videos:', err);
      }
    }

    loadRelatedVideos();
  }, [video]);

  // Check bookmark states
  useEffect(() => {
    setIsInWatchLaterState(isInWatchLater(video.id));
    setIsInFavoritesState(isInFavorites(video.id));
  }, [video.id]);

  // Load initial states
  useEffect(() => {
    async function loadStates() {
      if (video.channelId && loggedIn) {
        const following = await isFollowingChannel(video.channelId);
        setIsFollowing(following);
      }

      // Get reactions
      const reactions = await getReactions(video.id);
      setLikeCount(reactions.likes);
      setDislikeCount(reactions.dislikes);
      if (reactions.myReaction) {
        setHasLiked(reactions.myReaction === 'like');
        setHasDisliked(reactions.myReaction === 'dislike');
      }
    }
    loadStates();
  }, [video.id, video.channelId, loggedIn]);

  // Auto-hide controls
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeout.current) {
      clearTimeout(controlsTimeout.current);
    }
    controlsTimeout.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 4000);
  }, [isPlaying]);

  // Start playing when component mounts
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !video) return;

    // Get quality setting from localStorage
    let quality = 'auto';
    try {
      const settings = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '{}');
      quality = settings.quality || 'auto';
    } catch (err) {
      console.error('Failed to read quality setting:', err);
    }

    // Get stream URL with quality preference
    const streamUrl = getStreamUrlWithQuality(video, quality);
    if (!streamUrl) {
      setError('Could not get video stream URL');
      return;
    }

    console.log('Loading video with quality:', quality, streamUrl);
    setError(null);
    videoEl.src = streamUrl;
    videoEl.load();
    videoEl.play().then(() => {
      // Add to watch history when video successfully starts
      addToWatchHistory(video);
    }).catch(err => {
      console.error('Failed to play:', err);
      setError('Failed to play video: ' + err.message);
    });

    return () => {
      if (controlsTimeout.current) {
        clearTimeout(controlsTimeout.current);
      }
    };
  }, [video]);

  // Video event handlers
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const handlePlay = () => {
      setIsPlaying(true);
      // Start auto-hide timer when playback begins
      if (controlsTimeout.current) {
        clearTimeout(controlsTimeout.current);
      }
      controlsTimeout.current = setTimeout(() => {
        setShowControls(false);
      }, 4000);
    };
    const handlePause = () => {
      setIsPlaying(false);
      // When pausing, show controls and clear the hide timer
      if (controlsTimeout.current) {
        clearTimeout(controlsTimeout.current);
        controlsTimeout.current = null;
      }
      setShowControls(true);
      setFocusRow('buttons');
      setFocusedControl('play');
    };
    // Throttle time updates to every 500ms for better performance on TV
    const handleTimeUpdate = () => {
      const now = Date.now();
      if (now - lastTimeUpdate.current >= 500) {
        lastTimeUpdate.current = now;
        setCurrentTime(videoEl.currentTime);
      }
    };
    const handleLoadedMetadata = () => setDuration(videoEl.duration);
    const handleEnded = () => {
      setIsPlaying(false);
      setShowControls(true);

      // Autoplay next video if enabled and available (use refs to get current values)
      if (autoplayEnabledRef.current && nextVideoRef.current && onPlayNextRef.current) {
        // Small delay to let state settle before transitioning
        setTimeout(() => {
          onPlayNextRef.current(nextVideoRef.current);
        }, 500);
      } else {
        // Autoplay disabled - exit player after a short delay
        setTimeout(() => {
          onCloseRef.current();
        }, 500);
      }
    };
    // Update time immediately after seeking for instant feedback
    const handleSeeked = () => {
      setCurrentTime(videoEl.currentTime);
    };

    const handleError = (e) => {
      console.error('Video error:', videoEl.error);
      setError('Video playback error: ' + (videoEl.error?.message || 'Unknown error'));
    };

    videoEl.addEventListener('play', handlePlay);
    videoEl.addEventListener('error', handleError);
    videoEl.addEventListener('pause', handlePause);
    videoEl.addEventListener('timeupdate', handleTimeUpdate);
    videoEl.addEventListener('loadedmetadata', handleLoadedMetadata);
    videoEl.addEventListener('ended', handleEnded);
    videoEl.addEventListener('seeked', handleSeeked);

    return () => {
      videoEl.removeEventListener('play', handlePlay);
      videoEl.removeEventListener('pause', handlePause);
      videoEl.removeEventListener('timeupdate', handleTimeUpdate);
      videoEl.removeEventListener('loadedmetadata', handleLoadedMetadata);
      videoEl.removeEventListener('ended', handleEnded);
      videoEl.removeEventListener('error', handleError);
      videoEl.removeEventListener('seeked', handleSeeked);
    };
  }, []);

  // Skip forward/backward
  const skipForward = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 10);
    }
  }, [duration]);

  const skipBackward = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
    }
  }, []);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  }, [isPlaying]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  // Handle follow/unfollow
  const handleFollow = useCallback(async () => {
    if (!loggedIn || !video.channelId) {
      console.log('Follow blocked - loggedIn:', loggedIn, 'channelId:', video.channelId);
      return;
    }

    console.log('Attempting follow/unfollow - isFollowing:', isFollowing, 'channelId:', video.channelId);

    if (isFollowing) {
      // Unfollow uses claim_id
      const result = await unfollowChannel(video.channelId);
      console.log('Unfollow result:', result);
      if (result.success) setIsFollowing(false);
    } else {
      // Follow uses claim_id and channel name
      const channelName = `@${video.channelName}`;
      console.log('Following channel:', channelName, 'id:', video.channelId);
      const result = await followChannel(video.channelId, channelName);
      console.log('Follow result:', result);
      if (result.success) setIsFollowing(true);
    }
  }, [loggedIn, video.channelName, video.channelId, isFollowing]);

  // Handle like
  const handleLike = useCallback(async () => {
    if (!loggedIn) return;

    if (hasLiked) {
      const result = await removeReaction(video.id, 'like');
      if (result.success) {
        setHasLiked(false);
        setLikeCount(prev => Math.max(0, prev - 1));
      }
    } else {
      const result = await reactToClaim(video.id, 'like');
      if (result.success) {
        if (hasDisliked) {
          setHasDisliked(false);
          setDislikeCount(prev => Math.max(0, prev - 1));
        }
        setHasLiked(true);
        setLikeCount(prev => prev + 1);
      }
    }
  }, [loggedIn, video.id, hasLiked, hasDisliked]);

  // Handle dislike
  const handleDislike = useCallback(async () => {
    if (!loggedIn) return;

    if (hasDisliked) {
      const result = await removeReaction(video.id, 'dislike');
      if (result.success) {
        setHasDisliked(false);
        setDislikeCount(prev => Math.max(0, prev - 1));
      }
    } else {
      const result = await reactToClaim(video.id, 'dislike');
      if (result.success) {
        if (hasLiked) {
          setHasLiked(false);
          setLikeCount(prev => Math.max(0, prev - 1));
        }
        setHasDisliked(true);
        setDislikeCount(prev => prev + 1);
      }
    }
  }, [loggedIn, video.id, hasLiked, hasDisliked]);

  // Navigate to channel
  const handleChannelClick = useCallback(() => {
    if (video.channelId && onNavigateToChannel) {
      onClose();
      onNavigateToChannel(video.channelId, video.channelName);
    }
  }, [video.channelId, video.channelName, onClose, onNavigateToChannel]);

  // Handle Watch Later toggle
  const handleWatchLater = useCallback(() => {
    if (isInWatchLaterState) {
      removeFromWatchLater(video.id);
      setIsInWatchLaterState(false);
    } else {
      addToWatchLater(video);
      setIsInWatchLaterState(true);
    }
  }, [video, isInWatchLaterState]);

  // Handle Favorites toggle
  const handleFavorites = useCallback(() => {
    if (isInFavoritesState) {
      removeFromFavorites(video.id);
      setIsInFavoritesState(false);
    } else {
      addToFavorites(video);
      setIsInFavoritesState(true);
    }
  }, [video, isInFavoritesState]);

  // Execute focused control action
  const executeControl = useCallback(() => {
    switch (focusedControl) {
      case 'channel':
        handleChannelClick();
        break;
      case 'follow':
        handleFollow();
        break;
      case 'like':
        handleLike();
        break;
      case 'dislike':
        handleDislike();
        break;
      case 'skipBack':
        skipBackward();
        break;
      case 'play':
        togglePlay();
        break;
      case 'skipForward':
        skipForward();
        break;
      case 'watchLater':
        handleWatchLater();
        break;
      case 'favorites':
        handleFavorites();
        break;
    }
  }, [focusedControl, handleChannelClick, handleFollow, handleLike, handleDislike, skipBackward, togglePlay, skipForward, handleWatchLater, handleFavorites]);

  // Handle keyboard controls
  useWindowEvent('keydown', (event) => {
    const keyCode = event.keyCode.toString();
    const videoEl = videoRef.current;
    if (!videoEl) return;

    resetControlsTimer();

    switch (keyCode) {
      case KEYCODE_WEBOS_BACK:
      case KEYCODE_ESCAPE:
        event.preventDefault();
        if (showControls) {
          // Hide controls first
          setShowControls(false);
          if (controlsTimeout.current) {
            clearTimeout(controlsTimeout.current);
          }
        } else {
          // Controls already hidden, exit player
          onClose();
        }
        break;
      case KEYCODE_STOP:
        event.preventDefault();
        onClose();
        break;
      case KEYCODE_ENTER:
        event.preventDefault();
        if (focusRow === 'topbar') {
          // Back button on topbar - close player
          onClose();
        } else {
          executeControl();
        }
        break;
      case KEYCODE_PLAY:
        event.preventDefault();
        if (!isPlaying) videoEl.play();
        break;
      case KEYCODE_PAUSE:
        event.preventDefault();
        if (isPlaying) videoEl.pause();
        break;
      case KEYCODE_PLAY_PAUSE:
      case KEYCODE_MEDIA_PLAY_PAUSE:
        event.preventDefault();
        togglePlay();
        break;
      case KEYCODE_REWIND:
        event.preventDefault();
        skipBackward();
        break;
      case KEYCODE_FAST_FORWARD:
        event.preventDefault();
        skipForward();
        break;
      case KEYCODE_LEFT:
        event.preventDefault();
        if (showControls) {
          if (focusRow === 'progress') {
            // On progress bar - seek backward
            skipBackward();
          } else {
            // On buttons row - navigate between controls
            const currentIndex = CONTROL_ITEMS.indexOf(focusedControl);
            if (currentIndex > 0) {
              setFocusedControl(CONTROL_ITEMS[currentIndex - 1]);
            }
          }
        } else {
          // Seek backward when controls hidden
          skipBackward();
        }
        break;
      case KEYCODE_RIGHT:
        event.preventDefault();
        if (showControls) {
          if (focusRow === 'progress') {
            // On progress bar - seek forward
            skipForward();
          } else {
            // On buttons row - navigate between controls
            const currentIndex = CONTROL_ITEMS.indexOf(focusedControl);
            if (currentIndex < CONTROL_ITEMS.length - 1) {
              setFocusedControl(CONTROL_ITEMS[currentIndex + 1]);
            }
          }
        } else {
          // Seek forward when controls hidden
          skipForward();
        }
        break;
      case KEYCODE_UP:
        event.preventDefault();
        if (showControls) {
          if (focusRow === 'buttons') {
            // Move from buttons to progress bar
            setFocusRow('progress');
          } else if (focusRow === 'progress') {
            // Move from progress bar to topbar (back button)
            setFocusRow('topbar');
          }
        }
        break;
      case KEYCODE_DOWN:
        event.preventDefault();
        if (showControls) {
          if (focusRow === 'topbar') {
            // Move from topbar to progress bar
            setFocusRow('progress');
          } else if (focusRow === 'progress') {
            // Move from progress bar to buttons
            setFocusRow('buttons');
          }
        }
        break;
    }
  });

  // Seek to position
  const handleSeek = (position) => {
    if (videoRef.current && duration) {
      videoRef.current.currentTime = (position / 100) * duration;
    }
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const isControlFocused = (controlName) => {
    return focusRow === 'buttons' && focusedControl === controlName && showControls;
  };

  const getControlStyle = (controlName) => {
    // Other controls use CSS class
    return {};
  };

  const getControlClassName = (controlName, baseClass = 'player-button') => {
    const isFocused = isControlFocused(controlName);
    if (controlName === 'play') {
      return `player-play-button${isFocused ? ' player-play-button--focused' : ''}`;
    }
    if (controlName === 'channel') {
      return `player-channel-button${isFocused ? ' player-button--focused' : ''}`;
    }
    return `${baseClass}${isFocused ? ' player-button--focused' : ''}`;
  };

  return (
    <div
      className="player-fullscreen-container"
      onClick={resetControlsTimer}
      onMouseMove={resetControlsTimer}
    >
      <video
        ref={videoRef}
        className="player-video"
        playsInline
        autoPlay
        crossOrigin="anonymous"
      />

      {/* Error display */}
      {error && (
        <div className="player-error">
          <Text color="red" size="lg">{error}</Text>
          <Text color="dimmed" size="sm" mt="sm">URL: {video.streamUrl}</Text>
        </div>
      )}

      {/* Controls overlay */}
      <div className={`player-controls ${showControls ? 'player-controls--visible' : ''}`}>
        {/* Top bar with back button and title */}
        <div className="player-top-bar">
          <Group spacing="md">
            <ActionIcon
              size="xl"
              variant="subtle"
              onClick={onClose}
              className={`player-button${focusRow === 'topbar' && showControls ? ' player-button--focused' : ''}`}
            >
              <IconArrowLeft size={42} color="white" />
            </ActionIcon>
            <Text color="white" size="lg" weight={600} lineClamp={1} style={{ maxWidth: '80%' }}>
              {video.title}
            </Text>
          </Group>
        </div>

        {/* Center - empty space for video visibility */}
        <div className="player-center" />

        {/* Bottom controls */}
        <div className="player-bottom-bar">
          {/* Progress bar */}
          <div className="player-progress-container">
            <Text color="white" size="sm" className="player-time">
              {formatDuration(Math.floor(currentTime))}
            </Text>
            <Slider
              value={progress}
              onChange={handleSeek}
              color="pink"
              size="lg"
              className="player-progress"
              label={null}
              styles={{
                root: {
                  flex: 1,
                },
                track: {
                  backgroundColor: 'rgba(255, 255, 255, 0.3)',
                  height: 10,
                  borderRadius: 5,
                  '&::before': {
                    display: 'none',
                  },
                },
                bar: {
                  backgroundColor: '#de0050',
                  height: 10,
                  borderRadius: 5,
                },
                thumb: {
                  backgroundColor: '#de0050',
                  borderColor: '#de0050',
                  border: '3px solid white',
                  width: focusRow === 'progress' && showControls ? 28 : 20,
                  height: focusRow === 'progress' && showControls ? 28 : 20,
                  boxShadow: focusRow === 'progress' && showControls
                    ? '0 0 0 4px rgba(222, 0, 80, 0.5)'
                    : '0 2px 4px rgba(0,0,0,0.3)',
                },
              }}
            />
            <Text color="white" size="sm" className="player-time">
              {formatDuration(Math.floor(duration))}
            </Text>
          </div>

          {/* Main controls row */}
          <div className="player-controls-row">
            {/* Left: Channel avatar, Follow, Favorites, Watch Later */}
            <Group spacing="md" className="player-controls-left">
              <div
                onClick={handleChannelClick}
                className={getControlClassName('channel')}
                style={{
                  cursor: 'pointer',
                  borderRadius: '50%',
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div style={{ width: 78, height: 78, flexShrink: 0 }}>
                  <Avatar
                    src={video.channelThumbnail}
                    size={78}
                    radius={78}
                    color="pink"
                    style={{ width: 78, height: 78 }}
                  >
                    {video.channelTitle?.charAt(0)?.toUpperCase() || 'C'}
                  </Avatar>
                </div>
              </div>

              <ActionIcon
                size={57}
                radius="xl"
                variant="subtle"
                onClick={handleFollow}
                className={getControlClassName('follow')}
              >
                {isFollowing ? (
                  <IconHeartFilled size={36} color={isControlFocused('follow') ? 'white' : '#de0050'} />
                ) : (
                  <IconHeart size={36} color="white" />
                )}
              </ActionIcon>

              <ActionIcon
                size={57}
                radius="xl"
                variant="subtle"
                onClick={handleFavorites}
                className={getControlClassName('favorites')}
              >
                {isInFavoritesState ? (
                  <IconStarFilled size={36} color={isControlFocused('favorites') ? 'white' : '#de0050'} />
                ) : (
                  <IconStar size={36} color="white" />
                )}
              </ActionIcon>

              <ActionIcon
                size={57}
                radius="xl"
                variant="subtle"
                onClick={handleWatchLater}
                className={getControlClassName('watchLater')}
              >
                {isInWatchLaterState ? (
                  <IconClockFilled size={36} color={isControlFocused('watchLater') ? 'white' : '#de0050'} />
                ) : (
                  <IconClock size={36} color="white" />
                )}
              </ActionIcon>
            </Group>

            {/* Center: Playback controls */}
            <Group spacing="xl" className="player-controls-center">
              <ActionIcon
                size={57}
                radius="xl"
                variant="subtle"
                onClick={skipBackward}
                className={getControlClassName('skipBack')}
              >
                <IconPlayerTrackPrev size={34} color="white" />
              </ActionIcon>

              <ActionIcon
                size={73}
                radius={73}
                variant="filled"
                onClick={togglePlay}
                className={getControlClassName('play')}
                style={{ width: 73, height: 73 }}
              >
                {isPlaying ? (
                  <IconPlayerPause size={42} />
                ) : (
                  <IconPlayerPlay size={42} />
                )}
              </ActionIcon>

              <ActionIcon
                size={57}
                radius="xl"
                variant="subtle"
                onClick={skipForward}
                className={getControlClassName('skipForward')}
              >
                <IconPlayerTrackNext size={34} color="white" />
              </ActionIcon>
            </Group>

            {/* Right: Like, Dislike */}
            <Group spacing="lg" className="player-controls-right">
              <ActionIcon
                size={57}
                radius="xl"
                variant="subtle"
                onClick={handleLike}
                className={getControlClassName('like')}
              >
                <IconFire
                  size={36}
                  color={isControlFocused('like') ? 'white' : (hasLiked ? '#de0050' : 'white')}
                  filled={hasLiked}
                />
              </ActionIcon>

              <ActionIcon
                size={57}
                radius="xl"
                variant="subtle"
                onClick={handleDislike}
                className={getControlClassName('dislike')}
              >
                <IconSlime
                  size={36}
                  color={hasDisliked ? '#6e7a5a' : 'white'}
                  filled={hasDisliked}
                />
              </ActionIcon>
            </Group>
          </div>

        </div>
      </div>
    </div>
  );
}
