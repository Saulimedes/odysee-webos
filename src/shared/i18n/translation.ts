import { useCallback, useSyncExternalStore } from 'react';
import { getSetting, subscribeSettings, useSetting } from '@/shared/config';

type Catalog = Record<string, string>;
type Params = Record<string, unknown>;

const LOADERS: Record<string, () => Promise<{ default: Catalog }>> = {
  de: () => import('./locales/de'),
  fr: () => import('./locales/fr'),
  es: () => import('./locales/es'),
  it: () => import('./locales/it'),
  nl: () => import('./locales/nl'),
  pt: () => import('./locales/pt'),
  pl: () => import('./locales/pl'),
  cs: () => import('./locales/cs'),
};
const SUPPORTED = ['en', ...Object.keys(LOADERS)];
const CATALOGS: Record<string, Catalog> = { en: {} };
const pending = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

export function loadLanguage(code: string): Promise<void> {
  if (CATALOGS[code] || !LOADERS[code]) return Promise.resolve();
  let request = pending.get(code);
  if (!request) {
    request = LOADERS[code]().then((module) => {
      CATALOGS[code] = module.default;
      listeners.forEach((notify) => notify());
    }).catch(() => undefined).then(() => { pending.delete(code); });
    pending.set(code, request);
  }
  return request;
}

const subscribeCatalogs = (notify: () => void) => {
  listeners.add(notify);
  return () => { listeners.delete(notify); };
};
const loadedCount = () => Object.keys(CATALOGS).length;

export function detectLanguage() {
  const preferred = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
  for (let i = 0; i < preferred.length; i++) {
    const code = String(preferred[i] || '').toLowerCase().split('-')[0];
    if (SUPPORTED.includes(code)) return code;
  }
  return 'en';
}

export const resolveLanguage = (setting: string) => (SUPPORTED.includes(setting) ? setting : detectLanguage());

export const loadActiveLanguage = () => loadLanguage(resolveLanguage(getSetting('uiLanguage')));

const pluralRules = new Map<string, Intl.PluralRules>();

// Forms follow the plural categories of the language: two are one and other, four (Czech, Polish) are one, few, many and other
function pluralForm(language: string, text: string, count: number) {
  const forms = text.split('|');
  let rules = pluralRules.get(language);
  if (!rules) pluralRules.set(language, rules = new Intl.PluralRules(language));
  const order = forms.length === 4 ? ['one', 'few', 'many', 'other'] : ['one', 'other'];
  const at = order.indexOf(rules.select(count));
  return forms[at < 0 ? forms.length - 1 : at];
}

export function translate(language: string, text: string, params?: Params): string {
  const catalog = CATALOGS[language];
  const translated = catalog && catalog[text] !== undefined ? catalog[text] : text;
  if (!params) return translated;
  const chosen = typeof params.count === 'number' && translated.includes('|') ? pluralForm(language, translated, params.count) : translated;
  return chosen.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

export const t = (text: string, params?: Params) => translate(resolveLanguage(getSetting('uiLanguage')), text, params);

export function useLanguage() {
  const [setting] = useSetting('uiLanguage');
  return resolveLanguage(setting);
}

export function useTranslation() {
  const language = useLanguage();
  const loaded = useSyncExternalStore(subscribeCatalogs, loadedCount);
  return useCallback((text: string, params?: Params) => translate(language, text, params), [language, loaded]);
}

export function initLanguage() {
  const apply = () => {
    document.documentElement.lang = resolveLanguage(getSetting('uiLanguage'));
    void loadActiveLanguage();
  };
  apply();
  return subscribeSettings((key) => {
    if (key === 'uiLanguage') apply();
  });
}
