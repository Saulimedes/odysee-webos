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

  it('migrates the old settings blob', async () => {
    localStorage.setItem('odysee-settings', JSON.stringify({ autoplay: false, quality: '720', nsfw: true }));
    const { getSetting } = await import('./settings');
    expect(getSetting('autoplay')).toBe(false);
    expect(getSetting('quality')).toBe('720');
    expect(getSetting('nsfw')).toBe(true);
  });

  it('survives a broken legacy blob and a failing storage', async () => {
    localStorage.setItem('odysee-settings', '{');
    const { getSetting, setSetting } = await import('./settings');
    expect(getSetting('quality')).toBe('auto');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setSetting('quality', '480');
    expect(getSetting('quality')).toBe('480');
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
    expect(computeAppearance({ ...base, accentColor: 'nonsense' }).vars['--accent']).toBe('#de0050');
    expect(computeAppearance({ ...base, accentColor: '#808080' }).vars['--bg']).toBe('#1a1a1a');
    expect(computeAppearance({ ...base, themeMode: 'light', accentColor: '#FFEB3B' }).vars['--accent-text']).toMatch(/^#/);
  });

  it('applies fonts and corners', async () => {
    const { computeAppearance } = await import('./appearance');
    const { vars } = computeAppearance({ themeMode: 'black', accentColor: '#DE0050', uiFont: 'inter', cornerStyle: 'square', textScale: 1.3, tileScale: 1.1 });
    expect(vars['--ui-font']).toContain("'Inter'");
    expect(vars['--radius-md']).toBe('0px');
    expect(vars['--text-scale']).toBe('1.3');
    expect(computeAppearance({ themeMode: 'black', accentColor: '#DE0050', uiFont: 'nope', cornerStyle: 'nope', textScale: 1, tileScale: 1 }).vars['--radius-md']).toBe('8px');
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
