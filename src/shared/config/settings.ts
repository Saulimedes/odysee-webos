import { useCallback, useSyncExternalStore } from 'react';
import { LOADER_STYLES, SETTING_DEFAULTS, STORAGE } from './constants';

export type Settings = typeof SETTING_DEFAULTS;
export type SettingKey = keyof Settings;
type Listener = (key: SettingKey) => void;

const listeners = new Set<Listener>();
const values: Partial<Record<SettingKey, string | number | boolean>> = {};
const CHOICES: Partial<Record<SettingKey, unknown[]>> = { loaderStyle: LOADER_STYLES.map((style) => style.code) };

function parseStored(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return raw; }
}

function readLegacy(key: SettingKey): unknown {
  try {
    const legacy = JSON.parse(localStorage.getItem(STORAGE.LEGACY_SETTINGS) || '{}');
    return legacy && typeof legacy === 'object' ? legacy[key] : undefined;
  } catch { return undefined; }
}

function readStored<K extends SettingKey>(key: K): Settings[K] {
  const fallback = SETTING_DEFAULTS[key];
  try {
    const raw = localStorage.getItem(key);
    const stored = raw === null ? readLegacy(key) : parseStored(raw);
    if (typeof stored !== typeof fallback) return fallback;
    const choices = CHOICES[key];
    return choices && !choices.includes(stored) ? fallback : stored as Settings[K];
  } catch { return fallback; }
}

export function getSetting<K extends SettingKey>(key: K): Settings[K] {
  if (!(key in values)) values[key] = readStored(key);
  return values[key] as Settings[K];
}

export function setSetting<K extends SettingKey>(key: K, value: Settings[K]) {
  values[key] = value;
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (error) { console.error('Could not save setting', key, error); }
  listeners.forEach((listener) => listener(key));
}

export function subscribeSettings(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useSetting<K extends SettingKey>(key: K): [Settings[K], (next: Settings[K]) => void] {
  const subscribe = useCallback((onChange: () => void) => subscribeSettings((changed) => {
    if (changed === key) onChange();
  }), [key]);
  const value = useSyncExternalStore(subscribe, () => getSetting(key));
  const set = useCallback((next: Settings[K]) => setSetting(key, next), [key]);
  return [value, set];
}
