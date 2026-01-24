import React, { useState, memo } from 'react';
import { Card, Text, Avatar, Group, Stack } from '@mantine/core';
import { IconUsers } from '@tabler/icons-react';

const ChannelCard = memo(function ChannelCard({ channel, isActive, onClick }) {
  const [avatarError, setAvatarError] = useState(false);

  if (!channel) return null;

  return (
    <Card
      className={`video-card ${isActive ? 'video-card--active' : ''}`}
      onClick={onClick}
      padding="xl"
      radius="md"
      style={{ height: '240px' }}
    >
      <Group noWrap spacing="xl" align="flex-start" style={{ height: '100%' }}>
        <div style={{ flexShrink: 0, width: 100, height: 100 }}>
          <Avatar
            src={!avatarError ? channel.thumbnail : null}
            size={100}
            radius={100}
            color="pink"
            onError={() => setAvatarError(true)}
            style={{ width: 100, height: 100 }}
          >
            {(channel.title || channel.name || 'C').charAt(0).toUpperCase()}
          </Avatar>
        </div>

        <Stack spacing={8} style={{ flex: 1, minWidth: 0, height: '100%' }} justify="flex-start">
          <Text
            size="xl"
            weight={600}
            color="white"
            lineClamp={1}
          >
            {channel.title || channel.name || 'Unknown Channel'}
          </Text>

          <Text
            size="md"
            color="dimmed"
          >
            @{channel.name || 'unknown'}
          </Text>

          <Text
            size="md"
            color="dimmed"
            lineClamp={2}
            mt={6}
            style={{ minHeight: '3em' }}
          >
            {channel.description || ''}
          </Text>

          <Group spacing="xs" mt="auto">
            <IconUsers size={20} color="#888" />
            <Text size="md" color="dimmed">
              Channel
            </Text>
          </Group>
        </Stack>
      </Group>
    </Card>
  );
}, (prevProps, nextProps) => {
  return prevProps.isActive === nextProps.isActive &&
         prevProps.channel?.id === nextProps.channel?.id;
});

export default ChannelCard;
