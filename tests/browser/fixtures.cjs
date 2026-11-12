const fs = require('node:fs');
const path = require('node:path');

const THUMB = 'https://thumbs.odycdn.com/fixture.webp';
const CHANNEL = { claim_id: 'channel-1', name: '@fixture', value: { title: 'Fixture channel', thumbnail: { url: THUMB } } };

const claim = (id, title, extra = {}) => ({
  claim_id: id,
  name: `video-${id}`,
  timestamp: 1760000000,
  value: { title, release_time: '1760000000', thumbnail: { url: THUMB }, video: { duration: 600, height: 720 }, source: { sd_hash: 'f'.repeat(96) } },
  signing_channel: CHANNEL,
  ...extra,
});

const category = (label, icon, order) => ({ label, icon, channelIds: ['channel-1'], sortOrder: order, pageSize: 6, daysOfContent: 90 });
const content = {
  status: 'success',
  data: { en: { categories: {
    PRIMARY_CONTENT: category('Featured', 'Featured', 2),
    GAMING: category('Gaming', 'Gaming', 60),
    TECHNOLOGY: category('Tech', 'Speaker', 80),
    WILD_WEST: { label: 'Wild West', icon: 'WildWest', excludedChannelIds: ['channel-2'], sortOrder: 999, pageSize: 6, daysOfContent: 90 },
  } } },
};

const USER = { primary_email: 'fixture@example.com', has_verified_email: true, auth_token: 'token-2' };

function claimSearch(params) {
  if (params.claim_type && params.claim_type[0] === 'channel') return { items: [CHANNEL] };
  if (params.claim_ids) return { items: params.claim_ids.map((id) => claim(id, `Resolved ${id}`)) };
  const page = params.page || 1;
  const size = params.page_size || 20;
  const label = params.order_by && params.order_by[0] === 'release_time' ? 'New' : 'Trending';
  return { items: Array.from({ length: size }, (_, index) => claim(`${label.toLowerCase()}-${page}-${index}`, `${label} video ${page}-${index}`)) };
}

function fixture(url, postData = '', method = 'GET') {
  const parsed = new URL(url);
  const json = (body) => ({ contentType: 'application/json', body: JSON.stringify(body) });
  if (method === 'OPTIONS') return { status: 204, contentType: 'text/plain', body: '' };
  const stream = () => ({ contentType: 'video/webm', body: fs.readFileSync(path.join(__dirname, 'fixture.webm')) });
  if (parsed.hostname === 'odysee.com' && parsed.pathname.startsWith('/$/download/')) return stream();
  if (parsed.hostname === 'player.odycdn.com' && parsed.pathname.endsWith('/master.m3u8')) return { contentType: 'application/x-mpegurl', body: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000,RESOLUTION=1280x720\nv0.m3u8\n' };
  if (parsed.hostname === 'player.odycdn.com' && parsed.pathname.endsWith('/v0.m3u8')) return { contentType: 'application/x-mpegurl', body: '#EXTM3U\n' };
  if (parsed.hostname === 'thumbs.odycdn.com' || parsed.hostname === 'thumbnails.odycdn.com' || parsed.hostname === 'thumbnails.lbry.com') {
    return { contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="blue"/></svg>' };
  }
  if (parsed.hostname === 'odysee.com' && parsed.pathname.endsWith('/content/v2/get')) return json(content);
  if (parsed.hostname === 'api.lbry.tv') {
    const { method: rpc, params } = JSON.parse(postData);
    if (rpc === 'claim_search') return json({ jsonrpc: '2.0', result: claimSearch(params), id: 1 });
    return null;
  }
  if (parsed.hostname === 'api.na-backend.odysee.com') {
    const { method: rpc } = JSON.parse(postData);
    if (rpc === 'preference_get') return json({ result: { shared: { value: { builtinCollections: { watchlater: { items: [] }, favorites: { items: [] } }, following: [] } } } });
    if (rpc === 'claim_list') return json({ result: { items: [CHANNEL] } });
    return json({ result: {} });
  }
  if (parsed.hostname === 'api.lbry.com') {
    if (parsed.pathname === '/user/new') return json({ success: true, data: { auth_token: 'token-1' } });
    if (parsed.pathname === '/user/signin' || parsed.pathname === '/user/me') return json({ success: true, data: USER });
    if (parsed.pathname === '/subscription/list') return json({ success: true, data: [{ claim_id: 'channel-1', channel_name: '@fixture' }] });
    return json({ success: true, data: {} });
  }
  if (parsed.hostname === 'api.odysee.com') return json({ success: true, data: { reactions: { }, my_reactions: {} } });
  if (parsed.hostname === 'lighthouse.lbry.com') return json([{ claimId: 'found-1' }, { claimId: 'found-2' }]);
  return null;
}

module.exports = { fixture, USER };
