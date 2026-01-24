import { LBRY_API_URL, LIGHTHOUSE_URL, LBRY_CDN_URL, THUMBNAIL_CDN_URL, EXCLUDED_TAGS, VIDEOS_PER_PAGE, STORAGE_KEYS, ODYSEE_CONTENT_API_URL } from '../constants';

// Odysee SDK proxy URL for wallet operations
// Use local proxy in development to bypass CORS, direct URL on WebOS device
const IS_DEV = typeof window !== 'undefined' && window.location.hostname === 'localhost';
const ODYSEE_PROXY_URL = IS_DEV
  ? '/odysee-proxy/api/v1/proxy'
  : 'https://api.na-backend.odysee.com/api/v1/proxy';

// ============================================
// API CACHE - Reduces redundant network calls
// ============================================
const MAX_CACHE_ENTRIES = 100; // Prevent memory bloat on long sessions

const cache = {
  data: new Map(),
  TTL: {
    homepage: 15 * 60 * 1000,     // 15 minutes for homepage categories
    subscriptions: 5 * 60 * 1000, // 5 minutes for subscriptions
    videos: 3 * 60 * 1000,        // 3 minutes for video lists
    reactions: 10 * 60 * 1000,    // 10 minutes for reactions
    search: 2 * 60 * 1000,        // 2 minutes for search results
    channels: 10 * 60 * 1000,     // 10 minutes for channel data
  },
  inflight: new Map(), // Track in-flight requests to prevent duplicates
};

// ============================================
// CONCURRENT REQUEST LIMITER
// Prevents overwhelming TV network stack
// ============================================
export async function limitConcurrency(tasks, limit = 3) {
  const results = [];
  const executing = new Set();

  for (const task of tasks) {
    const promise = Promise.resolve().then(() => task()).then(result => {
      executing.delete(promise);
      return result;
    });
    executing.add(promise);
    results.push(promise);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

function getCached(key, ttlType) {
  const entry = cache.data.get(key);
  if (entry && (Date.now() - entry.timestamp) < cache.TTL[ttlType]) {
    return entry.data;
  }
  return null;
}

function setCache(key, data) {
  // Evict oldest entries if cache is full (LRU-style)
  if (cache.data.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.data.keys().next().value;
    cache.data.delete(oldestKey);
  }
  cache.data.set(key, { data, timestamp: Date.now() });
}

// Deduplicate in-flight requests
async function dedupeRequest(key, requestFn) {
  // Return cached if available
  const inflight = cache.inflight.get(key);
  if (inflight) {
    return inflight;
  }

  // Create new request promise
  const promise = requestFn().finally(() => {
    cache.inflight.delete(key);
  });

  cache.inflight.set(key, promise);
  return promise;
}

// Clear cache on logout
export function clearApiCache() {
  cache.data.clear();
  cache.inflight.clear();
}

let requestId = Date.now();
let authToken = null;
let currentUser = null;

// Generate unique request ID
const getRequestId = () => ++requestId;

// Initialize auth from localStorage
export function initAuth() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.AUTH);
    if (saved) {
      const data = JSON.parse(saved);
      authToken = data.authToken;
      currentUser = data.user;
      return currentUser;
    }
  } catch (err) {
    console.error('Failed to load auth:', err);
  }
  return null;
}

// Save auth to localStorage
function saveAuth() {
  try {
    if (authToken) {
      localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify({
        authToken,
        user: currentUser,
      }));
    } else {
      localStorage.removeItem(STORAGE_KEYS.AUTH);
    }
  } catch (err) {
    console.error('Failed to save auth:', err);
  }
}

// Get current user
export function getCurrentUser() {
  return currentUser;
}

// Check if logged in
export function isLoggedIn() {
  return currentUser && currentUser.primary_email;
}

// Create anonymous account (required for API calls)
export async function createAnonymousAccount() {
  if (authToken) return authToken;

  try {
    const response = await fetch('https://api.lbry.com/user/new');
    const data = await response.json();

    if (data.success && data.data) {
      authToken = data.data.auth_token;
      saveAuth();
      return authToken;
    }
  } catch (err) {
    console.error('Failed to create anonymous account:', err);
  }
  return null;
}

// Ensure we have an auth token
async function ensureAuth() {
  if (!authToken) {
    await createAnonymousAccount();
  }
  return authToken;
}

// Check if email exists
export async function checkEmailExists(email) {
  await ensureAuth();

  try {
    const response = await fetch('https://api.lbry.com/user/exists', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        auth_token: authToken,
        email: email,
      }),
    });
    const data = await response.json();

    return data.success && data.data;
  } catch (err) {
    console.error('checkEmailExists error:', err);
    return false;
  }
}

// Login with email and password
export async function login(email, password) {
  await ensureAuth();

  try {
    const response = await fetch('https://api.lbry.com/user/signin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        auth_token: authToken,
        email: email,
        password: password,
      }),
    });
    const data = await response.json();

    if (data.success && data.data) {
      // Update auth token if provided
      if (data.data.auth_token) {
        authToken = data.data.auth_token;
      }
      currentUser = data.data;
      saveAuth();
      return { success: true, user: currentUser };
    }

    // Extract error message
    let errorMsg = 'Login failed';
    if (data.error) {
      errorMsg = typeof data.error === 'string' ? data.error : data.error.message || 'Login failed';
    }

    return { success: false, error: errorMsg };
  } catch (err) {
    console.error('login error:', err);
    return { success: false, error: 'Network error. Please try again.' };
  }
}

// Request magic link (signin without password)
export async function requestMagicLink(email) {
  await ensureAuth();

  try {
    // First, try signin with just email
    const response = await fetch('https://api.lbry.com/user/signin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        auth_token: authToken,
        email: email,
      }),
    });
    const data = await response.json();

    // If successful, magic link was sent
    if (data.success) {
      if (data.data && data.data.auth_token) {
        authToken = data.data.auth_token;
        saveAuth();
      }
      return { success: true, message: 'Magic link sent to your email' };
    }

    // On 409 (email exists with password), resend verification token
    // This is how Odysee frontend handles magic link for existing accounts
    if (response.status === 409) {
      const resendResponse = await fetch('https://api.lbry.com/user_email/resend_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          auth_token: authToken,
          email: email,
          only_if_expired: 'true',
        }),
      });
      const resendData = await resendResponse.json();

      if (resendData.success) {
        return { success: true, message: 'Magic link sent to your email' };
      }
    }

    // Extract error message
    let errorMsg = 'Failed to send magic link';
    if (data.error) {
      errorMsg = typeof data.error === 'string' ? data.error : data.error.message || errorMsg;
    }

    return { success: false, error: errorMsg };
  } catch (err) {
    console.error('requestMagicLink error:', err);
    return { success: false, error: 'Network error. Please try again.' };
  }
}

// Check if user has verified email (poll after magic link sent)
export async function checkLoginStatus() {
  if (!authToken) return null;

  try {
    const response = await fetch('https://api.lbry.com/user/me', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        auth_token: authToken,
      }),
    });
    const data = await response.json();

    if (data.success && data.data) {
      // Check if user has verified their email (has primary_email set)
      if (data.data.primary_email && data.data.has_verified_email) {
        currentUser = data.data;
        saveAuth();
        return currentUser;
      }
    }
  } catch (err) {
    console.error('Failed to check login status:', err);
  }
  return null;
}

// Get current user info
export async function getUserInfo() {
  if (!authToken) return null;

  try {
    const response = await fetch('https://api.lbry.com/user/me', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        auth_token: authToken,
      }),
    });
    const data = await response.json();

    if (data.success && data.data) {
      currentUser = data.data;
      saveAuth();
      return currentUser;
    }
  } catch (err) {
    console.error('Failed to get user info:', err);
  }
  return null;
}

// Logout
export async function logout() {
  if (!authToken) return;

  try {
    const params = new URLSearchParams({ auth_token: authToken });
    await fetch('https://api.lbry.com/user/signout?' + params, { method: 'POST' });
  } catch (err) {
    console.error('Logout error:', err);
  }

  currentUser = null;
  authToken = null;
  saveAuth();
}

// Get user subscriptions/following (cached)
export async function getSubscriptions() {
  if (!authToken || !isLoggedIn()) return [];

  const cacheKey = 'subscriptions';
  const cached = getCached(cacheKey, 'subscriptions');
  if (cached) return cached;

  return dedupeRequest(cacheKey, async () => {
    try {
      const response = await fetch('https://api.lbry.com/subscription/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          auth_token: authToken,
        }),
      });
      const data = await response.json();

      if (data.success && data.data) {
        setCache(cacheKey, data.data);
        return data.data;
      }
    } catch (err) {
      console.error('Failed to get subscriptions:', err);
    }
    return [];
  });
}

// Fetch homepage categories from Odysee content API (cached)
export async function getHomepageCategories() {
  const cacheKey = 'homepage_categories';

  // Return cached data if available
  const cached = getCached(cacheKey, 'homepage');
  if (cached) return cached;

  // Dedupe concurrent requests
  return dedupeRequest(cacheKey, async () => {
    try {
      const response = await fetch(ODYSEE_CONTENT_API_URL);
      const data = await response.json();

      if (data.status === 'success' && data.data?.en?.categories) {
        const categories = data.data.en.categories;
        let featured = null;
        let discover = null;
        const dynamicCategories = [];

        // Map the API categories to our format
        for (const [key, cat] of Object.entries(categories)) {
          // Handle categories with channelIds
          if (cat.channelIds && cat.channelIds.length > 0) {
            const category = {
              id: key,
              label: cat.label || cat.name,
              icon: cat.icon,
              channelIds: cat.channelIds.slice(0, 100),
              sortOrder: cat.sortOrder || 999,
              pageSize: cat.pageSize || 20,
              daysOfContent: cat.daysOfContent || 90,
            };

            if (key === 'PRIMARY_CONTENT') {
              featured = { ...category, label: 'Featured' };
            } else {
              dynamicCategories.push(category);
            }
          }
          // Handle Discover category which uses pinnedClaimIds instead of channelIds
          else if (key === 'EXPLORABLE_CHANNEL' && cat.pinnedClaimIds && cat.pinnedClaimIds.length > 0) {
            discover = {
              id: key,
              label: 'Discover',
              icon: cat.icon,
              pinnedClaimIds: cat.pinnedClaimIds,
              sortOrder: cat.sortOrder || 1,
              pageSize: cat.pageSize || 12,
              daysOfContent: cat.daysOfContent || 90,
            };
          }
        }

        // Sort dynamic categories by sortOrder
        dynamicCategories.sort((a, b) => a.sortOrder - b.sortOrder);

        const result = {
          featured,
          discover,
          categories: dynamicCategories,
        };

        setCache(cacheKey, result);
        return result;
      }
    } catch (err) {
      console.error('Failed to fetch homepage categories:', err);
    }
    return null;
  });
}

// Simple hash function for cache keys
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

// Get videos by channel IDs (for homepage categories) - cached
export async function getVideosByChannelIds(channelIds, options = {}) {
  if (!channelIds || channelIds.length === 0) return [];

  // Create cache key from params using hash to avoid collisions
  const idsHash = simpleHash(channelIds.join(','));
  const cacheKey = `videos_${idsHash}_${options.page || 1}_${options.pageSize || VIDEOS_PER_PAGE}`;
  const cached = getCached(cacheKey, 'videos');
  if (cached) return cached;

  return dedupeRequest(cacheKey, async () => {
    const expiration = Math.floor(Date.now() / 1000) - (options.daysOfContent || 90) * 86400;

    const result = await queryLBRY('claim_search', {
      channel_ids: channelIds,
      page_size: options.pageSize || VIDEOS_PER_PAGE,
      page: options.page || 1,
      claim_type: ['stream'],
      no_totals: true,
      not_tags: EXCLUDED_TAGS,
      order_by: ['trending_group', 'trending_mixed'],
      stream_types: ['video'],
      release_time: `>${expiration}`,
      fee_amount: '<=0',
    });

    const videos = (result.items || []).map(parseClaimToVideo);
    setCache(cacheKey, videos);
    return videos;
  });
}

// Get videos by claim IDs (for Discover category with pinnedClaimIds)
export async function getVideosByClaimIds(claimIds, options = {}) {
  if (!claimIds || claimIds.length === 0) return [];

  const result = await queryLBRY('claim_search', {
    claim_ids: claimIds,
    page_size: options.pageSize || claimIds.length,
    claim_type: ['stream'],
    no_totals: true,
    stream_types: ['video'],
  });

  return (result.items || []).map(parseClaimToVideo);
}

// Get explore/discover videos (trending content across all of Odysee)
// This is what the $/explore page uses
export async function getExploreVideos(options = {}) {
  // Default to last 30 days for freshness, can be overridden
  const daysOfContent = options.daysOfContent || 30;
  const expiration = Math.floor(Date.now() / 1000) - daysOfContent * 86400;

  // Order options: 'trending' (default), 'new', 'top'
  let orderBy;
  switch (options.orderBy) {
    case 'new':
      orderBy = ['release_time'];
      break;
    case 'top':
      orderBy = ['effective_amount'];
      break;
    case 'trending':
    default:
      orderBy = ['trending_group', 'trending_mixed'];
      break;
  }

  const params = {
    page_size: options.pageSize || VIDEOS_PER_PAGE,
    page: options.page || 1,
    claim_type: ['stream'],
    no_totals: true,
    not_tags: EXCLUDED_TAGS,
    order_by: orderBy,
    stream_types: ['video'],
    release_time: `>${expiration}`,
    fee_amount: '<=0',
  };

  // Optional: filter by tags/categories
  if (options.tags && options.tags.length > 0) {
    params.any_tags = options.tags;
  }

  const result = await queryLBRY('claim_search', params);
  return (result.items || []).map(parseClaimToVideo);
}

// Get videos from subscribed channels
export async function getFollowingVideos(options = {}) {
  const subscriptions = await getSubscriptions();

  if (!subscriptions || subscriptions.length === 0) {
    return [];
  }

  // Extract channel IDs from subscriptions
  const channelIds = subscriptions
    .filter(sub => sub.claim_id)
    .map(sub => sub.claim_id)
    .slice(0, 20); // Limit to 20 channels

  if (channelIds.length === 0) return [];

  const expiration = Math.floor(Date.now() / 1000) - 7776000;

  const result = await queryLBRY('claim_search', {
    channel_ids: channelIds,
    page_size: options.pageSize || VIDEOS_PER_PAGE,
    page: options.page || 1,
    claim_type: ['stream'],
    no_totals: true,
    not_tags: EXCLUDED_TAGS,
    order_by: ['release_time'],
    stream_types: ['video'],
    release_time: `>${expiration}`,
    fee_amount: '<=0',
  });

  return (result.items || []).map(parseClaimToVideo);
}

// LBRY JSON-RPC API call
export async function queryLBRY(method, params = {}) {
  const response = await fetch(LBRY_API_URL + '?m=' + method, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: getRequestId(),
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || 'LBRY API error');
  }
  return data.result;
}

// Authenticated LBRY JSON-RPC API call (requires X-Lbry-Auth-Token header)
export async function queryLBRYAuthenticated(method, params = {}) {
  if (!authToken) {
    throw new Error('Not authenticated');
  }

  const url = ODYSEE_PROXY_URL + '?m=' + method;
  console.log('queryLBRYAuthenticated:', method, 'URL:', url);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Lbry-Auth-Token': authToken,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: getRequestId(),
    }),
  });

  console.log('queryLBRYAuthenticated response status:', response.status);
  const data = await response.json();
  console.log('queryLBRYAuthenticated response data:', data);

  if (data.error) {
    throw new Error(data.error.message || 'LBRY API error');
  }
  return data.result;
}

// Get user's own channels via claim_list
export async function getUserChannels() {
  if (!authToken || !isLoggedIn()) return [];

  try {
    const result = await queryLBRYAuthenticated('claim_list', {
      claim_type: ['channel'],
      page: 1,
      page_size: 50,
      resolve: true,
    });

    if (result && result.items) {
      return result.items.map(parseClaimToChannel);
    }
  } catch (err) {
    console.error('Failed to get user channels:', err);
  }
  return [];
}

// Get user's playlists (both published and private/unpublished)
export async function getUserPlaylists(includeBuiltIn = true) {
  if (!authToken || !isLoggedIn()) return [];

  const allPlaylists = [];
  const builtInPlaylists = [];

  try {
    // 1. Fetch published playlists from claim_list
    console.log('Fetching published playlists...');
    const result = await queryLBRYAuthenticated('claim_list', {
      claim_type: ['collection'],
      page: 1,
      page_size: 50,
      resolve: true,
    });
    console.log('Published playlists result:', result);

    if (result && result.items) {
      result.items.forEach(item => {
        allPlaylists.push({
          id: item.claim_id,
          name: item.value?.title || item.name,
          description: item.value?.description || '',
          thumbnail: item.value?.thumbnail?.url,
          items: item.value?.claims || [],
          itemCount: item.value?.claims?.length || 0,
          isPublished: true,
        });
      });
    }
  } catch (err) {
    console.error('Failed to get published playlists:', err);
  }

  // Built-in collections (Watch Later, Favorites)
  // Use localStorage as primary source (same as Library view) for consistency
  if (includeBuiltIn) {
    // Watch Later - read from localStorage
    try {
      const watchLaterData = localStorage.getItem(STORAGE_KEYS.WATCH_LATER);
      const watchLaterVideos = watchLaterData ? JSON.parse(watchLaterData) : [];
      const validWatchLater = Array.isArray(watchLaterVideos) ? watchLaterVideos : [];

      builtInPlaylists.push({
        id: 'watchlater',
        name: 'Watch Later',
        description: 'Videos you want to watch later',
        thumbnail: validWatchLater.length > 0 ? validWatchLater[0].thumbnail : null,
        items: validWatchLater.map(v => v.id),
        itemCount: validWatchLater.length,
        isBuiltIn: true,
        icon: 'clock',
        _localVideos: validWatchLater,
      });
    } catch (err) {
      console.error('Failed to load Watch Later from localStorage:', err);
      builtInPlaylists.push({
        id: 'watchlater',
        name: 'Watch Later',
        description: 'Videos you want to watch later',
        thumbnail: null,
        items: [],
        itemCount: 0,
        isBuiltIn: true,
        icon: 'clock',
      });
    }

    // Favorites - read from localStorage
    try {
      const favoritesData = localStorage.getItem(STORAGE_KEYS.FAVORITES);
      const favoritesVideos = favoritesData ? JSON.parse(favoritesData) : [];
      const validFavorites = Array.isArray(favoritesVideos) ? favoritesVideos : [];

      builtInPlaylists.push({
        id: 'favorites',
        name: 'Favorites',
        description: 'Your favorite videos',
        thumbnail: validFavorites.length > 0 ? validFavorites[0].thumbnail : null,
        items: validFavorites.map(v => v.id),
        itemCount: validFavorites.length,
        isBuiltIn: true,
        icon: 'star',
        _localVideos: validFavorites,
      });
    } catch (err) {
      console.error('Failed to load Favorites from localStorage:', err);
      builtInPlaylists.push({
        id: 'favorites',
        name: 'Favorites',
        description: 'Your favorite videos',
        thumbnail: null,
        items: [],
        itemCount: 0,
        isBuiltIn: true,
        icon: 'star',
      });
    }
  }

  try {
    // 2. Fetch private/unpublished playlists from preferences
    console.log('Fetching private playlists from preferences...');
    const prefs = await getUserPreferences();

    if (prefs) {
      // Handle both formats: prefs could be { value: {...} } or directly the preferences object
      const prefsValue = prefs.value || prefs;

      // Unpublished collections (private playlists)
      const unpublished = prefsValue.unpublishedCollections;
      if (unpublished && typeof unpublished === 'object') {
        console.log('Unpublished collections:', unpublished);

        // Collect first item claim IDs for thumbnail resolution
        const playlistsToResolve = [];

        for (const [collectionId, collection] of Object.entries(unpublished)) {
          // Skip builtin collections (watchlater, favorites)
          if (collectionId === 'watchlater' || collectionId === 'favorites') continue;

          if (collection && collection.name) {
            const playlistData = {
              id: collectionId,
              name: collection.name,
              description: collection.description || '',
              thumbnail: collection.thumbnail?.url || null,
              items: collection.items || [],
              itemCount: collection.items?.length || 0,
              isPublished: false,
              updatedAt: collection.updatedAt,
            };

            // If no thumbnail but has items, mark for resolution
            if (!playlistData.thumbnail && collection.items && collection.items.length > 0) {
              const firstClaimId = extractClaimIdFromUri(collection.items[0]);
              if (firstClaimId) {
                playlistsToResolve.push({ playlist: playlistData, claimId: firstClaimId });
              }
            }

            allPlaylists.push(playlistData);
          }
        }

        // Resolve first items to get thumbnails
        if (playlistsToResolve.length > 0) {
          try {
            const claimIds = playlistsToResolve.map(p => p.claimId);
            const resolved = await resolveClaimIds(claimIds);

            // Map resolved videos back to playlists
            playlistsToResolve.forEach(({ playlist, claimId }) => {
              const video = resolved.find(v => v.id === claimId);
              if (video && video.thumbnail) {
                playlist.thumbnail = video.thumbnail;
              }
            });
          } catch (err) {
            console.error('Failed to resolve playlist thumbnails:', err);
          }
        }
      }

      // Edited collections (modified versions of collections)
      const edited = prefsValue.editedCollections;
      if (edited && typeof edited === 'object') {
        console.log('Edited collections:', edited);
        for (const [collectionId, collection] of Object.entries(edited)) {
          // Check if we already have this playlist (from published)
          const existingIndex = allPlaylists.findIndex(p => p.id === collectionId);

          if (collection && collection.name) {
            const playlistData = {
              id: collectionId,
              name: collection.name,
              description: collection.description || '',
              thumbnail: collection.thumbnail?.url || null,
              items: collection.items || [],
              itemCount: collection.items?.length || 0,
              isPublished: existingIndex >= 0 ? allPlaylists[existingIndex].isPublished : false,
              isEdited: true,
              updatedAt: collection.updatedAt,
            };

            if (existingIndex >= 0) {
              // Replace with edited version
              allPlaylists[existingIndex] = playlistData;
            } else {
              allPlaylists.push(playlistData);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to get private playlists:', err);
  }

  // Sort by updatedAt (most recent first) if available
  allPlaylists.sort((a, b) => {
    if (a.updatedAt && b.updatedAt) {
      return b.updatedAt - a.updatedAt;
    }
    return 0;
  });

  // Combine: built-in playlists first, then user playlists
  const result = [...builtInPlaylists, ...allPlaylists];
  console.log('All playlists:', result);
  return result;
}

// Fetch user preferences (for sync)
export async function getUserPreferences() {
  if (!authToken || !isLoggedIn()) return null;

  try {
    console.log('getUserPreferences: fetching...');
    const result = await queryLBRYAuthenticated('preference_get', {
      key: 'shared',
    });
    console.log('getUserPreferences result:', JSON.stringify(result, null, 2));

    if (result && result.shared) {
      return result.shared;
    }
  } catch (err) {
    console.error('Failed to get user preferences:', err);
  }
  return null;
}

// Sync cloud preferences (Watch Later, Favorites) to local storage
export async function syncCloudPreferences() {
  if (!authToken || !isLoggedIn()) return false;

  try {
    const prefs = await getUserPreferences();
    if (!prefs) return false;

    // Handle both formats: prefs could be { value: {...} } or directly the preferences object
    const prefsValue = prefs.value || prefs;
    const builtinCollections = prefsValue.builtinCollections;
    if (!builtinCollections) return false;

    // Sync Watch Later
    if (builtinCollections.watchlater && builtinCollections.watchlater.items) {
      const watchLaterIds = builtinCollections.watchlater.items;
      if (watchLaterIds.length > 0) {
        const videos = await resolveClaimIds(watchLaterIds.slice(0, 50));
        if (videos.length > 0) {
          localStorage.setItem(STORAGE_KEYS.WATCH_LATER, JSON.stringify(videos));
          console.log(`Synced ${videos.length} Watch Later videos`);
        }
      }
    }

    // Sync Favorites
    if (builtinCollections.favorites && builtinCollections.favorites.items) {
      const favoritesIds = builtinCollections.favorites.items;
      if (favoritesIds.length > 0) {
        const videos = await resolveClaimIds(favoritesIds.slice(0, 50));
        if (videos.length > 0) {
          localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(videos));
          console.log(`Synced ${videos.length} Favorites videos`);
        }
      }
    }

    return true;
  } catch (err) {
    console.error('Failed to sync cloud preferences:', err);
  }
  return false;
}

// Update a builtin collection (favorites, watchlater) in the cloud
async function updateBuiltinCollection(collectionType, claimIds) {
  if (!authToken || !isLoggedIn()) {
    console.log('updateBuiltinCollection: Not logged in');
    return { success: false, error: 'Not logged in' };
  }

  try {
    // Get current preferences first
    const prefs = await getUserPreferences();
    if (!prefs) {
      return { success: false, error: 'Failed to get preferences' };
    }

    // Handle both formats: prefs could be { value: {...} } or directly the preferences object
    const prefsValue = prefs.value || prefs;

    // Update the specific collection
    const builtinCollections = prefsValue.builtinCollections || {};
    console.log('updateBuiltinCollection: current', collectionType, 'items:', builtinCollections[collectionType]?.items);
    console.log('updateBuiltinCollection: new items:', claimIds);

    builtinCollections[collectionType] = {
      ...builtinCollections[collectionType],
      items: claimIds,
      itemCount: claimIds.length,
      updatedAt: Date.now(),
    };

    // Build the complete shared state object
    const newSharedState = {
      ...prefsValue,
      builtinCollections,
    };

    // Format the preference correctly: must be JSON stringified with type/version wrapper
    // This matches how Odysee frontend's doPreferenceSet formats the value
    const preferenceValue = JSON.stringify({
      type: 'object',
      version: '0.1',
      value: newSharedState,
    });

    console.log('updateBuiltinCollection: saving preference with value length:', preferenceValue.length);

    // Save updated preferences
    const result = await queryLBRYAuthenticated('preference_set', {
      key: 'shared',
      value: preferenceValue,
    });

    console.log('updateBuiltinCollection result:', result);
    return { success: true };
  } catch (err) {
    console.error('Failed to update builtin collection:', err);
    return { success: false, error: err.message };
  }
}

// Add video to favorites (syncs to cloud if logged in)
export async function addToFavoritesCloud(video) {
  if (!isLoggedIn()) return { success: false, error: 'Not logged in' };

  // Handle both full video object and just videoId for backwards compatibility
  const videoId = typeof video === 'string' ? video : video.id;
  const claimName = typeof video === 'object' ? (video.claimName || video._claimName) : null;

  console.log('addToFavoritesCloud called with videoId:', videoId, 'claimName:', claimName);

  try {
    const prefs = await getUserPreferences();
    const prefsValue = prefs?.value || prefs || {};
    const builtinCollections = prefsValue.builtinCollections || {};
    const currentItems = builtinCollections.favorites?.items || [];

    // Check if already in favorites
    if (currentItems.some(item => item.includes(videoId))) {
      return { success: true, alreadyExists: true };
    }

    // Construct proper LBRY URI: lbry://claim_name#claim_id
    const claimUri = claimName ? `lbry://${claimName}#${videoId}` : `lbry://${videoId}`;

    // Add to front of list
    const newItems = [claimUri, ...currentItems];
    return await updateBuiltinCollection('favorites', newItems);
  } catch (err) {
    console.error('addToFavoritesCloud error:', err);
    return { success: false, error: err.message };
  }
}

// Remove video from favorites (syncs to cloud if logged in)
export async function removeFromFavoritesCloud(videoId) {
  if (!isLoggedIn()) return { success: false, error: 'Not logged in' };

  try {
    const prefs = await getUserPreferences();
    const prefsValue = prefs?.value || prefs || {};
    const builtinCollections = prefsValue.builtinCollections || {};
    const currentItems = builtinCollections.favorites?.items || [];

    // Remove the item
    const newItems = currentItems.filter(item => !item.includes(videoId));
    return await updateBuiltinCollection('favorites', newItems);
  } catch (err) {
    console.error('removeFromFavoritesCloud error:', err);
    return { success: false, error: err.message };
  }
}

// Add video to watch later (syncs to cloud if logged in)
export async function addToWatchLaterCloud(video) {
  if (!isLoggedIn()) return { success: false, error: 'Not logged in' };

  // Handle both full video object and just videoId for backwards compatibility
  const videoId = typeof video === 'string' ? video : video.id;
  const claimName = typeof video === 'object' ? (video.claimName || video._claimName) : null;

  console.log('addToWatchLaterCloud called with videoId:', videoId, 'claimName:', claimName);

  try {
    const prefs = await getUserPreferences();
    const prefsValue = prefs?.value || prefs || {};
    const builtinCollections = prefsValue.builtinCollections || {};
    const currentItems = builtinCollections.watchlater?.items || [];

    console.log('addToWatchLaterCloud: current cloud items:', currentItems);

    // Check if already in watch later
    if (currentItems.some(item => item.includes(videoId))) {
      console.log('addToWatchLaterCloud: already exists, skipping');
      return { success: true, alreadyExists: true };
    }

    // Construct proper LBRY URI: lbry://claim_name#claim_id
    const claimUri = claimName ? `lbry://${claimName}#${videoId}` : `lbry://${videoId}`;
    console.log('addToWatchLaterCloud: constructed URI:', claimUri);

    // Add to front of list
    const newItems = [claimUri, ...currentItems];
    console.log('addToWatchLaterCloud: new items to sync:', newItems);
    return await updateBuiltinCollection('watchlater', newItems);
  } catch (err) {
    console.error('addToWatchLaterCloud error:', err);
    return { success: false, error: err.message };
  }
}

// Remove video from watch later (syncs to cloud if logged in)
export async function removeFromWatchLaterCloud(videoId) {
  if (!isLoggedIn()) return { success: false, error: 'Not logged in' };

  console.log('removeFromWatchLaterCloud called with videoId:', videoId);

  try {
    const prefs = await getUserPreferences();
    const prefsValue = prefs?.value || prefs || {};
    const builtinCollections = prefsValue.builtinCollections || {};
    const currentItems = builtinCollections.watchlater?.items || [];

    console.log('removeFromWatchLaterCloud: current cloud items:', currentItems);

    // Remove the item
    const newItems = currentItems.filter(item => !item.includes(videoId));
    console.log('removeFromWatchLaterCloud: new items after filter:', newItems);
    return await updateBuiltinCollection('watchlater', newItems);
  } catch (err) {
    console.error('removeFromWatchLaterCloud error:', err);
    return { success: false, error: err.message };
  }
}

// Auto-fetch user's profile picture from their channels
export async function fetchUserProfilePicture() {
  if (!authToken || !isLoggedIn() || !currentUser) return null;

  try {
    // First try to get the default channel from preferences
    const prefs = await getUserPreferences();
    const prefsValue = prefs?.value || prefs;
    let defaultChannelId = null;

    if (prefsValue && prefsValue.settings) {
      defaultChannelId = prefsValue.settings.active_channel_claim;
    }

    // Also sync Watch Later and Favorites while we have the preferences
    if (prefsValue) {
      if (prefsValue.builtinCollections) {
        await syncCollectionsFromPrefs(prefsValue.builtinCollections);
      }
      // Log other collections for debugging
      if (prefsValue.unpublishedCollections) {
        console.log('unpublishedCollections:', prefsValue.unpublishedCollections);
      }
      if (prefsValue.editedCollections) {
        console.log('editedCollections:', prefsValue.editedCollections);
      }
    }

    // Get user's channels
    const channels = await getUserChannels();
    if (channels.length === 0) return null;

    // Find the default channel or use the first one
    let channel = channels[0];
    if (defaultChannelId) {
      const defaultChannel = channels.find(c => c.id === defaultChannelId);
      if (defaultChannel) {
        channel = defaultChannel;
      }
    }

    // Update current user with channel info
    if (channel) {
      currentUser.channel = channel;
      currentUser.profile_image = channel.thumbnail;
      saveAuth();
      return channel;
    }
  } catch (err) {
    console.error('Failed to fetch user profile picture:', err);
  }
  return null;
}

// Sync cloud collections (Watch Later, Favorites) - call on app startup
export async function syncCloudCollections() {
  if (!authToken || !isLoggedIn()) {
    console.log('syncCloudCollections: not logged in, skipping');
    return false;
  }

  try {
    console.log('syncCloudCollections: fetching preferences...');
    const prefs = await getUserPreferences();
    const prefsValue = prefs?.value || prefs;

    if (prefsValue && prefsValue.builtinCollections) {
      await syncCollectionsFromPrefs(prefsValue.builtinCollections);
      return true;
    }
    console.log('syncCloudCollections: no builtinCollections found');
    return false;
  } catch (err) {
    console.error('syncCloudCollections error:', err);
    return false;
  }
}

// Extract claim ID from LBRY URI (format: lbry://name#claimId or lbry://@channel/name#claimId)
function extractClaimIdFromUri(uri) {
  if (!uri) return null;
  const hashIndex = uri.lastIndexOf('#');
  if (hashIndex !== -1) {
    return uri.substring(hashIndex + 1);
  }
  return null;
}

// Helper to sync collections from preferences data
async function syncCollectionsFromPrefs(builtinCollections) {
  console.log('syncCollectionsFromPrefs: builtinCollections =', JSON.stringify(builtinCollections, null, 2));
  try {
    // Sync Watch Later
    if (builtinCollections.watchlater) {
      console.log('watchlater found:', builtinCollections.watchlater);
      const cloudItems = builtinCollections.watchlater.items || [];
      if (cloudItems.length > 0) {
        // Items are LBRY URIs like "lbry://name#claimId", extract the claim IDs
        const watchLaterIds = cloudItems
          .map(extractClaimIdFromUri)
          .filter(id => id != null);
        console.log('watchlater claim IDs:', watchLaterIds);
        if (watchLaterIds.length > 0) {
          const videos = await resolveClaimIds(watchLaterIds.slice(0, 50));
          console.log('resolved watchlater videos:', videos.length);
          localStorage.setItem(STORAGE_KEYS.WATCH_LATER, JSON.stringify(videos));
          console.log(`Synced ${videos.length} Watch Later videos`);
        } else {
          // Cloud has items but couldn't extract IDs - clear local
          localStorage.setItem(STORAGE_KEYS.WATCH_LATER, JSON.stringify([]));
          console.log('Cleared Watch Later (no valid IDs)');
        }
      } else {
        // Cloud list is empty - clear local storage
        localStorage.setItem(STORAGE_KEYS.WATCH_LATER, JSON.stringify([]));
        console.log('Cleared Watch Later (cloud is empty)');
      }
    }

    // Sync Favorites
    if (builtinCollections.favorites) {
      console.log('favorites found:', builtinCollections.favorites);
      const cloudItems = builtinCollections.favorites.items || [];
      if (cloudItems.length > 0) {
        // Items are LBRY URIs, extract the claim IDs
        const favoritesIds = cloudItems
          .map(extractClaimIdFromUri)
          .filter(id => id != null);
        console.log('favorites claim IDs:', favoritesIds);
        if (favoritesIds.length > 0) {
          const videos = await resolveClaimIds(favoritesIds.slice(0, 50));
          console.log('resolved favorites videos:', videos.length);
          localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(videos));
          console.log(`Synced ${videos.length} Favorites videos`);
        } else {
          // Cloud has items but couldn't extract IDs - clear local
          localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify([]));
          console.log('Cleared Favorites (no valid IDs)');
        }
      } else {
        // Cloud list is empty - clear local storage
        localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify([]));
        console.log('Cleared Favorites (cloud is empty)');
      }
    }
  } catch (err) {
    console.error('Failed to sync collections:', err);
  }
}

// Refresh Watch Later from cloud - call when viewing the list
export async function refreshWatchLaterFromCloud() {
  if (!authToken || !isLoggedIn()) return null;

  try {
    console.log('Refreshing Watch Later from cloud...');
    const prefs = await getUserPreferences();
    if (!prefs) return null;

    const prefsValue = prefs.value || prefs;
    const builtinCollections = prefsValue.builtinCollections || {};

    if (builtinCollections.watchlater) {
      const cloudItems = builtinCollections.watchlater.items || [];
      if (cloudItems.length > 0) {
        const watchLaterIds = cloudItems
          .map(extractClaimIdFromUri)
          .filter(id => id != null);
        if (watchLaterIds.length > 0) {
          const videos = await resolveClaimIds(watchLaterIds.slice(0, 50));
          localStorage.setItem(STORAGE_KEYS.WATCH_LATER, JSON.stringify(videos));
          console.log(`Refreshed ${videos.length} Watch Later videos from cloud`);
          return videos;
        }
      }
      // Cloud is empty
      localStorage.setItem(STORAGE_KEYS.WATCH_LATER, JSON.stringify([]));
      console.log('Watch Later is empty in cloud');
      return [];
    }
    return null;
  } catch (err) {
    console.error('Failed to refresh Watch Later from cloud:', err);
    return null;
  }
}

// Refresh Favorites from cloud - call when viewing the list
export async function refreshFavoritesFromCloud() {
  if (!authToken || !isLoggedIn()) return null;

  try {
    console.log('Refreshing Favorites from cloud...');
    const prefs = await getUserPreferences();
    if (!prefs) return null;

    const prefsValue = prefs.value || prefs;
    const builtinCollections = prefsValue.builtinCollections || {};

    if (builtinCollections.favorites) {
      const cloudItems = builtinCollections.favorites.items || [];
      if (cloudItems.length > 0) {
        const favoritesIds = cloudItems
          .map(extractClaimIdFromUri)
          .filter(id => id != null);
        if (favoritesIds.length > 0) {
          const videos = await resolveClaimIds(favoritesIds.slice(0, 50));
          localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(videos));
          console.log(`Refreshed ${videos.length} Favorites from cloud`);
          return videos;
        }
      }
      // Cloud is empty
      localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify([]));
      console.log('Favorites is empty in cloud');
      return [];
    }
    return null;
  } catch (err) {
    console.error('Failed to refresh Favorites from cloud:', err);
    return null;
  }
}

// Lighthouse search API (max size is 50) - cached
export async function searchLighthouse(query, options = {}) {
  // Lighthouse API has a max size of 50
  const size = Math.min(options.size || VIDEOS_PER_PAGE, 50);
  const nsfw = options.nsfw ? 'true' : 'false';
  const claimType = options.claimType || '';
  const mediaType = options.mediaType || '';

  // Create cache key from search params
  const cacheKey = `search_${query}_${size}_${nsfw}_${claimType}_${mediaType}`;
  const cached = getCached(cacheKey, 'search');
  if (cached) {
    console.log('Search cache hit for:', query);
    return cached;
  }

  return dedupeRequest(cacheKey, async () => {
    const params = new URLSearchParams();
    params.set('s', query);
    params.set('size', String(size));
    if (options.from) {
      params.set('from', String(options.from));
    }
    // nsfw=false filters out mature content, nsfw=true includes it
    params.set('nsfw', nsfw);
    if (options.claimType) {
      params.set('claimType', options.claimType);
    }
    if (options.mediaType) {
      params.set('mediaType', options.mediaType);
    }

    const url = `${LIGHTHOUSE_URL}?${params}`;
    console.log('Search URL:', url);

    const response = await fetch(url);

    if (!response.ok) {
      console.error('Lighthouse search failed with status:', response.status);
      return [];
    }

    const results = await response.json();
    console.log('Search results:', results);

    if (!Array.isArray(results) || results.length === 0) {
      return [];
    }

    // Get claim IDs from search results
    const claimIds = results.map(r => r.claimId);

    // Resolve full claim data
    const videos = await resolveClaimIds(claimIds);
    setCache(cacheKey, videos);
    return videos;
  });
}

// Search videos
export async function searchVideos(query, options = {}) {
  return searchLighthouse(query, {
    ...options,
    claimType: 'file',
    mediaType: 'video',
  });
}

// Search channels - cached
export async function searchChannels(query, options = {}) {
  const size = Math.min(options.size || 20, 50);
  const nsfw = options.nsfw ? 'true' : 'false';

  // Create cache key
  const cacheKey = `channelSearch_${query}_${size}_${nsfw}`;
  const cached = getCached(cacheKey, 'search');
  if (cached) {
    console.log('Channel search cache hit for:', query);
    return cached;
  }

  return dedupeRequest(cacheKey, async () => {
    const params = new URLSearchParams();
    params.set('s', query);
    params.set('size', String(size));
    if (options.from) {
      params.set('from', String(options.from));
    }
    params.set('claimType', 'channel');
    params.set('nsfw', nsfw);

    const url = `${LIGHTHOUSE_URL}?${params}`;
    console.log('Channel search URL:', url);

    const response = await fetch(url);

    if (!response.ok) {
      console.error('Lighthouse channel search failed with status:', response.status);
      return [];
    }

    const results = await response.json();
    console.log('Channel search results:', results);

    if (!Array.isArray(results) || results.length === 0) {
      return [];
    }

    const claimIds = results.map(r => r.claimId);
    const channels = await resolveChannelIds(claimIds);
    setCache(cacheKey, channels);
    return channels;
  });
}

// Resolve claim IDs to full claim data
export async function resolveClaimIds(claimIds) {
  if (!claimIds || claimIds.length === 0) return [];

  console.log('Resolving claim IDs:', claimIds.length);

  const result = await queryLBRY('claim_search', {
    claim_ids: claimIds,
    page_size: claimIds.length,
    no_totals: true,
    not_tags: EXCLUDED_TAGS,
    stream_types: ['video'],
  });

  console.log('Resolved items:', result.items?.length || 0);
  return (result.items || []).map(parseClaimToVideo);
}

// Resolve channel IDs - cached
export async function resolveChannelIds(claimIds) {
  if (!claimIds || claimIds.length === 0) return [];

  // Create cache key from sorted claim IDs
  const cacheKey = `channels_${claimIds.slice().sort().join('_')}`;
  const cached = getCached(cacheKey, 'channels');
  if (cached) {
    console.log('Channel cache hit for:', claimIds.length, 'channels');
    return cached;
  }

  return dedupeRequest(cacheKey, async () => {
    const result = await queryLBRY('claim_search', {
      claim_ids: claimIds,
      claim_type: ['channel'],
      page_size: claimIds.length,
      no_totals: true,
    });

    const channels = (result.items || []).map(parseClaimToChannel);
    setCache(cacheKey, channels);
    return channels;
  });
}

// Get trending/home content
export async function getTrendingVideos(options = {}) {
  const expiration = Math.floor(Date.now() / 1000) - 7776000; // 90 days ago

  const result = await queryLBRY('claim_search', {
    page_size: options.pageSize || VIDEOS_PER_PAGE,
    page: options.page || 1,
    claim_type: ['stream'],
    no_totals: true,
    not_tags: EXCLUDED_TAGS,
    order_by: ['trending_group', 'trending_mixed'],
    stream_types: ['video'],
    release_time: `>${expiration}`,
    fee_amount: '<=0',
    ...(options.channelIds && { channel_ids: options.channelIds }),
    ...(options.tags && { any_tags: options.tags }),
  });

  return (result.items || []).map(parseClaimToVideo);
}

// Get videos by tags (for categories)
export async function getVideosByTags(tags, options = {}) {
  const expiration = Math.floor(Date.now() / 1000) - 7776000;

  const result = await queryLBRY('claim_search', {
    page_size: options.pageSize || VIDEOS_PER_PAGE,
    page: options.page || 1,
    claim_type: ['stream'],
    no_totals: true,
    any_tags: tags,
    not_tags: EXCLUDED_TAGS,
    order_by: ['trending_group', 'trending_mixed'],
    stream_types: ['video'],
    release_time: `>${expiration}`,
    fee_amount: '<=0',
  });

  return (result.items || []).map(parseClaimToVideo);
}

// Get channel videos
export async function getChannelVideos(channelId, options = {}) {
  const params = {
    channel_ids: [channelId],
    page_size: options.pageSize || VIDEOS_PER_PAGE,
    page: options.page || 1,
    claim_type: ['stream'],
    no_totals: true,
    not_tags: EXCLUDED_TAGS,
    order_by: ['release_time'],
    stream_types: ['video'],
    fee_amount: '<=0',
  };

  // Only apply time filter if not requesting all videos
  if (!options.includeOlder) {
    const expiration = Math.floor(Date.now() / 1000) - 7776000; // 90 days
    params.release_time = `>${expiration}`;
  }

  const result = await queryLBRY('claim_search', params);

  return (result.items || []).map(parseClaimToVideo);
}

// Resolve a single video by claim ID
export async function resolveVideo(claimId) {
  const result = await queryLBRY('claim_search', {
    claim_ids: [claimId],
    page_size: 1,
    no_totals: true,
    stream_types: ['video'],
  });

  if (!result.items || result.items.length === 0) {
    throw new Error('Video not found');
  }

  return parseClaimToVideo(result.items[0]);
}

// Parse LBRY claim to video object
function parseClaimToVideo(claim) {
  const value = claim.value || {};
  const source = value.source || {};
  const thumbnail = value.thumbnail?.url;
  const signingChannel = claim.signing_channel || {};
  const videoInfo = value.video || {};

  return {
    id: claim.claim_id,
    title: value.title || claim.name || 'Untitled',
    description: value.description || '',
    thumbnail: thumbnail ? getThumbnailUrl(thumbnail) : null,
    duration: videoInfo.duration || 0,
    width: videoInfo.width || 0,
    height: videoInfo.height || 0,
    releaseTime: claim.timestamp,
    channelId: signingChannel.claim_id,
    channelName: signingChannel.name?.replace('@', '') || 'Anonymous',
    channelTitle: signingChannel.value?.title || signingChannel.name?.replace('@', '') || 'Anonymous',
    channelThumbnail: signingChannel.value?.thumbnail?.url,
    views: Math.floor(parseFloat(claim.meta?.effective_amount || 0)),
    streamUrl: getStreamUrl(claim.name, claim.claim_id, source.hash),
    claimName: claim.name || claim.normalized_name,
    // Store metadata for quality selection
    _claimName: claim.name,
    _claimId: claim.claim_id,
    _sourceHash: source.hash,
  };
}

// Parse LBRY claim to channel object
function parseClaimToChannel(claim) {
  const value = claim.value || {};

  // Try multiple sources for channel thumbnail
  let thumbnail = value.thumbnail?.url ? getThumbnailUrl(value.thumbnail.url) : null;

  // Fallback: try CDN URL based on claim_id (works for some channels)
  if (!thumbnail && claim.claim_id) {
    thumbnail = `https://thumbnails.lbry.com/${claim.claim_id}`;
  }

  return {
    id: claim.claim_id,
    name: claim.name?.replace('@', '') || 'Unknown',
    title: value.title || claim.name?.replace('@', '') || 'Unknown',
    description: value.description || '',
    thumbnail,
    subscriberCount: 0, // Would need separate API call
  };
}

// Get optimized thumbnail URL
function getThumbnailUrl(url) {
  if (!url) return null;

  // Return the URL as-is - most LBRY thumbnails are already proper URLs
  // that work directly (spee.ch, thumbnails.lbry.com, etc.)
  return url;
}

// Get stream URL for video playback
function getStreamUrl(name, claimId, hash) {
  if (!name || !claimId) return null;

  const hashPrefix = hash ? hash.substring(0, 6) : '';
  // Use v3 API which redirects to actual video file
  // Note: name should not be encoded as it may break the URL
  return `${LBRY_CDN_URL}/api/v3/streams/free/${name}/${claimId}/${hashPrefix}`;
}

// Available quality levels (height in pixels)
export const VIDEO_QUALITIES = [
  { value: 'auto', label: 'Auto', height: null },
  { value: '2160', label: '4K (2160p)', height: 2160 },
  { value: '1440', label: '1440p', height: 1440 },
  { value: '1080', label: '1080p', height: 1080 },
  { value: '720', label: '720p', height: 720 },
  { value: '480', label: '480p', height: 480 },
  { value: '360', label: '360p', height: 360 },
];

// Get available qualities for a video based on its original resolution
export function getAvailableQualities(videoHeight) {
  if (!videoHeight || videoHeight <= 0) {
    // If no height info, return all options - the CDN will handle it
    return VIDEO_QUALITIES;
  }

  // Filter to qualities at or below the video's resolution, plus auto
  return VIDEO_QUALITIES.filter(q =>
    q.value === 'auto' || (q.height && q.height <= videoHeight)
  );
}

// Get stream URL with specific quality
export function getStreamUrlWithQuality(video, quality) {
  if (!video) return null;

  const name = video._claimName || video.claimName;
  const claimId = video._claimId || video.id;
  const hash = video._sourceHash;

  if (!name || !claimId) return null;

  const hashPrefix = hash ? hash.substring(0, 6) : '';

  // If auto or no quality specified, use standard v3 endpoint
  if (!quality || quality === 'auto') {
    return `${LBRY_CDN_URL}/api/v3/streams/free/${name}/${claimId}/${hashPrefix}`;
  }

  // For specific quality, use v4 transcoding API
  // The v4 endpoint provides transcoded streams at specific resolutions
  const qualityHeight = parseInt(quality, 10);
  if (isNaN(qualityHeight)) {
    return `${LBRY_CDN_URL}/api/v3/streams/free/${name}/${claimId}/${hashPrefix}`;
  }

  // Use v4 transcoded stream endpoint with quality parameter
  return `${LBRY_CDN_URL}/api/v4/streams/tc/${name}/${claimId}/${hashPrefix}?quality=${qualityHeight}p`;
}

// Format view count
export function formatViews(views) {
  if (views >= 1000000) {
    return (views / 1000000).toFixed(1) + 'M';
  }
  if (views >= 1000) {
    return (views / 1000).toFixed(1) + 'K';
  }
  return views.toString();
}

// Format duration
export function formatDuration(seconds) {
  if (!seconds) return '';

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Format relative time
export function formatRelativeTime(timestamp) {
  if (!timestamp) return '';

  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)} weeks ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)} months ago`;
  return `${Math.floor(diff / 31536000)} years ago`;
}

// Resolve a channel by name and get its details (including thumbnail)
export async function resolveChannelByName(channelName) {
  // Ensure channel name starts with @
  const normalizedName = channelName.startsWith('@') ? channelName : `@${channelName}`;

  try {
    const result = await queryLBRY('resolve', {
      urls: [normalizedName],
    });

    if (result && result[normalizedName] && !result[normalizedName].error) {
      const claim = result[normalizedName];
      return parseClaimToChannel(claim);
    }
  } catch (err) {
    console.error('Failed to resolve channel:', err);
  }
  return null;
}

// Set user's channel (for profile picture)
export async function setUserChannel(channelName) {
  const channel = await resolveChannelByName(channelName);
  if (channel && currentUser) {
    currentUser.channel = channel;
    currentUser.profile_image = channel.thumbnail;
    saveAuth();
    return { success: true, channel };
  }
  return { success: false, error: 'Channel not found' };
}


// Follow a channel (subscribe) - uses subscription API and updates preferences
export async function followChannel(channelClaimId, channelName) {
  if (!authToken || !isLoggedIn()) {
    console.log('followChannel: Not logged in, authToken:', !!authToken);
    return { success: false, error: 'Not logged in' };
  }

  try {
    console.log('followChannel: Following', channelName, 'claim_id:', channelClaimId);

    // Use proxy in dev, direct URL on TV
    const subscriptionApiUrl = IS_DEV
      ? '/lbry-api-com/subscription/new'
      : 'https://api.lbry.com/subscription/new';

    // Call subscription API
    console.log('followChannel: Calling subscription API:', subscriptionApiUrl);
    const subResponse = await fetch(subscriptionApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        auth_token: authToken,
        claim_id: channelClaimId,
        channel_name: channelName,
      }),
    });
    const subData = await subResponse.json();
    console.log('followChannel: subscription API response:', subData);

    // Also update preferences for Odysee sync
    const prefs = await getUserPreferences();
    const prefsValue = prefs?.value || prefs || {};
    const following = prefsValue.following || [];

    // Construct LBRY URI: lbry://@channelName#claimId
    const channelUri = `lbry://${channelName}#${channelClaimId}`;

    // Check if already in preferences
    if (!following.some(f => f.uri && f.uri.includes(channelClaimId))) {
      const newFollowing = [
        ...following,
        { notificationsDisabled: true, uri: channelUri }
      ];

      const newSharedState = {
        ...prefsValue,
        following: newFollowing,
      };

      const preferenceValue = JSON.stringify({
        type: 'object',
        version: '0.1',
        value: newSharedState,
      });

      console.log('followChannel: Updating preferences...');
      const prefResult = await queryLBRYAuthenticated('preference_set', {
        key: 'shared',
        value: preferenceValue,
      });
      console.log('followChannel: preference_set result:', prefResult);
    }

    return { success: subData.success !== false };
  } catch (err) {
    console.error('followChannel ERROR:', err);
    return { success: false, error: err.message };
  }
}

// Unfollow a channel (unsubscribe) - uses subscription API and updates preferences
export async function unfollowChannel(channelClaimId) {
  if (!authToken || !isLoggedIn()) {
    console.log('unfollowChannel: Not logged in');
    return { success: false, error: 'Not logged in' };
  }

  try {
    console.log('unfollowChannel: Unfollowing claim_id:', channelClaimId);

    // Use proxy in dev, direct URL on TV
    const subscriptionApiUrl = IS_DEV
      ? '/lbry-api-com/subscription/delete'
      : 'https://api.lbry.com/subscription/delete';

    // Call subscription API
    console.log('unfollowChannel: Calling subscription API:', subscriptionApiUrl);
    const subResponse = await fetch(subscriptionApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        auth_token: authToken,
        claim_id: channelClaimId,
      }),
    });
    const subData = await subResponse.json();
    console.log('unfollowChannel: subscription API response:', subData);

    // Also update preferences for Odysee sync
    const prefs = await getUserPreferences();
    const prefsValue = prefs?.value || prefs || {};
    const following = prefsValue.following || [];

    // Remove the channel from following
    const newFollowing = following.filter(f => !f.uri || !f.uri.includes(channelClaimId));

    if (newFollowing.length !== following.length) {
      console.log('unfollowChannel: Removing from preferences...');

      const newSharedState = {
        ...prefsValue,
        following: newFollowing,
      };

      const preferenceValue = JSON.stringify({
        type: 'object',
        version: '0.1',
        value: newSharedState,
      });

      const prefResult = await queryLBRYAuthenticated('preference_set', {
        key: 'shared',
        value: preferenceValue,
      });
      console.log('unfollowChannel: preference_set result:', prefResult);
    }

    return { success: subData.success !== false };
  } catch (err) {
    console.error('unfollowChannel ERROR:', err);
    return { success: false, error: err.message };
  }
}

// Check if following a channel
export async function isFollowingChannel(channelId) {
  if (!authToken || !isLoggedIn()) return false;

  try {
    const prefs = await getUserPreferences();
    const prefsValue = prefs?.value || prefs || {};
    const following = prefsValue.following || [];

    return following.some(f => f.uri && f.uri.includes(channelId));
  } catch (err) {
    console.error('Check following error:', err);
    return false;
  }
}

// React to a claim (like/dislike)
export async function reactToClaim(claimId, type) {
  if (!authToken || !isLoggedIn()) {
    return { success: false, error: 'Not logged in' };
  }

  try {
    const response = await fetch('https://api.odysee.com/reaction/react', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        auth_token: authToken,
        claim_ids: claimId,
        type: type, // 'like' or 'dislike'
        clear_types: type === 'like' ? 'dislike' : 'like',
      }),
    });
    const data = await response.json();
    return { success: data.success };
  } catch (err) {
    console.error('React error:', err);
    return { success: false, error: err.message };
  }
}

// Remove reaction from a claim
export async function removeReaction(claimId, type) {
  if (!authToken || !isLoggedIn()) {
    return { success: false, error: 'Not logged in' };
  }

  try {
    const response = await fetch('https://api.odysee.com/reaction/react', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        auth_token: authToken,
        claim_ids: claimId,
        type: type,
        remove: 'true',
      }),
    });
    const data = await response.json();
    return { success: data.success };
  } catch (err) {
    console.error('Remove reaction error:', err);
    return { success: false, error: err.message };
  }
}

// Get reactions for a claim - cached
export async function getReactions(claimId) {
  // Cache key includes auth status since my_reactions differs
  const cacheKey = `reactions_${claimId}_${authToken ? 'auth' : 'anon'}`;
  const cached = getCached(cacheKey, 'reactions');
  if (cached) {
    return cached;
  }

  return dedupeRequest(cacheKey, async () => {
    try {
      const params = new URLSearchParams({
        claim_ids: claimId,
      });
      if (authToken) {
        params.append('auth_token', authToken);
      }

      const response = await fetch('https://api.odysee.com/reaction/list?' + params);
      const data = await response.json();

      if (data.success && data.data?.reactions) {
        const reactions = data.data.reactions[claimId] || {};
        const result = {
          likes: reactions.like || 0,
          dislikes: reactions.dislike || 0,
          myReaction: data.data.my_reactions?.[claimId] || null,
        };
        setCache(cacheKey, result);
        return result;
      }
      return { likes: 0, dislikes: 0, myReaction: null };
    } catch (err) {
      console.error('Get reactions error:', err);
      return { likes: 0, dislikes: 0, myReaction: null };
    }
  });
}

// Invalidate reaction cache when user reacts (so UI stays in sync)
export function invalidateReactionCache(claimId) {
  const authKey = `reactions_${claimId}_auth`;
  const anonKey = `reactions_${claimId}_anon`;
  cache.data.delete(authKey);
  cache.data.delete(anonKey);
}

// Get related/recommended videos based on current video's channel - cached
export async function getRelatedVideos(video, options = {}) {
  if (!video || !video.channelId) return [];

  const cacheKey = `related_${video.channelId}_${video.id}`;
  const cached = getCached(cacheKey, 'videos');
  if (cached) {
    return cached;
  }

  return dedupeRequest(cacheKey, async () => {
    const expiration = Math.floor(Date.now() / 1000) - (options.daysOfContent || 90) * 86400;

    const result = await queryLBRY('claim_search', {
      channel_ids: [video.channelId],
      page_size: options.pageSize || 10,
      page: 1,
      claim_type: ['stream'],
      no_totals: true,
      not_tags: EXCLUDED_TAGS,
      order_by: ['release_time'],
      stream_types: ['video'],
      release_time: `>${expiration}`,
      fee_amount: '<=0',
    });

    // Filter out the current video and map to video objects
    const videos = (result.items || [])
      .filter(item => item.claim_id !== video.id)
      .map(parseClaimToVideo);

    setCache(cacheKey, videos);
    return videos;
  });
}

// Preload video stream URL (for faster playback start)
export function preloadVideo(video) {
  if (!video || !video.streamUrl) return;

  // Create a prefetch link for the video stream
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = video.streamUrl;
  link.as = 'video';

  // Check if we already have this prefetch
  const existing = document.querySelector(`link[href="${video.streamUrl}"]`);
  if (!existing) {
    document.head.appendChild(link);
    console.log('Preloading next video:', video.title);
  }
}
