import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Stack, Text, Loader, Center, SegmentedControl, TextInput } from '@mantine/core';
import { useDebouncedValue, useWindowEvent } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import VideoCard from './VideoCard';
import ChannelCard from './ChannelCard';
import { searchVideos, searchChannels } from '../api/odysee';
import {
  KEYCODE_UP, KEYCODE_DOWN, KEYCODE_LEFT, KEYCODE_RIGHT, KEYCODE_ENTER,
  STORAGE_KEYS
} from '../constants';

const ITEMS_PER_PAGE = 20;

function Search({ onPlayVideo, onViewChannel, onFocusSidebar, sidebarFocused, isPlayerActive }) {
  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebouncedValue(query, 500);
  const [searchType, setSearchType] = useState('videos');
  const [allResults, setAllResults] = useState([]);
  const [displayedResults, setDisplayedResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [focusArea, setFocusArea] = useState('input'); // 'input', 'type', 'results'
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef(null);
  const videoRefs = useRef([]);
  const gridRef = useRef(null);

  // Mantine TextInput styles - remove all borders, scale up
  const inputStyles = useMemo(() => ({
    root: {
      flex: 1,
    },
    wrapper: {
      backgroundColor: 'transparent',
    },
    input: {
      fontSize: '2.1rem',
      padding: '20px 22px',
      height: 'auto',
      minHeight: '70px',
      backgroundColor: 'transparent',
      color: '#fff',
      border: 'none !important',
      borderLeft: 'none !important',
      borderRadius: 0,
      '&:focus': {
        border: 'none !important',
        outline: 'none'
      },
      '&::placeholder': {
        color: '#888'
      }
    }
  }), []);

  // Calculate actual column count from grid
  const getColumnCount = useCallback(() => {
    if (!gridRef.current || displayedResults.length === 0) return 4;
    const gridStyle = window.getComputedStyle(gridRef.current);
    const columns = gridStyle.getPropertyValue('grid-template-columns').split(' ').length;
    return columns || 4;
  }, [displayedResults.length]);

  // Perform search when debounced query changes
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 3) {
      setAllResults([]);
      setDisplayedResults([]);
      return;
    }

    async function performSearch() {
      console.log('Performing search for:', debouncedQuery, 'type:', searchType);
      setLoading(true);
      try {
        // Read mature content setting
        let showMature = false;
        try {
          const settings = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '{}');
          showMature = settings.nsfw === true;
        } catch (e) {
          // ignore
        }

        const searchFn = searchType === 'videos' ? searchVideos : searchChannels;
        const data = await searchFn(debouncedQuery, { size: 40, nsfw: showMature });
        console.log('Search returned:', data?.length, 'results');
        setAllResults(data || []);
        setDisplayedResults((data || []).slice(0, ITEMS_PER_PAGE));
        setSelectedIndex(0);
      } catch (err) {
        console.error('Search failed:', err);
        setAllResults([]);
        setDisplayedResults([]);
      } finally {
        setLoading(false);
      }
    }

    performSearch();
  }, [debouncedQuery, searchType]);

  // Load more results
  const loadMore = useCallback(() => {
    if (loadingMore || displayedResults.length >= allResults.length) return;

    setLoadingMore(true);
    setTimeout(() => {
      const nextBatch = allResults.slice(
        displayedResults.length,
        displayedResults.length + ITEMS_PER_PAGE
      );
      setDisplayedResults(prev => [...prev, ...nextBatch]);
      setLoadingMore(false);
    }, 100);
  }, [loadingMore, displayedResults.length, allResults]);

  // Scroll selected result into view
  useEffect(() => {
    if (focusArea === 'results' && videoRefs.current[selectedIndex]) {
      videoRefs.current[selectedIndex].scrollIntoView({
        behavior: 'instant',
        block: 'nearest',
      });
    }
  }, [selectedIndex, focusArea]);

  // Restore scroll position when returning from player
  useEffect(() => {
    if (!isPlayerActive && focusArea === 'results' && videoRefs.current[selectedIndex]) {
      setTimeout(() => {
        videoRefs.current[selectedIndex]?.scrollIntoView({
          behavior: 'instant',
          block: 'nearest',
        });
      }, 50);
    }
  }, [isPlayerActive, selectedIndex, focusArea]);

  // Focus input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Also refocus when returning from other areas
  useEffect(() => {
    if (!sidebarFocused && !isPlayerActive && focusArea === 'input' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [sidebarFocused, focusArea, isPlayerActive]);

  // Handle keyboard navigation
  useWindowEvent('keydown', (event) => {
    if (sidebarFocused || isPlayerActive) return;

    const key = event.key;
    // Match cccbib's exact pattern
    const isInputFocused = document.activeElement === inputRef.current;

    // When input is focused, only handle navigation keys - let everything else pass to webOS
    if (isInputFocused) {
      if (key === 'ArrowDown') {
        event.preventDefault();
        inputRef.current?.blur();
        setFocusArea('type');
      } else if (key === 'ArrowLeft' && query === '') {
        inputRef.current?.blur();
        onFocusSidebar();
      }
      // Let ALL other keys (including Enter) pass through to webOS for keyboard
      return;
    }

    if (focusArea === 'input') {
      if (key === 'ArrowDown') {
        event.preventDefault();
        setFocusArea('type');
      } else if (key === 'ArrowLeft' && query === '') {
        onFocusSidebar();
      } else if (key === 'Enter') {
        // Focus the input to show keyboard
        inputRef.current?.focus();
      }
    } else if (focusArea === 'type') {
      if (key === 'ArrowUp') {
        event.preventDefault();
        setFocusArea('input');
        inputRef.current?.focus();
      } else if (key === 'ArrowDown') {
        event.preventDefault();
        if (displayedResults.length > 0) {
          setFocusArea('results');
          setSelectedIndex(0);
        }
      } else if (key === 'ArrowLeft') {
        event.preventDefault();
        if (searchType === 'videos') {
          onFocusSidebar();
        } else {
          setSearchType('videos');
        }
      } else if (key === 'ArrowRight') {
        event.preventDefault();
        setSearchType('channels');
      }
    } else if (focusArea === 'results') {
      const columns = getColumnCount();
      const currentRow = Math.floor(selectedIndex / columns);
      const currentCol = selectedIndex % columns;

      if (key === 'ArrowUp') {
        event.preventDefault();
        if (currentRow === 0) {
          setFocusArea('type');
        } else {
          setSelectedIndex(prev => Math.max(0, prev - columns));
        }
      } else if (key === 'ArrowDown') {
        event.preventDefault();
        const nextIndex = selectedIndex + columns;
        if (nextIndex < displayedResults.length) {
          setSelectedIndex(nextIndex);
          const totalRows = Math.ceil(displayedResults.length / columns);
          const nextRow = Math.floor(nextIndex / columns);
          if (nextRow >= totalRows - 2 && displayedResults.length < allResults.length) {
            loadMore();
          }
        } else if (displayedResults.length < allResults.length) {
          loadMore();
        }
      } else if (key === 'ArrowLeft') {
        event.preventDefault();
        if (currentCol === 0) {
          onFocusSidebar();
        } else {
          setSelectedIndex(prev => Math.max(0, prev - 1));
        }
      } else if (key === 'ArrowRight') {
        event.preventDefault();
        if (currentCol < columns - 1 && selectedIndex < displayedResults.length - 1) {
          setSelectedIndex(prev => prev + 1);
        }
      } else if (key === 'Enter') {
        event.preventDefault();
        if (displayedResults[selectedIndex]) {
          if (searchType === 'channels') {
            const channel = displayedResults[selectedIndex];
            onViewChannel(channel.id, channel.title || channel.name);
          } else {
            onPlayVideo(displayedResults[selectedIndex]);
          }
        }
      }
    }
  });

  const handleResultClick = useCallback((item, index) => {
    setSelectedIndex(index);
    if (searchType === 'channels') {
      onViewChannel(item.id, item.title || item.name);
    } else {
      onPlayVideo(item);
    }
  }, [onPlayVideo, onViewChannel, searchType]);

  return (
    <div className="search-container">
      <Stack p="md" spacing="md">
        <div className={`search-input-wrapper ${focusArea === 'input' ? 'search-input--focused' : ''}`}>
          <IconSearch size={32} color="#888" style={{ marginLeft: 18 }} />
          <TextInput
            ref={inputRef}
            size="lg"
            placeholder="Search Odysee..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            styles={inputStyles}
          />
          {loading && (
            <Loader color="pink" size="sm" style={{ marginRight: 18 }} />
          )}
        </div>

        <SegmentedControl
          value={searchType}
          onChange={setSearchType}
          size="lg"
          data={[
            { label: 'Videos', value: 'videos' },
            { label: 'Channels', value: 'channels' },
          ]}
          className={`search-type-selector ${focusArea === 'type' ? 'search-type-selector--focused' : ''}`}
        />

        {displayedResults.length > 0 ? (
          <>
            <div className="search-results-grid" ref={gridRef}>
              {displayedResults.map((item, index) => (
                <div
                  key={item.id}
                  ref={el => videoRefs.current[index] = el}
                >
                  {searchType === 'channels' ? (
                    <ChannelCard
                      channel={item}
                      isActive={index === selectedIndex}
                      onClick={() => handleResultClick(item, index)}
                    />
                  ) : (
                    <VideoCard
                      video={item}
                      isActive={index === selectedIndex}
                      onClick={() => handleResultClick(item, index)}
                    />
                  )}
                </div>
              ))}
            </div>

            {loadingMore && (
              <Center py="md">
                <Loader color="pink" size="sm" />
              </Center>
            )}

            {displayedResults.length < allResults.length && !loadingMore && (
              <Center>
                <Text color="dimmed" size="sm">
                  Showing {displayedResults.length} of {allResults.length} • Scroll down for more
                </Text>
              </Center>
            )}
          </>
        ) : query.length >= 3 && !loading ? (
          <Center py="xl">
            <Text color="dimmed" size="lg">No results found</Text>
          </Center>
        ) : null}
      </Stack>
    </div>
  );
}

export default React.memo(Search);
