import React, { useState, memo, useCallback } from 'react';
import { Card, Text, Group, Badge, Avatar } from '@mantine/core';
import { IconPlayerPlay, IconEye } from '@tabler/icons-react';
import { formatDuration, formatRelativeTime, formatViews } from '../api/odysee';

// Shared cache for failed avatars - prevents repeated load attempts and re-renders
// Uses LRU-style eviction to prevent unbounded memory growth
const MAX_FAILED_CACHE_SIZE = 500;
const failedAvatars = new Set();
const failedThumbnails = new Set();

function addToFailedCache(cache, url) {
  if (!url) return;
  // Evict oldest entries if cache is full
  if (cache.size >= MAX_FAILED_CACHE_SIZE) {
    const firstKey = cache.values().next().value;
    cache.delete(firstKey);
  }
  cache.add(url);
}

const VideoCard = memo(function VideoCard({ video, isActive, onClick }) {
  // Check if already known to be failed (avoids state entirely for known failures)
  const [imageError, setImageError] = useState(() =>
    video?.thumbnail ? failedThumbnails.has(video.thumbnail) : false
  );
  const [avatarError, setAvatarError] = useState(() =>
    video?.channelThumbnail ? failedAvatars.has(video.channelThumbnail) : false
  );

  if (!video) return null;

  // Handle thumbnail error - add to shared cache with size limit
  const handleImageError = useCallback(() => {
    addToFailedCache(failedThumbnails, video.thumbnail);
    setImageError(true);
  }, [video.thumbnail]);

  // Handle avatar error - add to shared cache with size limit
  const handleAvatarError = useCallback(() => {
    addToFailedCache(failedAvatars, video.channelThumbnail);
    setAvatarError(true);
  }, [video.channelThumbnail]);

  return (
    <Card
      className={`video-card ${isActive ? 'video-card--active' : ''}`}
      onClick={onClick}
      padding={0}
      radius="md"
    >
      <div className="video-card__thumbnail-container">
        {video.thumbnail && !imageError ? (
          <img
            src={video.thumbnail}
            alt={video.title || 'Video thumbnail'}
            className="video-card__thumbnail"
            onError={handleImageError}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="video-card__placeholder">
            <IconPlayerPlay size={62} color="#666" />
          </div>
        )}
        {video.duration > 0 && (
          <Badge
            className="video-card__duration"
            size="sm"
            variant="filled"
            color="dark"
          >
            {formatDuration(video.duration)}
          </Badge>
        )}
      </div>

      <div className="video-card__info">
        <Avatar
          src={!avatarError ? video.channelThumbnail : null}
          size={42}
          radius="xl"
          color="pink"
          className="video-card__avatar"
          onError={handleAvatarError}
        >
          {(video.channelTitle || video.channelName || 'C').charAt(0).toUpperCase()}
        </Avatar>

        <div className="video-card__text">
          <Text
            className="video-card__title"
            size="sm"
            weight={500}
            color="white"
            lineClamp={2}
          >
            {video.title || 'Untitled'}
          </Text>

          <Text
            className="video-card__channel"
            size="xs"
            color="dimmed"
            mt={2}
            lineClamp={1}
          >
            {video.channelTitle || video.channelName || 'Unknown channel'}
          </Text>

          <div className="video-card__meta">
            {video.views > 0 && (
              <>
                <IconEye size={18} color="#888" style={{ flexShrink: 0, position: 'relative', top: -1 }} />
                <Text size="xs" color="dimmed" style={{ marginLeft: 8, marginRight: 4 }}>
                  {formatViews(video.views)}
                </Text>
              </>
            )}
            {video.releaseTime && (
              <Text size="xs" color="dimmed">
                {video.views > 0 ? ' · ' : ''}{formatRelativeTime(video.releaseTime)}
              </Text>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}, (prevProps, nextProps) => {
  // Only re-render if isActive changes or video.id changes
  return prevProps.isActive === nextProps.isActive &&
         prevProps.video?.id === nextProps.video?.id;
});

export default VideoCard;
