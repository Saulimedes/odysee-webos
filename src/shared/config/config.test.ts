import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); });

describe('settings', () => {
  it('returns defaults and persists changes', async () => {
    const { getSetting, setSetting, subscribeSettings } = await import('./settings');
    expect(getSetting('accentColor')).toBe('#DE0050');
    const listener = vi.fn();
    const off = subscribeSettings(listener);
    setSetting('themeMode', 'dark');
    expect(listener).toHaveBeenCalledWith('themeMode');
    expect(JSON.parse(localStorage.getItem('themeMode') as string)).toBe('dark');
    off();
  });

  it('ignores stored values of the wrong type', async () => {
    localStorage.setItem('textScale', '"big"');
    localStorage.setItem('autoplay', 'garbage');
    const { getSetting } = await import('./settings');
    expect(getSetting('textScale')).toBe(1);
    expect(getSetting('autoplay')).toBe(true);
  });

  it.each(['odysee', 'pulse'])('ignores a stored loading animation that is not offered any more, like %s', async (stored) => {
    localStorage.setItem('loaderStyle', JSON.stringify(stored));
    const { getSetting, setSetting } = await import('./settings');
    expect(getSetting('loaderStyle')).toBe('ring');
    setSetting('loaderStyle', 'ripple');
    expect(getSetting('loaderStyle')).toBe('ripple');
    vi.resetModules();
    const again = await import('./settings');
    expect(again.getSetting('loaderStyle')).toBe('ripple');
  });

  it('migrates the old settings blob', async () => {
    localStorage.setItem('odysee-settings', JSON.stringify({ autoplay: false, aspectRatio: 'zoom', nsfw: true }));
    const { getSetting } = await import('./settings');
    expect(getSetting('autoplay')).toBe(false);
    expect(getSetting('aspectRatio')).toBe('zoom');
    expect(getSetting('nsfw')).toBe(true);
  });

  it('survives a broken legacy blob and a failing storage', async () => {
    localStorage.setItem('odysee-settings', '{');
    const { getSetting, setSetting } = await import('./settings');
    expect(getSetting('aspectRatio')).toBe('auto');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setSetting('aspectRatio', 'zoom');
    expect(getSetting('aspectRatio')).toBe('zoom');
  });

  it('starts with the ring as loading animation, normal speed and an automatic aspect ratio', async () => {
    const { getSetting } = await import('./settings');
    expect(getSetting('loaderStyle')).toBe('ring');
    expect(getSetting('aspectRatio')).toBe('auto');
    expect(getSetting('playbackSpeed')).toBe(1);
    expect(getSetting('iconVariant')).toBe('outlined');
    expect(getSetting('iconScale')).toBe(1);
  });

  it('survives unreadable storage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    const { getSetting } = await import('./settings');
    expect(getSetting('resume')).toBe(true);
  });
});

describe('appearance', () => {
  it('computes palettes for every theme', async () => {
    const { computeAppearance } = await import('./appearance');
    for (const themeMode of ['black', 'dark', 'light', 'tinted', 'ambient', 'lighttinted', 'unknown']) {
      const { attrs, vars } = computeAppearance({ themeMode, accentColor: '#FF9800', uiFont: 'default', cornerStyle: 'classic', textScale: 1, tileScale: 1 });
      expect(attrs['data-theme']).toBe(themeMode);
      expect(vars['--bg']).toMatch(/^#[0-9a-f]{6}$/);
      expect(vars['--accent']).toBe('#ff9800');
    }
  });

  it('picks readable accent contrast and handles invalid or grey colors', async () => {
    const { computeAppearance } = await import('./appearance');
    const base = { themeMode: 'tinted', uiFont: 'default', cornerStyle: 'round', textScale: 1.2, tileScale: 0.9 };
    expect(computeAppearance({ ...base, accentColor: '#FFFFFF' }).vars['--accent-contrast']).toBe('#000000');
    expect(computeAppearance({ ...base, accentColor: '#000000' }).vars['--accent-contrast']).toBe('#ffffff');
    expect(computeAppearance({ ...base, accentColor: '#FFFFFF' }).vars['--accent-contrast-rgb']).toBe('0, 0, 0');
    expect(computeAppearance({ ...base, accentColor: '#000000' }).vars['--accent-contrast-rgb']).toBe('255, 255, 255');
    expect(computeAppearance({ ...base, accentColor: 'nonsense' }).vars['--accent']).toBe('#de0050');
    expect(computeAppearance({ ...base, accentColor: '#808080' }).vars['--bg']).toBe('#1a1a1a');
    expect(computeAppearance({ ...base, themeMode: 'light', accentColor: '#FFEB3B' }).vars['--accent-text']).toMatch(/^#/);
  });

  it('exposes the text color and the contrast for the start screen, which is always the wheel', async () => {
    const { computeAppearance } = await import('./appearance');
    const base = { accentColor: '#DE0050', uiFont: 'default', cornerStyle: 'classic', textScale: 1, tileScale: 1 };
    const dark = computeAppearance({ ...base, themeMode: 'black' });
    expect(dark.attrs).toEqual({ 'data-theme': 'black', 'data-icons': 'outlined', 'data-corners': 'classic', 'data-contrast': 'light' });
    expect(computeAppearance({ ...base, themeMode: 'black', accentColor: '#FFEB3B' }).attrs['data-contrast']).toBe('dark');
    expect(dark.vars['--text-rgb']).toBe('255, 255, 255');
    expect(dark.vars['--bg-rgb']).toBe('0, 0, 0');
    expect(computeAppearance({ ...base, themeMode: 'light' }).vars['--text-rgb']).toBe('26, 27, 30');
  });

  it('gives Black, Dark and Light their own surfaces and keeps Odysee Pink as the default accent', async () => {
    const { paletteFor } = await import('./appearance');
    const { ACCENT_COLORS, THEME_MODES, SETTING_DEFAULTS } = await import('./constants');
    expect(THEME_MODES.slice(0, 3).map((mode) => mode.code)).toEqual(['black', 'dark', 'light']);
    expect(new Set(['black', 'dark', 'light'].map((mode) => paletteFor(mode, '#DE0050').bg)).size).toBe(3);
    expect(paletteFor('light', '#DE0050').text).not.toBe(paletteFor('dark', '#DE0050').text);
    expect(SETTING_DEFAULTS.accentColor).toBe('#DE0050');
    expect(ACCENT_COLORS[0]).toEqual({ code: '#DE0050', name: 'Odysee Pink' });
    expect(ACCENT_COLORS.length).toBeGreaterThan(10);
  });

  it('keeps Ambient Glow neutral and nearly black with see-through surfaces, so the accent only shows in the glows', async () => {
    const { paletteFor, computeAppearance } = await import('./appearance');
    const pink = paletteFor('ambient', '#DE0050');
    const blue = paletteFor('ambient', '#2196F3');
    expect(pink).toEqual(blue);
    expect(pink.bg).toBe('#0b0b0d');
    [pink.surface, pink.surfaceAlt, pink.surfaceHover, pink.border, pink.muted, pink.dim].forEach((color) => expect(color).toMatch(/^rgba\(255, 255, 255, 0\.\d+\)$/));
    const base = { themeMode: 'ambient', accentColor: '#DE0050', uiFont: 'default', cornerStyle: 'classic', textScale: 1, tileScale: 1 };
    const { vars } = computeAppearance(base);
    expect(vars['--bg']).toBe('#0b0b0d');
    expect(vars['--bg-rgb']).toBe('11, 11, 13');
    expect(vars['--surface']).toBe(pink.surface);
    expect(vars['--panel']).toBe('#18181b');
    expect(vars['--panel-alt']).toBe('#101012');
  });

  it('gives every other theme panels that are the same as its surfaces', async () => {
    const { computeAppearance } = await import('./appearance');
    for (const themeMode of ['black', 'dark', 'light', 'tinted', 'lighttinted']) {
      const { vars } = computeAppearance({ themeMode, accentColor: '#DE0050', uiFont: 'default', cornerStyle: 'classic', textScale: 1, tileScale: 1 });
      expect(vars['--panel']).toBe(vars['--surface']);
      expect(vars['--panel-alt']).toBe(vars['--surface-alt']);
    }
  });

  it('applies fonts and corners', async () => {
    const { computeAppearance } = await import('./appearance');
    const { vars } = computeAppearance({ themeMode: 'black', accentColor: '#DE0050', uiFont: 'inter', cornerStyle: 'square', textScale: 1.3, tileScale: 1.1 });
    expect(vars['--ui-font']).toContain("'Inter'");
    expect(vars['--radius-md']).toBe('0px');
    expect(vars['--text-scale']).toBe('1.3');
    expect(computeAppearance({ themeMode: 'black', accentColor: '#DE0050', uiFont: 'nope', cornerStyle: 'nope', textScale: 1, tileScale: 1 }).vars['--radius-md']).toBe('8px');
  });

  it('names the corner style on the document so that the profile picture can follow it', async () => {
    const { computeAppearance } = await import('./appearance');
    const base = { themeMode: 'black', accentColor: '#DE0050', uiFont: 'default', textScale: 1, tileScale: 1 };
    ['square', 'classic', 'round'].forEach((cornerStyle) => expect(computeAppearance({ ...base, cornerStyle }).attrs['data-corners']).toBe(cornerStyle));
    expect(computeAppearance({ ...base, cornerStyle: 'nope' }).attrs['data-corners']).toBe('classic');
  });

  it('writes variables to the document, caches them and reacts to changes', async () => {
    const { initAppearance } = await import('./appearance');
    const { setSetting } = await import('./settings');
    const stop = initAppearance();
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#de0050');
    setSetting('accentColor', '#00C853');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#00c853');
    expect(JSON.parse(localStorage.getItem('appearance_boot') as string).vars['--accent']).toBe('#00c853');
    setSetting('autoplay', false);
    stop();
  });

  it('passes the Menu Icon Style on to the page, so category icons can follow it', async () => {
    const { computeAppearance, initAppearance } = await import('./appearance');
    const { setSetting } = await import('./settings');
    const base = { themeMode: 'black', accentColor: '#DE0050', uiFont: 'default', cornerStyle: 'classic', textScale: 1, tileScale: 1 };
    expect(computeAppearance(base).attrs['data-icons']).toBe('outlined');
    ['outlined', 'filled', 'dynamic'].forEach((iconVariant) => expect(computeAppearance({ ...base, iconVariant }).attrs['data-icons']).toBe(iconVariant));
    const stop = initAppearance();
    setSetting('iconVariant', 'filled');
    expect(document.documentElement.getAttribute('data-icons')).toBe('filled');
    expect(JSON.parse(localStorage.getItem('appearance_boot') as string).attrs['data-icons']).toBe('filled');
    setSetting('iconVariant', 'dynamic');
    expect(document.documentElement.getAttribute('data-icons')).toBe('dynamic');
    stop();
  });

  it('survives a failing storage', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { applyAppearance } = await import('./appearance');
    expect(() => applyAppearance()).not.toThrow();
  });
});

describe('layout', () => {
  it('scales cards with the tile and text settings', async () => {
    const { rowCardMetrics, infoHeight, rowHeight, rowTitleHeight } = await import('./layout');
    const { setSetting } = await import('./settings');
    const normal = rowCardMetrics();
    expect(normal.width).toBe(400);
    expect(normal.thumbHeight).toBe(225);
    setSetting('tileScale', 1.2);
    setSetting('textScale', 1.5);
    expect(rowCardMetrics().width).toBe(480);
    expect(infoHeight()).toBeGreaterThan(normal.infoHeight);
    expect(rowTitleHeight()).toBe(84);
    expect(rowHeight()).toBeGreaterThan(normal.height);
  });

  it('fits grid columns to the available width', async () => {
    const { gridMetrics, channelGridMetrics, contentWidth } = await import('./layout');
    const wide = gridMetrics(1728);
    expect(wide.columns).toBe(4);
    expect(wide.card.width * wide.columns + 24 * (wide.columns - 1)).toBeLessThanOrEqual(1728);
    expect(gridMetrics(1240).columns).toBe(3);
    expect(gridMetrics(100).columns).toBe(1);
    expect(channelGridMetrics(1728).columns).toBe(3);
    expect(channelGridMetrics(200).columns).toBe(1);
    expect(contentWidth()).toBeGreaterThan(300);
  });
});

describe('dev server proxying', () => {
  const webpackConfig = fs.readFileSync(path.resolve(__dirname, '../../../webpack.config.js'), 'utf8');
  const proxies = Array.from(webpackConfig.matchAll(/\{\s*context:\s*\[\s*'([^']+)'\s*\],\s*target:\s*'([^']+)',\s*pathRewrite:\s*\{\s*'\^([^']+)':\s*''\s*\}/g))
    .map(([, context, target, rewrite]) => ({ context, target, rewrite }));
  const withHost = async (hostname: string, devServer?: boolean) => {
    vi.resetModules();
    vi.stubGlobal('location', { ...window.location, hostname });
    if (devServer !== undefined) vi.stubGlobal('DEV_SERVER', devServer);
    return import('./constants');
  };

  it('uses the proxy paths when running in jsdom on localhost', async () => {
    const { IS_DEV, LBRY_API_URL, ODYSEE_PROXY_URL, LBRY_COM_URL } = await import('./constants');
    expect(IS_DEV).toBe(true);
    expect(LBRY_API_URL).toBe('/lbry-tv/api/v1/proxy');
    expect(ODYSEE_PROXY_URL).toBe('/odysee-proxy/api/v1/proxy');
    expect(LBRY_COM_URL).toBe('/lbry-api-com');
  });

  it('calls the APIs directly on the TV, with no dev server and another hostname', async () => {
    const { IS_DEV, LBRY_API_URL, ODYSEE_PROXY_URL, LBRY_COM_URL } = await withHost('tv.example', false);
    expect(IS_DEV).toBe(false);
    expect(LBRY_API_URL).toBe('https://api.lbry.tv/api/v1/proxy');
    expect(ODYSEE_PROXY_URL).toBe('https://api.na-backend.odysee.com/api/v1/proxy');
    expect(LBRY_COM_URL).toBe('https://api.lbry.com');
  });

  it('proxies when the build flag is set or the hostname is localhost, whichever applies', async () => {
    expect((await withHost('tv.example')).IS_DEV).toBe(false);
    expect((await withHost('tv.example', true)).IS_DEV).toBe(true);
    expect((await withHost('localhost', false)).IS_DEV).toBe(true);
    expect((await withHost('localhost', true)).LBRY_COM_URL).toBe('/lbry-api-com');
  });

  it('defines the dev server flag from the webpack serve environment', () => {
    expect(webpackConfig).toMatch(/new webpack\.DefinePlugin\(\{[^}]*DEV_SERVER:\s*JSON\.stringify\(process\.env\.WEBPACK_SERVE === 'true'\)/);
  });

  it('has a dev server proxy for every path the app calls in development', async () => {
    const { LBRY_API_URL, ODYSEE_PROXY_URL, LBRY_COM_URL } = await import('./constants');
    const targets = Object.fromEntries(proxies.map((proxy) => [proxy.context, proxy.target]));
    expect(targets).toEqual({
      '/lbry-tv': 'https://api.lbry.tv',
      '/odysee-proxy': 'https://api.na-backend.odysee.com',
      '/lbry-api-com': 'https://api.lbry.com',
    });
    [LBRY_API_URL, ODYSEE_PROXY_URL, LBRY_COM_URL].forEach((url) => {
      expect(targets).toHaveProperty([`/${url.split('/')[1]}`]);
    });
    proxies.forEach((proxy) => expect(proxy.rewrite).toBe(proxy.context));
    expect(webpackConfig).toContain('proxy: [');
  });

  it('never lets one proxy path be the start of another, as the dev server matches by prefix', () => {
    const contexts = proxies.map((proxy) => proxy.context);
    expect(contexts.length).toBeGreaterThan(1);
    contexts.forEach((context) => contexts.filter((other) => other !== context).forEach((other) => {
      expect(other.startsWith(context), `${context} would swallow ${other}`).toBe(false);
    }));
  });
});

describe('text and card sizes', () => {
  it('offer a wide range around Normal, in steps that only go up', async () => {
    const { TEXT_SCALES, TILE_SCALES } = await import('./constants');
    [TEXT_SCALES, TILE_SCALES].forEach((options) => {
      const codes = options.map((option) => option.code);
      expect(codes).toContain(1);
      expect([...codes].sort((a, b) => a - b)).toEqual(codes);
      expect(new Set(codes).size).toBe(codes.length);
      expect(options.find((option) => option.code === 1)?.name).toBe('Normal (100%)');
      expect(options.find((option) => option.code === 1.2)?.name).toBe('120%');
    });
    expect(TEXT_SCALES[0].code).toBeLessThanOrEqual(0.7);
    expect(TEXT_SCALES[TEXT_SCALES.length - 1].code).toBeGreaterThanOrEqual(1.7);
    expect(TILE_SCALES[0].code).toBeLessThanOrEqual(0.6);
    expect(TILE_SCALES[TILE_SCALES.length - 1].code).toBeGreaterThanOrEqual(1.7);
    expect(TEXT_SCALES.length).toBeGreaterThan(8);
    expect(TILE_SCALES.length).toBeGreaterThan(6);
    expect(TEXT_SCALES.length).toBeLessThanOrEqual(10);
    expect(TILE_SCALES.length).toBeLessThanOrEqual(10);
  });

  it('keep the page titles inside their header at the largest text size', async () => {
    const { TEXT_SCALES } = await import('./constants');
    const largest = TEXT_SCALES[TEXT_SCALES.length - 1].code;
    expect(40 * largest * 1.1).toBeLessThanOrEqual(96 - 14);
  });

  it('give every layout a usable grid at the smallest and the largest card size', async () => {
    const { TILE_SCALES } = await import('./constants');
    const { gridMetrics } = await import('./layout');
    const small = gridMetrics(1728, TILE_SCALES[0].code);
    const large = gridMetrics(1728, TILE_SCALES[TILE_SCALES.length - 1].code);
    expect(small.columns).toBeGreaterThan(large.columns);
    expect(large.columns).toBeGreaterThanOrEqual(1);
    expect(large.card.width).toBeLessThanOrEqual(1728);
    expect(small.card.width).toBeGreaterThan(100);
  });
});

describe('favicon', () => {
  const root = path.resolve(__dirname, '../../..');
  const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');

  it('is linked from the page as a vector and a 96px picture, like the other apps', () => {
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="./favicon.svg" />');
    expect(html).toContain('<link rel="icon" type="image/png" sizes="96x96" href="./favicon.png" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="./favicon.png" />');
  });

  it('is in the assets, which the build copies next to the page', () => {
    const png = fs.readFileSync(path.join(root, 'assets/favicon.png'));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(96);
    expect(png.readUInt32BE(20)).toBe(96);
    const svg = fs.readFileSync(path.join(root, 'assets/favicon.svg'), 'utf8');
    expect(svg).toContain('<svg');
    expect(svg).toContain('#DE0050');
    expect(fs.readFileSync(path.join(root, 'webpack.config.js'), 'utf8')).toContain("context: 'assets', from: '**/*'");
  });
});
