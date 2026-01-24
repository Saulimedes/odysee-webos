import React, { useState, useCallback, useEffect, Suspense, lazy, startTransition } from 'react';
import { AppShell, Center, Loader } from '@mantine/core';
import { useWindowEvent } from '@mantine/hooks';
import Sidebar from '../components/Sidebar';
import Home from '../components/Home';
import { initAuth, logout, getHomepageCategories, fetchUserProfilePicture, syncCloudCollections } from '../api/odysee';
import { KEYCODE_WEBOS_BACK, KEYCODE_ESCAPE, CATEGORIES, STORAGE_KEYS } from '../constants';
import { isInWatchLater, removeFromWatchLater } from '../components/Watchlist';

// Lazy load less frequently used components
const Search = lazy(() => import('../components/Search'));
const Login = lazy(() => import('../components/Login'));
const CategoryView = lazy(() => import('../components/CategoryView'));
const VideoList = lazy(() => import('../components/VideoList'));
const PlaylistList = lazy(() => import('../components/PlaylistList'));
const Library = lazy(() => import('../components/Library'));
const Settings = lazy(() => import('../components/Settings'));
const Following = lazy(() => import('../components/Following'));
const Categories = lazy(() => import('../components/Categories'));
const FeaturedView = lazy(() => import('../components/FeaturedView'));
const DiscoverView = lazy(() => import('../components/DiscoverView'));
const Player = lazy(() => import('../components/Player'));

// Loading fallback for lazy components
const LazyFallback = () => (
  <Center style={{ height: '100vh' }}>
    <Loader color="pink" size="xl" />
  </Center>
);

export default function Main() {
  const [selectedItem, setSelectedItem] = useState('home');
  const [sidebarFocused, setSidebarFocused] = useState(false);
  const [currentVideo, setCurrentVideo] = useState(null);
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [dynamicCategories, setDynamicCategories] = useState([]);
  const [channelName, setChannelName] = useState(null);

  // Initialize auth and load categories on mount
  useEffect(() => {
    const user = initAuth();
    if (user) {
      setCurrentUser(user);

      // Always sync cloud collections (Watch Later, Favorites) on startup
      console.log('Syncing cloud collections for user:', user.primary_email);
      syncCloudCollections().then(success => {
        console.log('Cloud collections sync:', success ? 'complete' : 'skipped');
      }).catch(err => {
        console.error('Cloud collections sync error:', err);
      });

      // Try to fetch profile picture if not already set
      if (!user.profile_image && user.primary_email) {
        console.log('Fetching profile picture for user:', user.primary_email);
        fetchUserProfilePicture().then(channel => {
          console.log('fetchUserProfilePicture result:', channel);
          if (channel) {
            setCurrentUser(prev => ({ ...prev, channel, profile_image: channel.thumbnail }));
          }
        }).catch(err => {
          console.error('fetchUserProfilePicture error:', err);
        });
      }
    }

    // Load dynamic categories
    getHomepageCategories().then(categories => {
      if (categories) {
        setDynamicCategories(categories);
      }
    });
  }, []);

  // Handle successful login
  const handleLoginSuccess = useCallback(async (user) => {
    setCurrentUser(user);
    setSelectedItem('home');
    // Fetch profile picture after login
    console.log('Login success, fetching profile picture...');
    try {
      const channel = await fetchUserProfilePicture();
      console.log('Profile picture result:', channel);
      if (channel) {
        setCurrentUser(prev => ({ ...prev, channel, profile_image: channel.thumbnail }));
      }
    } catch (err) {
      console.error('Failed to fetch profile after login:', err);
    }
  }, []);

  // Handle logout
  const handleLogout = useCallback(async () => {
    await logout();
    setCurrentUser(null);
    setSelectedItem('home');
  }, []);

  // Handle sidebar focus - use startTransition for non-blocking update
  const handleFocusSidebar = useCallback(() => {
    // Immediate update for sidebar to respond
    setSidebarFocused(true);
  }, []);

  // Handle sidebar item selection
  const handleSelectItem = useCallback((item) => {
    setSelectedItem(item);
    setSidebarFocused(false);
  }, []);

  // Handle video selection for playback
  const handlePlayVideo = useCallback((video) => {
    // Auto-remove from watch later when playing (syncs to cloud automatically)
    if (isInWatchLater(video.id)) {
      removeFromWatchLater(video.id);
    }
    setCurrentVideo(video);
    setIsPlayerFullscreen(true);
  }, []);

  // Handle playing next video (for autoplay)
  const handlePlayNext = useCallback((video) => {
    setCurrentVideo(video);
    // Player is already fullscreen, just swap the video
  }, []);

  // Handle closing the player
  const handleClosePlayer = useCallback(() => {
    setIsPlayerFullscreen(false);
    setCurrentVideo(null);
  }, []);

  // Handle navigation to channel from player
  const handleNavigateToChannel = useCallback((channelId, name) => {
    // Navigate to channel view - for now just select the channel as a category
    // This could be extended to show a dedicated channel page
    setChannelName(name);
    setSelectedItem(`channel:${channelId}`);
  }, []);

  // Global keyboard navigation (back button only - left/right handled by components)
  // Note: Player handles its own back button to hide controls first
  useWindowEvent('keydown', (event) => {
    const keyCode = event.keyCode.toString();

    // Handle back button (but not when player is fullscreen - Player handles it)
    if (keyCode === KEYCODE_WEBOS_BACK || keyCode === KEYCODE_ESCAPE) {
      if (isPlayerFullscreen) {
        // Let Player.jsx handle back button
        return;
      } else if (selectedItem === 'home') {
        // Exit app when pressing back on home
        event.preventDefault();
        if (window.webOS && window.webOS.platformBack) {
          window.webOS.platformBack();
        } else {
          window.close();
        }
      } else {
        // Navigate to home from any other screen
        setSelectedItem('home');
        setSidebarFocused(false);
        event.preventDefault();
      }
    }
  });

  // Render the current view based on selected item
  const renderContent = () => {
    switch (selectedItem) {
      case 'login':
        return (
          <Login
            onFocusSidebar={handleFocusSidebar}
            sidebarFocused={sidebarFocused}
            onLoginSuccess={handleLoginSuccess}
            isPlayerActive={isPlayerFullscreen}
          />
        );
      case 'following':
        return (
          <Following
            onPlayVideo={handlePlayVideo}
            onFocusSidebar={handleFocusSidebar}
            sidebarFocused={sidebarFocused}
            isPlayerActive={isPlayerFullscreen}
          />
        );
      case 'categories':
        return (
          <Categories
            onPlayVideo={handlePlayVideo}
            onFocusSidebar={handleFocusSidebar}
            sidebarFocused={sidebarFocused}
            isPlayerActive={isPlayerFullscreen}
          />
        );
      case 'featured':
        return (
          <FeaturedView
            onPlayVideo={handlePlayVideo}
            onFocusSidebar={handleFocusSidebar}
            sidebarFocused={sidebarFocused}
            isPlayerActive={isPlayerFullscreen}
          />
        );
      case 'discover':
        return (
          <DiscoverView
            onPlayVideo={handlePlayVideo}
            onFocusSidebar={handleFocusSidebar}
            sidebarFocused={sidebarFocused}
            isPlayerActive={isPlayerFullscreen}
          />
        );
      case 'library':
        return (
          <Library
            onPlayVideo={handlePlayVideo}
            onFocusSidebar={handleFocusSidebar}
            sidebarFocused={sidebarFocused}
            onNavigateToSection={(section) => setSelectedItem(section)}
            isPlayerActive={isPlayerFullscreen}
          />
        );
      case 'home':
        return (
          <Home
            onPlayVideo={handlePlayVideo}
            onFocusSidebar={handleFocusSidebar}
            sidebarFocused={sidebarFocused}
            user={currentUser}
            isPlayerActive={isPlayerFullscreen}
          />
        );
      case 'search':
        return (
          <Search
            onPlayVideo={handlePlayVideo}
            onViewChannel={handleNavigateToChannel}
            onFocusSidebar={handleFocusSidebar}
            sidebarFocused={sidebarFocused}
            isPlayerActive={isPlayerFullscreen}
          />
        );
      case 'watch-later':
        return (
          <VideoList
            title="Watch Later"
            storageKey={STORAGE_KEYS.WATCH_LATER}
            emptyIcon="clock"
            emptyMessage="No videos in Watch Later"
            emptySubtext="Add videos to watch later from the player"
            onPlayVideo={handlePlayVideo}
            onFocusSidebar={handleFocusSidebar}
            sidebarFocused={sidebarFocused}
            isPlayerActive={isPlayerFullscreen}
          />
        );
      case 'favorites':
        return (
          <VideoList
            title="Favorites"
            storageKey={STORAGE_KEYS.FAVORITES}
            emptyIcon="star"
            emptyMessage="No favorite videos"
            emptySubtext="Add videos to favorites from the player"
            onPlayVideo={handlePlayVideo}
            onFocusSidebar={handleFocusSidebar}
            sidebarFocused={sidebarFocused}
            isPlayerActive={isPlayerFullscreen}
          />
        );
      case 'playlists':
        return (
          <PlaylistList
            onPlayVideo={handlePlayVideo}
            onFocusSidebar={handleFocusSidebar}
            sidebarFocused={sidebarFocused}
            isPlayerActive={isPlayerFullscreen}
          />
        );
      case 'history':
        return (
          <VideoList
            title="Watch History"
            storageKey={STORAGE_KEYS.WATCH_HISTORY}
            emptyIcon="history"
            emptyMessage="No watch history"
            emptySubtext="Videos you watch will appear here"
            onPlayVideo={handlePlayVideo}
            onFocusSidebar={handleFocusSidebar}
            sidebarFocused={sidebarFocused}
            isPlayerActive={isPlayerFullscreen}
          />
        );
      case 'settings':
        return (
          <Settings
            onFocusSidebar={handleFocusSidebar}
            sidebarFocused={sidebarFocused}
            user={currentUser}
            onLogout={handleLogout}
            isPlayerActive={isPlayerFullscreen}
          />
        );
      default:
        // Check if navigating to a channel
        if (selectedItem.startsWith('channel:')) {
          const channelId = selectedItem.replace('channel:', '');
          return (
            <CategoryView
              category={{ id: channelId, label: channelName || 'Channel', channelIds: [channelId] }}
              onPlayVideo={handlePlayVideo}
              onFocusSidebar={handleFocusSidebar}
              sidebarFocused={sidebarFocused}
            />
          );
        }

        // First check dynamic categories from API
        const dynamicCategory = dynamicCategories.find(c => c.id === selectedItem);
        if (dynamicCategory) {
          return (
            <CategoryView
              category={dynamicCategory}
              onPlayVideo={handlePlayVideo}
              onFocusSidebar={handleFocusSidebar}
              sidebarFocused={sidebarFocused}
            />
          );
        }

        // Then check static categories (cheese, big-hits, gaming, etc.)
        const staticCategory = CATEGORIES.find(c => c.id === selectedItem);
        if (staticCategory && staticCategory.tags) {
          return (
            <CategoryView
              category={staticCategory}
              onPlayVideo={handlePlayVideo}
              onFocusSidebar={handleFocusSidebar}
              sidebarFocused={sidebarFocused}
            />
          );
        }

        // Default to Home
        return (
          <Home
            onPlayVideo={handlePlayVideo}
            onFocusSidebar={handleFocusSidebar}
            sidebarFocused={sidebarFocused}
            user={currentUser}
          />
        );
    }
  };

  return (
    <>
      <AppShell
        padding={0}
        navbar={
          !isPlayerFullscreen ? (
            <Sidebar
              selectedItem={selectedItem}
              onSelectItem={handleSelectItem}
              focused={sidebarFocused}
              onFocusContent={() => setSidebarFocused(false)}
              user={currentUser}
              onLogout={handleLogout}
            />
          ) : null
        }
        className={`app-shell ${isPlayerFullscreen ? 'app-shell--player' : sidebarFocused ? 'app-shell--sidebar-expanded' : 'app-shell--sidebar-collapsed'}`}
        styles={{
          main: {
            backgroundColor: '#000000',
            minHeight: '100vh',
          },
        }}
      >
        {/* Keep content mounted but hidden when player is fullscreen */}
        <div style={{ display: isPlayerFullscreen ? 'none' : 'block' }}>
          <Suspense fallback={<LazyFallback />}>
            {renderContent()}
          </Suspense>
        </div>
      </AppShell>

      {/* Player overlay - rendered on top */}
      {isPlayerFullscreen && currentVideo && (
        <Suspense fallback={<LazyFallback />}>
          <Player
            video={currentVideo}
            onClose={handleClosePlayer}
            onNavigateToChannel={handleNavigateToChannel}
            onPlayNext={handlePlayNext}
            user={currentUser}
          />
        </Suspense>
      )}
    </>
  );
}
