import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Stack, Text, Loader, Center } from '@mantine/core';
import { useWindowEvent } from '@mantine/hooks';
import VideoCarousel from './VideoCarousel';
import { getHomepageCategories, getVideosByChannelIds, getFollowingVideos, limitConcurrency } from '../api/odysee';
import { KEYCODE_UP, KEYCODE_DOWN } from '../constants';

export default function Home({ onPlayVideo, onFocusSidebar, sidebarFocused, user, isPlayerActive }) {
  const [categories, setCategories] = useState({});
  const [homeCategories, setHomeCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeRow, setActiveRow] = useState(0);
  const [activeItems, setActiveItems] = useState({});
  const carouselRefs = useRef({});
  const rowRefs = useRef({});
  const containerRef = useRef(null);

  // Determine if user is logged in
  const isLoggedIn = user && user.primary_email;

  // Load homepage categories from Odysee content API and then load videos
  useEffect(() => {
    async function loadContent() {
      setLoading(true);
      setError(null);

      try {
        // Fetch dynamic categories from Odysee
        const apiData = await getHomepageCategories();

        if (!apiData) {
          setError('Failed to load categories');
          setLoading(false);
          return;
        }

        const { featured, discover, categories: dynamicCategories } = apiData;

        // Build the list of categories to display in order:
        // 1. Following (if logged in)
        // 2. Featured
        // 3. All dynamic categories (Pop Culture, Gaming, etc.)
        let categoriesToLoad = [];

        // If logged in, add Following as first category
        if (isLoggedIn) {
          categoriesToLoad.push({
            id: 'following',
            label: 'Following',
            isFollowing: true,
          });
        }

        // Add Featured if available
        if (featured) {
          categoriesToLoad.push(featured);
        }

        // Add all dynamic categories from the API (no limit)
        // Note: Discover is available in the Categories view
        if (dynamicCategories && dynamicCategories.length > 0) {
          categoriesToLoad = [...categoriesToLoad, ...dynamicCategories];
        }

        setHomeCategories(categoriesToLoad);

        // Load videos for each category with limited concurrency (max 3 parallel requests)
        // This prevents overwhelming the TV's network stack
        const tasks = categoriesToLoad.map((cat) => async () => {
          try {
            let videos;
            if (cat.isFollowing) {
              videos = await getFollowingVideos({ pageSize: 20 });
            } else {
              videos = await getVideosByChannelIds(cat.channelIds, {
                pageSize: cat.pageSize || 20,
                daysOfContent: cat.daysOfContent || 90,
              });
            }
            return { id: cat.id, label: cat.label, videos };
          } catch (err) {
            console.error(`Failed to load ${cat.id}:`, err);
            return { id: cat.id, label: cat.label, videos: [] };
          }
        });

        const results = await limitConcurrency(tasks, 3);

        const categoriesMap = {};
        const initialActiveItems = {};
        results.forEach(result => {
          categoriesMap[result.id] = result;
          initialActiveItems[result.id] = 0;
        });

        setCategories(categoriesMap);
        setActiveItems(initialActiveItems);
      } catch (err) {
        setError('Failed to load content');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadContent();
  }, [isLoggedIn]);

  // Memoize visible categories to avoid filtering on every render
  // IMPORTANT: Must be defined before useEffects that reference it
  const visibleCategories = useMemo(() => {
    return homeCategories.filter(cat => {
      const categoryData = categories[cat.id];
      return categoryData && categoryData.videos && categoryData.videos.length > 0;
    });
  }, [homeCategories, categories]);

  // Scroll to active row when it changes
  useEffect(() => {
    const activeCategory = visibleCategories[activeRow];
    if (activeCategory && rowRefs.current[activeCategory.id]) {
      rowRefs.current[activeCategory.id].scrollIntoView({
        behavior: 'instant',
        block: 'center',
      });
    }
  }, [activeRow, visibleCategories]);

  // Restore scroll position when returning from player
  useEffect(() => {
    if (!isPlayerActive) {
      const activeCategory = visibleCategories[activeRow];
      if (activeCategory && rowRefs.current[activeCategory.id]) {
        // Use setTimeout to ensure the view is visible before scrolling
        setTimeout(() => {
          rowRefs.current[activeCategory.id]?.scrollIntoView({
            behavior: 'instant',
            block: 'center',
          });
        }, 50);
      }
    }
  }, [isPlayerActive, activeRow, visibleCategories]);

  // Handle keyboard navigation (only up/down for row switching)
  useWindowEvent('keydown', (event) => {
    if (sidebarFocused || isPlayerActive || visibleCategories.length === 0) return;

    // Prevent handling if already handled
    if (event.defaultPrevented) return;

    const keyCode = event.keyCode.toString();

    switch (keyCode) {
      case KEYCODE_UP:
        event.preventDefault();
        event.stopImmediatePropagation();
        setActiveRow(prev => Math.max(0, prev - 1));
        break;
      case KEYCODE_DOWN:
        event.preventDefault();
        event.stopImmediatePropagation();
        setActiveRow(prev => Math.min(visibleCategories.length - 1, prev + 1));
        break;
      // Left/right handled by VideoCarousel
    }
  });

  // Handle video selection
  const handleVideoSelect = useCallback((video) => {
    onPlayVideo(video);
  }, [onPlayVideo]);

  // Handle carousel navigation
  const handleCarouselNavigate = useCallback((categoryId, index) => {
    setActiveItems(prev => ({
      ...prev,
      [categoryId]: index,
    }));
  }, []);

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

  return (
    <div className="home-container" ref={containerRef}>
      <Stack spacing="xl" p="md">
        {visibleCategories.map((cat, rowIndex) => {
          const categoryData = categories[cat.id];

          return (
            <div
              key={cat.id}
              className="category-row"
              ref={el => rowRefs.current[cat.id] = el}
            >
              <Text
                size="xl"
                weight={600}
                color="white"
                mb="sm"
                className="category-title"
              >
                {cat.label}
              </Text>
              <VideoCarousel
                ref={el => carouselRefs.current[cat.id] = el}
                videos={categoryData.videos}
                isActive={activeRow === rowIndex && !sidebarFocused && !isPlayerActive}
                showSelection={activeRow === rowIndex && !isPlayerActive}
                activeIndex={activeItems[cat.id] || 0}
                onNavigate={(index) => handleCarouselNavigate(cat.id, index)}
                onSelect={handleVideoSelect}
                onFocusSidebar={onFocusSidebar}
              />
            </div>
          );
        })}
      </Stack>
    </div>
  );
}
