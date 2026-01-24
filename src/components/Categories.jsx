import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Stack, Text, Loader, Center, Box, ScrollArea } from '@mantine/core';
import { useWindowEvent } from '@mantine/hooks';
import { IconCategory, IconMenu2, IconHome } from '@tabler/icons-react';
import VideoCard from './VideoCard';
import { getHomepageCategories, getVideosByChannelIds, getVideosByClaimIds } from '../api/odysee';
import { KEYCODE_UP, KEYCODE_DOWN, KEYCODE_LEFT, KEYCODE_RIGHT, KEYCODE_ENTER, KEYCODE_WEBOS_BACK, KEYCODE_ESCAPE } from '../constants';
import {
  IconGaming,
  IconMindBlown,
  IconFeatured,
  IconPopCulture,
  IconArtists,
  IconEducation,
  IconLifestyle,
  IconGhost,
  IconMusic,
  IconSports,
  IconScience,
  IconTech,
  IconNews,
  IconFinance,
  IconUniverse,
  IconCheese,
  IconCompass,
  IconChef,
  IconMovies,
  IconSpirituality,
  IconWildWest,
  IconPeace,
  IconPorkBun,
  IconLife,
  IconMysteries,
  IconConspiracy,
  IconHoliday,
  IconComedy,
} from './OdyseeIcons';

// Map category labels/icons to custom Odysee icons
const categoryIconMap = {
  // By label (from API response)
  'Featured': IconFeatured,
  'Discover': IconMindBlown,
  'Pop Culture': IconPopCulture,
  'Art': IconArtists,
  'Artists': IconArtists,
  'Education': IconEducation,
  'Lifestyle': IconLifestyle,
  'Spooky': IconGhost,
  'Horror': IconGhost,
  'Gaming': IconGaming,
  'Comedy': IconComedy,
  'Music': IconMusic,
  'Sports': IconSports,
  'Science': IconScience,
  'Technology': IconTech,
  'Finance': IconFinance,
  'Spirituality': IconSpirituality,
  'News': IconNews,
  'Movies': IconMovies,
  'Cooking': IconChef,
  'Food': IconChef,
  // By icon name from API
  'Home': IconHome,
  'MindBlown': IconMindBlown,
  'Ghost': IconGhost,
  'Speaker': IconTech,
  'Tech': IconTech,
  'MusicCategory': IconMusic,
  'Universe': IconUniverse,
  'DollarSign': IconFinance,
  'Aperature': IconNews,
  'WildWest': IconWildWest,
  'Compass': IconCompass,
  'Cheese': IconCheese,
  'Peace': IconPeace,
  'PorkBun': IconPorkBun,
  'Chef': IconChef,
  'Conspiracy': IconConspiracy,
  'RabbitHole': IconMysteries,
  'Mysteries': IconMysteries,
  'Anchor': IconSpirituality,
  'Enlightenment': IconSpirituality,
  'Holiday': IconHoliday,
  'Life': IconLife,
  'TV': IconPopCulture,
};

export default function Categories({ onPlayVideo, onFocusSidebar, sidebarFocused, isPlayerActive }) {
  const [allCategories, setAllCategories] = useState([]);
  const [sortedCategories, setSortedCategories] = useState([]);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [error, setError] = useState(null);
  const [selectedCategoryIndex, setSelectedCategoryIndex] = useState(0); // 0 = "All"
  const [selectedVideoIndex, setSelectedVideoIndex] = useState(0);
  const [focusArea, setFocusArea] = useState('categories'); // 'categories' or 'videos'
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Refs for scrolling
  const categoryItemRefs = useRef([]);
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

  // Load categories and initial videos
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        // Fetch categories from API
        const apiData = await getHomepageCategories();

        if (!apiData) {
          setError('Failed to load categories');
          setLoading(false);
          return;
        }

        const { categories: dynamicCategories } = apiData;

        // Only use dynamic categories - Featured and Discover are shown separately in sidebar
        const allCats = dynamicCategories || [];

        setAllCategories(allCats);

        // Load videos from all categories to determine activity
        const activityMap = {};
        let allVideos = [];

        // Load a sample of videos from each category to get activity times
        await Promise.all(
          allCats.map(async (cat) => {
            try {
              let catVideos;
              // Handle categories with channelIds vs pinnedClaimIds (Discover)
              if (cat.channelIds && cat.channelIds.length > 0) {
                catVideos = await getVideosByChannelIds(cat.channelIds, {
                  pageSize: 10,
                  daysOfContent: cat.daysOfContent || 90,
                });
              } else if (cat.pinnedClaimIds && cat.pinnedClaimIds.length > 0) {
                catVideos = await getVideosByClaimIds(cat.pinnedClaimIds, {
                  pageSize: cat.pinnedClaimIds.length,
                });
              }
              if (catVideos && catVideos.length > 0) {
                // Most recent video time for this category
                const mostRecent = Math.max(...catVideos.map(v => v.releaseTime || 0));
                activityMap[cat.id] = mostRecent;
                // Add to all videos pool for "All" view
                allVideos = [...allVideos, ...catVideos];
              }
            } catch (err) {
              console.error(`Failed to load category ${cat.id}:`, err);
            }
          })
        );

        // Sort categories by most recent activity
        const sorted = [...allCats].sort((a, b) => {
          const aTime = activityMap[a.id] || 0;
          const bTime = activityMap[b.id] || 0;
          return bTime - aTime; // Most recent first
        });
        setSortedCategories(sorted);

        // Remove duplicates from allVideos and sort by release time - efficient with Set
        const seenIds = new Set();
        const uniqueVideos = allVideos
          .filter(v => {
            if (seenIds.has(v.id)) return false;
            seenIds.add(v.id);
            return true;
          })
          .sort((a, b) => (b.releaseTime || 0) - (a.releaseTime || 0));

        setVideos(uniqueVideos.slice(0, 40));
      } catch (err) {
        console.error('Failed to load categories:', err);
        setError('Failed to load categories');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const PAGE_SIZE = 40;

  // Helper to load videos for a category (handles both channelIds and pinnedClaimIds)
  const loadVideosForCategory = async (cat, pageSize, page = 1) => {
    if (cat.channelIds && cat.channelIds.length > 0) {
      return await getVideosByChannelIds(cat.channelIds, {
        pageSize,
        page,
        daysOfContent: cat.daysOfContent || 90,
      });
    } else if (cat.pinnedClaimIds && cat.pinnedClaimIds.length > 0) {
      // Discover uses pinnedClaimIds - no pagination
      return await getVideosByClaimIds(cat.pinnedClaimIds, {
        pageSize: cat.pinnedClaimIds.length,
      });
    }
    return [];
  };

  // Load videos when category selection changes
  useEffect(() => {
    async function loadCategoryVideos() {
      if (loading) return;

      setLoadingVideos(true);
      setPage(1);
      setHasMore(true);
      try {
        let data;
        if (selectedCategoryIndex === 0) {
          // "All" selected - load mixed videos from all categories
          let allVideos = [];
          await Promise.all(
            sortedCategories.map(async (cat) => {
              try {
                const catVideos = await loadVideosForCategory(cat, 20);
                if (catVideos) allVideos = [...allVideos, ...catVideos];
              } catch (err) {
                console.error(`Failed to load category ${cat.id}:`, err);
              }
            })
          );
          // Remove duplicates and sort by release time - efficient with Set
          const seenIds = new Set();
          data = allVideos
            .filter(v => {
              if (seenIds.has(v.id)) return false;
              seenIds.add(v.id);
              return true;
            })
            .sort((a, b) => (b.releaseTime || 0) - (a.releaseTime || 0));
        } else {
          // Specific category selected
          const category = sortedCategories[selectedCategoryIndex - 1];
          if (category) {
            data = await loadVideosForCategory(category, PAGE_SIZE, 1);
          } else {
            data = [];
          }
        }
        setVideos(data || []);
        // Discover (pinnedClaimIds) doesn't support pagination
        const category = sortedCategories[selectedCategoryIndex - 1];
        const supportsPagination = selectedCategoryIndex !== 0 && category?.channelIds;
        setHasMore(supportsPagination && (data || []).length >= PAGE_SIZE);
        setSelectedVideoIndex(0);
      } catch (err) {
        console.error('Failed to load category videos:', err);
      } finally {
        setLoadingVideos(false);
      }
    }

    if (sortedCategories.length > 0) {
      loadCategoryVideos();
    }
  }, [selectedCategoryIndex, sortedCategories, loading]);

  // Load more videos (lazy loading) - only for categories with channelIds
  const loadMoreVideos = useCallback(async () => {
    if (loadingMore || !hasMore || loadingVideos) return;
    if (selectedCategoryIndex === 0) return; // "All" loads everything upfront

    const category = sortedCategories[selectedCategoryIndex - 1];
    // Only categories with channelIds support pagination (not Discover)
    if (!category || !category.channelIds) return;

    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const data = await getVideosByChannelIds(category.channelIds, {
        pageSize: PAGE_SIZE,
        page: nextPage,
        daysOfContent: category.daysOfContent || 90,
      });

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
  }, [loadingMore, hasMore, loadingVideos, page, selectedCategoryIndex, sortedCategories]);

  // Scroll selected category into view
  useEffect(() => {
    if (focusArea === 'categories' && categoryItemRefs.current[selectedCategoryIndex]) {
      categoryItemRefs.current[selectedCategoryIndex].scrollIntoView({
        behavior: 'instant',
        block: 'nearest',
      });
    }
  }, [selectedCategoryIndex, focusArea]);

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
        } else if (focusArea === 'categories' && categoryItemRefs.current[selectedCategoryIndex]) {
          categoryItemRefs.current[selectedCategoryIndex]?.scrollIntoView({
            behavior: 'instant',
            block: 'nearest',
          });
        }
      }, 50);
    }
  }, [isPlayerActive, focusArea, selectedVideoIndex, selectedCategoryIndex]);

  // Total category items (All + sortedCategories)
  const totalCategoryItems = 1 + sortedCategories.length;

  // Handle keyboard navigation
  useWindowEvent('keydown', (event) => {
    if (sidebarFocused || isPlayerActive) return;

    const keyCode = event.keyCode.toString();

    if (focusArea === 'categories') {
      // Navigation in category sidebar
      switch (keyCode) {
        case KEYCODE_UP:
          event.preventDefault();
          setSelectedCategoryIndex(prev => Math.max(0, prev - 1));
          break;
        case KEYCODE_DOWN:
          event.preventDefault();
          setSelectedCategoryIndex(prev => Math.min(totalCategoryItems - 1, prev + 1));
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
              // Load more when approaching the end
              const totalRows = Math.ceil(videos.length / columns);
              const nextRow = Math.floor(nextIndex / columns);
              if (nextRow >= totalRows - 2 && hasMore && !loadingMore) {
                loadMoreVideos();
              }
            } else if (hasMore && !loadingMore) {
              loadMoreVideos();
            }
          }
          break;
        case KEYCODE_LEFT:
          event.preventDefault();
          if (currentCol === 0) {
            setFocusArea('categories');
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
          setFocusArea('categories');
          break;
      }
    }
  });

  const handleCategoryClick = useCallback((index) => {
    setSelectedCategoryIndex(index);
    setFocusArea('categories');
  }, []);

  const handleVideoClick = useCallback((video, index) => {
    setSelectedVideoIndex(index);
    onPlayVideo(video);
  }, [onPlayVideo]);

  // Get icon for category
  const getCategoryIcon = (category) => {
    // Check by label first, then by icon name from API
    return categoryIconMap[category.label] || categoryIconMap[category.icon] || IconCategory;
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
          <IconCategory size={64} color="#888" />
          <Text color="dimmed" size="lg" align="center">{error}</Text>
        </Stack>
      </Center>
    );
  }

  const isCategoriesFocused = !sidebarFocused && focusArea === 'categories';
  const isVideosFocused = !sidebarFocused && focusArea === 'videos';

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Secondary Sidebar - Categories */}
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
              Categories
            </Text>
          </Box>

          {/* Category List */}
          <ScrollArea style={{ flex: 1 }} offsetScrollbars ref={scrollAreaRef}>
            <Stack spacing={0} p="xs">
              {/* All option */}
              <Box
                ref={el => categoryItemRefs.current[0] = el}
                onClick={() => handleCategoryClick(0)}
                py={6}
                px="sm"
                className={`following-channel-item ${selectedCategoryIndex === 0 ? 'following-channel-item--selected' : ''}`}
                style={{
                  borderRadius: '8px',
                  cursor: 'pointer',

                }}
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <IconMenu2 size={40} color={selectedCategoryIndex === 0 ? '#de0050' : '#888'} style={{ marginRight: '16px' }} />
                  <Text color={selectedCategoryIndex === 0 ? '#de0050' : 'white'} weight={600} size="lg">
                    All
                  </Text>
                </div>
              </Box>

              {/* Category list */}
              {sortedCategories.map((category, index) => {
                const itemIndex = index + 1;
                const isSelected = selectedCategoryIndex === itemIndex;
                const CategoryIcon = getCategoryIcon(category);

                return (
                  <Box
                    key={category.id || index}
                    ref={el => categoryItemRefs.current[itemIndex] = el}
                    onClick={() => handleCategoryClick(itemIndex)}
                    py={6}
                    px="sm"
                    className={`following-channel-item ${isSelected ? 'following-channel-item--selected' : ''}`}
                    style={{
                      borderRadius: '8px',
                      cursor: 'pointer',

                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', maxWidth: '340px' }}>
                      <CategoryIcon
                        size={40}
                        color={isSelected ? '#de0050' : '#888'}
                        style={{ flexShrink: 0, marginRight: '16px' }}
                      />
                      <Text
                        color={isSelected ? '#de0050' : 'white'}
                        size="lg"
                        weight={500}
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '280px',
                        }}
                      >
                        {category.label}
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
              {selectedCategoryIndex === 0
                ? 'All Categories'
                : sortedCategories[selectedCategoryIndex - 1]?.label || 'Category'}
            </Text>

            {loadingVideos ? (
              <Center style={{ height: '70vh' }}>
                <Loader color="pink" size="xl" />
              </Center>
            ) : videos.length === 0 ? (
              <Center py="xl">
                <Stack align="center" spacing="md">
                  <IconCategory size={64} color="#888" />
                  <Text color="dimmed" size="lg" align="center">
                    No videos found
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
