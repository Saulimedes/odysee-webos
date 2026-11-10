import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSetting } from '@/shared/config';
import cs from './locales/cs';
import de from './locales/de';
import pl from './locales/pl';
import { detectLanguage, initLanguage, loadActiveLanguage, loadLanguage, resolveLanguage, t, translate, useTranslation } from './translation';

const AGO = '{count} year ago|{count} years ago';

beforeEach(() => { setSetting('uiLanguage', 'en'); });
afterEach(() => { setSetting('uiLanguage', 'auto'); });

describe('language detection', () => {
  it('uses the first supported language of the TV and falls back to English', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['xx', 'DE-de']);
    expect(detectLanguage()).toBe('de');
    expect(resolveLanguage('fr')).toBe('fr');
    expect(resolveLanguage('auto')).toBe('de');
    expect(resolveLanguage('klingon')).toBe('de');
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['', 'cs']);
    expect(detectLanguage()).toBe('cs');
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue([]);
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('pl-PL');
    expect(detectLanguage()).toBe('pl');
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('unknown');
    expect(detectLanguage()).toBe('en');
  });
});

describe('translate', () => {
  it('keeps unknown text, fills placeholders and leaves unknown placeholders alone', () => {
    expect(translate('en', 'Unknown text')).toBe('Unknown text');
    expect(translate('xx', 'Unknown text')).toBe('Unknown text');
    expect(translate('en', 'Hello {name} {missing}', { name: 'Ann' })).toBe('Hello Ann {missing}');
  });

  it('picks the plural form of English text without a catalog', () => {
    expect(translate('en', AGO, { count: 1 })).toBe('1 year ago');
    expect(translate('en', AGO, { count: 2 })).toBe('2 years ago');
    expect(translate('en', AGO, { count: 0 })).toBe('0 years ago');
    expect(translate('en', '{count} min ago', { count: 5 })).toBe('5 min ago');
    expect(translate('en', 'Count {count}', { count: 'many' })).toBe('Count many');
  });

  it('uses the catalog of a language once it is loaded', async () => {
    expect(translate('de', 'Settings')).toBe('Settings');
    await loadLanguage('de');
    expect(translate('de', 'Settings')).toBe(de.Settings);
    expect(de.Settings).not.toBe('Settings');
    const forms = de[AGO].split('|');
    expect(translate('de', AGO, { count: 1 })).toBe(forms[0].replace('{count}', '1'));
    expect(translate('de', AGO, { count: 4 })).toBe(forms[1].replace('{count}', '4'));
  });

  it('knows the four plural forms of Czech and Polish', async () => {
    await Promise.all([loadLanguage('cs'), loadLanguage('pl')]);
    const czech = cs[AGO].split('|');
    const polish = pl[AGO].split('|');
    expect(czech).toHaveLength(4);
    expect(polish).toHaveLength(4);
    expect(translate('cs', AGO, { count: 1 })).toBe(czech[0].replace('{count}', '1'));
    expect(translate('cs', AGO, { count: 3 })).toBe(czech[1].replace('{count}', '3'));
    expect(translate('cs', AGO, { count: 1.5 })).toBe(czech[2].replace('{count}', '1.5'));
    expect(translate('cs', AGO, { count: 5 })).toBe(czech[3].replace('{count}', '5'));
    expect(translate('pl', AGO, { count: 1 })).toBe(polish[0].replace('{count}', '1'));
    expect(translate('pl', AGO, { count: 3 })).toBe(polish[1].replace('{count}', '3'));
    expect(translate('pl', AGO, { count: 5 })).toBe(polish[2].replace('{count}', '5'));
    expect(translate('pl', AGO, { count: 22 })).toBe(polish[1].replace('{count}', '22'));
    expect(translate('pl', AGO, { count: 1.5 })).toBe(polish[3].replace('{count}', '1.5'));
  });
});

describe('hooks and start up', () => {
  it('follows language changes and the arrival of catalogs', async () => {
    const stop = initLanguage();
    const { result, unmount } = renderHook(useTranslation);
    expect(result.current('Settings')).toBe('Settings');
    await act(async () => { setSetting('uiLanguage', 'de'); await loadLanguage('de'); });
    expect(result.current('Settings')).toBe(de.Settings);
    expect(t('Settings')).toBe(de.Settings);
    expect(document.documentElement.lang).toBe('de');
    act(() => { setSetting('uiFont', 'inter'); });
    expect(document.documentElement.lang).toBe('de');
    act(() => { setSetting('uiFont', 'default'); });
    stop();
    unmount();
  });

  it('loads the saved language before the first screen and shares one request per language', async () => {
    vi.resetModules();
    const fresh = await import('./translation');
    const { setSetting: setFresh } = await import('@/shared/config');
    setFresh('uiLanguage', 'fr');
    const first = fresh.loadLanguage('fr');
    expect(fresh.loadLanguage('fr')).toBe(first);
    await fresh.loadActiveLanguage();
    expect(fresh.translate('fr', 'Settings')).not.toBe('Settings');
    await fresh.loadLanguage('fr');
    await fresh.loadLanguage('en');
    await fresh.loadLanguage('xx');
    expect(fresh.translate('xx', 'Settings')).toBe('Settings');
    await expect(loadActiveLanguage()).resolves.toBeUndefined();
  });

  it('keeps the English text when a language cannot be loaded', async () => {
    vi.resetModules();
    vi.doMock('./locales/it', () => { throw new Error('offline'); });
    const fresh = await import('./translation');
    await fresh.loadLanguage('it');
    expect(fresh.translate('it', 'Settings')).toBe('Settings');
    vi.doUnmock('./locales/it');
  });
});
