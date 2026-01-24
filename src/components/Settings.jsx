import React, { useState, useEffect } from 'react';
import { Stack, Text, Switch, Select, Divider, Group, Badge, Button, Avatar } from '@mantine/core';
import { useWindowEvent } from '@mantine/hooks';
import { IconLogout, IconTrash } from '@tabler/icons-react';
import { VIDEO_QUALITIES } from '../api/odysee';

// Scaled icon sizes for TV
const ICON_SIZE = 28;
const AVATAR_SIZE = 72;
import { STORAGE_KEYS, KEYCODE_UP, KEYCODE_DOWN, KEYCODE_LEFT, KEYCODE_ENTER } from '../constants';

// Convert VIDEO_QUALITIES to Select options format
const qualityOptions = VIDEO_QUALITIES.map(q => ({ value: q.value, label: q.label }));

const SETTINGS_ITEMS = [
  { id: 'autoplay', label: 'Autoplay next video', type: 'switch', default: true },
  { id: 'quality', label: 'Video quality', type: 'select', default: 'auto', options: qualityOptions },
  { id: 'nsfw', label: 'Show mature content', type: 'switch', default: false, requiresLogin: true },
];

export default function Settings({ onFocusSidebar, sidebarFocused, user, onLogout }) {
  const [settings, setSettings] = useState({});
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Total items = account section (if logged in) + settings items + clear cache
  const totalItems = (user ? 1 : 0) + SETTINGS_ITEMS.length + 1;

  // Load settings from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (saved) {
        setSettings(JSON.parse(saved));
      } else {
        // Initialize with defaults
        const defaults = {};
        SETTINGS_ITEMS.forEach(item => {
          defaults[item.id] = item.default;
        });
        setSettings(defaults);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }, []);

  // Save settings to localStorage
  const updateSetting = (id, value) => {
    const newSettings = { ...settings, [id]: value };
    setSettings(newSettings);
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(newSettings));
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  };

  // Handle clearing cache (localStorage)
  const handleClearCache = () => {
    if (window.confirm('Clear all cached data? This will remove your watch history, favorites, and watch later lists.')) {
      try {
        // Clear specific cache keys but keep auth and settings
        localStorage.removeItem(STORAGE_KEYS.WATCH_HISTORY);
        localStorage.removeItem(STORAGE_KEYS.WATCH_LATER);
        localStorage.removeItem(STORAGE_KEYS.FAVORITES);
        localStorage.removeItem(STORAGE_KEYS.PLAYLISTS);
        alert('Cache cleared successfully. Restart the app to re-sync from cloud.');
      } catch (err) {
        console.error('Failed to clear cache:', err);
        alert('Failed to clear cache.');
      }
    }
  };

  // Calculate index for clear cache button (last item)
  const clearCacheIndex = totalItems - 1;

  // Handle keyboard navigation
  useWindowEvent('keydown', (event) => {
    if (sidebarFocused) return;

    const keyCode = event.keyCode.toString();

    switch (keyCode) {
      case KEYCODE_UP:
        event.preventDefault();
        setSelectedIndex(prev => Math.max(0, prev - 1));
        break;
      case KEYCODE_DOWN:
        event.preventDefault();
        setSelectedIndex(prev => Math.min(totalItems - 1, prev + 1));
        break;
      case KEYCODE_LEFT:
        event.preventDefault();
        onFocusSidebar();
        break;
      case KEYCODE_ENTER:
        event.preventDefault();
        if (user && selectedIndex === 0) {
          // Logout button
          onLogout();
        } else if (selectedIndex === clearCacheIndex) {
          // Clear cache button
          handleClearCache();
        } else {
          const settingsIndex = user ? selectedIndex - 1 : selectedIndex;
          const currentItem = SETTINGS_ITEMS[settingsIndex];
          if (currentItem && currentItem.type === 'switch') {
            // Don't toggle if requires login and user is not logged in
            if (currentItem.requiresLogin && !user) {
              return;
            }
            updateSetting(currentItem.id, !settings[currentItem.id]);
          }
        }
        break;
    }
  });

  return (
    <div className="settings-container">
      <Stack p="xl" spacing="xl">
        <Text size={42} weight={700} color="white">
          Settings
        </Text>

        {/* Account Section */}
        {user && (
          <>
            <Divider color="gray" label={<Text size="lg" color="dimmed">Account</Text>} labelPosition="left" />

            <div
              className={`settings-item ${selectedIndex === 0 ? 'settings-item--focused' : ''}`}
            >
              <Group position="apart">
                <Group spacing="lg">
                  <Avatar
                    src={user.profile_image}
                    size={AVATAR_SIZE}
                    radius="xl"
                    color="pink"
                  >
                    {user.primary_email?.charAt(0)?.toUpperCase() || 'U'}
                  </Avatar>
                  <Stack spacing={4}>
                    <Text color="white" size="xl" weight={500}>
                      {user.primary_email}
                    </Text>
                    {user.channel?.name && (
                      <Text color="dimmed" size="lg">
                        @{user.channel.name}
                      </Text>
                    )}
                  </Stack>
                </Group>

                <Button
                  variant="outline"
                  color="red"
                  size="lg"
                  leftIcon={<IconLogout size={ICON_SIZE} />}
                  onClick={onLogout}
                  styles={{ label: { fontSize: '1.3rem' } }}
                >
                  Sign Out
                </Button>
              </Group>
            </div>
          </>
        )}

        <Divider color="gray" label={<Text size="lg" color="dimmed">Preferences</Text>} labelPosition="left" />

        <Stack spacing="lg">
          {SETTINGS_ITEMS.map((item, index) => {
            const itemIndex = user ? index + 1 : index;
            const isDisabled = item.requiresLogin && !user;
            return (
              <div
                key={item.id}
                className={`settings-item ${itemIndex === selectedIndex ? 'settings-item--focused' : ''}`}
                style={{ opacity: isDisabled ? 0.5 : 1 }}
              >
                <Group position="apart">
                  <Stack spacing={4}>
                    <Text color={isDisabled ? 'dimmed' : 'white'} size="xl">
                      {item.label}
                    </Text>
                    {isDisabled && (
                      <Text color="dimmed" size="md">
                        Sign in required
                      </Text>
                    )}
                  </Stack>

                  {item.type === 'switch' && (
                    <Switch
                      checked={isDisabled ? false : (settings[item.id] ?? item.default)}
                      onChange={(e) => !isDisabled && updateSetting(item.id, e.target.checked)}
                      color="pink"
                      size="xl"
                      disabled={isDisabled}
                    />
                  )}

                  {item.type === 'select' && (
                    <Select
                      value={settings[item.id] ?? item.default}
                      onChange={(value) => updateSetting(item.id, value)}
                      data={item.options}
                      size="xl"
                      style={{ width: 300 }}
                      disabled={isDisabled}
                      styles={{
                        input: { fontSize: '1.8rem', padding: '16px 20px', backgroundColor: '#000', border: '2px solid #444' },
                        item: { fontSize: '1.8rem', padding: '16px 20px' },
                        dropdown: { backgroundColor: '#111' }
                      }}
                    />
                  )}
                </Group>
              </div>
            );
          })}
        </Stack>

        <Divider color="gray" label={<Text size="lg" color="dimmed">Storage</Text>} labelPosition="left" />

        <div
          className={`settings-item ${selectedIndex === clearCacheIndex ? 'settings-item--focused' : ''}`}
        >
          <Group position="apart">
            <Stack spacing={4}>
              <Text color="white" size={28}>
                Clear Cache
              </Text>
              <Text color="dimmed" size="lg">
                Remove watch history, favorites, and watch later lists
              </Text>
            </Stack>
            <Button
              variant="outline"
              color="gray"
              size="xl"
              leftIcon={<IconTrash size={32} />}
              onClick={handleClearCache}
              styles={{ label: { fontSize: '1.8rem' }, root: { padding: '16px 28px' } }}
            >
              Clear
            </Button>
          </Group>
        </div>

        <Divider color="gray" label={<Text size="lg" color="dimmed">About</Text>} labelPosition="left" />

        <Stack spacing="md" pl="md">
          <Text color="white" size="xl" weight={600}>
            Odysee for webOS
          </Text>
          <Text color="dimmed" size="lg">
            Unofficial app for LG Smart TVs
          </Text>
          <Badge color="pink" variant="filled" size="xl" styles={{ root: { fontSize: '1.2rem', padding: '14px 20px' } }}>
            Version {typeof APP_VERSION !== 'undefined' ? APP_VERSION : '1.0.0'}
          </Badge>
        </Stack>
      </Stack>
    </div>
  );
}
