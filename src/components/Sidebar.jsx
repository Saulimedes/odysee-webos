import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { Navbar, Stack, UnstyledButton, Text, Divider, Avatar } from '@mantine/core';
import { useWindowEvent } from '@mantine/hooks';
import {
  IconHome,
  IconSearch,
  IconSettings,
  IconLogin,
  IconHeart,
  IconFolder,
  IconBulb,
  IconStar,
  IconPlaylist,
  IconCategory,
} from '@tabler/icons-react';
import {
  KEYCODE_UP,
  KEYCODE_DOWN,
  KEYCODE_RIGHT,
  KEYCODE_ENTER,
} from '../constants';

// Static icon mapping for built-in sidebar items
const staticIconMap = {
  login: IconLogin,
  home: IconHome,
  search: IconSearch,
  heart: IconHeart,
  folder: IconFolder,
  playlist: IconPlaylist,
  settings: IconSettings,
  category: IconCategory,
  star: IconStar,
  bulb: IconBulb,
};

export default function Sidebar({ selectedItem, onSelectItem, focused, onFocusContent, user, onLogout }) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const itemRefs = useRef([]);
  const sidebarRef = useRef(null);

  // Measure sidebar content width and set CSS variable for dynamic width
  useEffect(() => {
    if (sidebarRef.current) {
      const measureWidth = () => {
        const sidebar = sidebarRef.current;

        // Temporarily force expanded state for accurate measurement
        const originalClass = sidebar.className;
        sidebar.className = sidebar.className
          .replace('sidebar--collapsed', 'sidebar--expanded')
          .replace(/\s+/g, ' ');

        // Force labels to be visible and allow natural width
        sidebar.style.width = 'auto';
        sidebar.style.minWidth = 'auto';
        sidebar.style.maxWidth = 'none';

        // Force show all labels for measurement
        const labels = sidebar.querySelectorAll('.sidebar-item-label');
        labels.forEach(label => {
          label.style.display = 'block';
        });

        // Measure the natural content width
        const contentWidth = sidebar.scrollWidth;

        // Restore original styles
        labels.forEach(label => {
          label.style.display = '';
        });
        sidebar.style.width = '';
        sidebar.style.minWidth = '';
        sidebar.style.maxWidth = '';
        sidebar.className = originalClass;

        // Add padding and set the CSS variable (min 250px, max 500px)
        const finalWidth = Math.max(250, Math.min(500, contentWidth + 40));
        document.documentElement.style.setProperty('--sidebar-width-dynamic', `${finalWidth}px`);
      };

      // Delay measurement to ensure DOM is ready
      const timer = setTimeout(measureWidth, 100);

      // Also measure after fonts load for accurate text width
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => setTimeout(measureWidth, 50));
      }

      return () => clearTimeout(timer);
    }
  }, [user]);

  // Build sidebar items based on login state
  // Categories are only accessible via the Categories view, not cluttering the main sidebar
  const { topItems, middleItems, bottomItems } = useMemo(() => {
    const top = [];
    if (!user) {
      top.push({ id: 'login', label: 'Login', icon: 'login' });
    }
    top.push({ id: 'search', label: 'Search', icon: 'search' });
    top.push({ id: 'home', label: 'Home', icon: 'home' });
    top.push({ id: 'discover', label: 'Discover', icon: 'bulb' });
    top.push({ id: 'featured', label: 'Featured', icon: 'star' });
    top.push({ id: 'categories', label: 'Categories', icon: 'category' });

    const middle = [];
    if (user) {
      middle.push({ id: 'playlists', label: 'Playlists', icon: 'playlist' });
      middle.push({ id: 'following', label: 'Following', icon: 'heart' });
    }

    const bottom = [];
    bottom.push({ id: 'library', label: 'Library', icon: 'folder' });
    bottom.push({ id: 'settings', label: 'Settings', icon: 'settings' });

    return { topItems: top, middleItems: middle, bottomItems: bottom };
  }, [user]);

  const allItems = useMemo(() => {
    return [...topItems, ...middleItems, ...bottomItems];
  }, [topItems, middleItems, bottomItems]);

  useEffect(() => {
    const newIndex = allItems.findIndex(item => item.id === selectedItem);
    if (newIndex >= 0) {
      setFocusedIndex(newIndex);
    } else {
      setFocusedIndex(0);
    }
  }, [allItems, selectedItem]);

  useEffect(() => {
    if (focused && itemRefs.current[focusedIndex]) {
      itemRefs.current[focusedIndex].focus();
    }
  }, [focused, focusedIndex]);

  useWindowEvent('keydown', (event) => {
    if (!focused) return;

    // Prevent handling if already handled
    if (event.defaultPrevented) return;

    const keyCode = event.keyCode.toString();

    switch (keyCode) {
      case KEYCODE_UP:
        event.preventDefault();
        event.stopImmediatePropagation();
        setFocusedIndex(prev => Math.max(0, prev - 1));
        break;
      case KEYCODE_DOWN:
        event.preventDefault();
        event.stopImmediatePropagation();
        setFocusedIndex(prev => Math.min(allItems.length - 1, prev + 1));
        break;
      case KEYCODE_RIGHT:
        event.preventDefault();
        event.stopImmediatePropagation();
        onFocusContent();
        break;
      case KEYCODE_ENTER:
        event.preventDefault();
        event.stopImmediatePropagation();
        handleItemSelect(allItems[focusedIndex], focusedIndex);
        break;
    }
  });

  const handleItemSelect = useCallback((item, index) => {
    if (!item) return;
    setFocusedIndex(index);
    onSelectItem(item.id);
  }, [onSelectItem]);

  const handleItemClick = useCallback((item, index) => {
    handleItemSelect(item, index);
  }, [handleItemSelect]);

  const getIcon = (item) => {
    return staticIconMap[item.icon] || IconHome;
  };

  const renderItem = (item, index) => {
    const Icon = getIcon(item);
    const isSelected = selectedItem === item.id;
    const isFocused = focused && focusedIndex === index;

    return (
      <UnstyledButton
        key={item.id}
        ref={el => itemRefs.current[index] = el}
        className={`sidebar-item ${isSelected ? 'sidebar-item--selected' : ''} ${isFocused ? 'sidebar-item--focused' : ''}`}
        onClick={() => handleItemClick(item, index)}
        tabIndex={focused ? 0 : -1}
      >
        <Icon
          size={40}
          stroke={1.5}
          color={isFocused ? '#de0050' : isSelected ? '#fff' : '#888'}
          className="sidebar-item-icon"
        />
        <Text
          color={isFocused ? '#de0050' : isSelected ? '#fff' : '#888'}
          className="sidebar-item-label"
        >
          {item.label}
        </Text>
      </UnstyledButton>
    );
  };

  const topOffset = 0;
  const middleOffset = topItems.length;
  const bottomOffset = topItems.length + middleItems.length;

  // Determine sidebar width class
  const widthClass = focused ? 'sidebar--expanded' : 'sidebar--collapsed';

  return (
    <Navbar
      ref={sidebarRef}
      p="xs"
      className={`sidebar ${widthClass} ${focused ? 'sidebar--focused' : ''}`}
      styles={{
        root: { borderBottom: 'none' },
      }}
    >
      {/* Logo at very top */}
      <Navbar.Section>
        <div
          className="sidebar-logo"
          onClick={() => user && onSelectItem('settings')}
          style={{ cursor: user ? 'pointer' : 'default' }}
        >
          {user && user.profile_image ? (
            <>
              <Avatar
                src={user.profile_image}
                size={48}
                radius="xl"
              />
              {user.channel?.name && (
                <Text
                  color="white"
                  weight={600}
                  size="lg"
                  style={{ marginLeft: '12px', whiteSpace: 'nowrap' }}
                >
                  @{user.channel.name}
                </Text>
              )}
            </>
          ) : (
            <img
              src="icon.png"
              alt="Odysee"
              width={48}
              height={48}
              style={{ borderRadius: '8px' }}
            />
          )}
          {!user && (
            <img
              src="odysee_text.png"
              alt="Odysee"
              height={40}
              style={{ marginLeft: '12px' }}
            />
          )}
        </div>
      </Navbar.Section>

      {/* Top section */}
      {topItems.length > 0 && (
        <Navbar.Section>
          <Stack spacing={6}>
            {topItems.map((item, index) => renderItem(item, topOffset + index))}
          </Stack>
        </Navbar.Section>
      )}

      {/* Middle section (user items when logged in) */}
      {middleItems.length > 0 && (
        <Navbar.Section>
          <Stack spacing={6}>
            <Divider my={8} color="dark.5" />
            {middleItems.map((item, index) => renderItem(item, middleOffset + index))}
          </Stack>
        </Navbar.Section>
      )}

      <Navbar.Section grow />

      {/* Bottom section */}
      {bottomItems.length > 0 && (
        <Navbar.Section>
          <Stack spacing={6}>
            <Divider my={8} color="dark.5" />
            {bottomItems.map((item, index) => renderItem(item, bottomOffset + index))}
          </Stack>
        </Navbar.Section>
      )}
    </Navbar>
  );
}
