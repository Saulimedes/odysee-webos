import { invalidate, pruneCache } from '@/shared/api';
import { isLoggedIn, loadProfile, restoreSession, signOut } from '@/entities/session';
import { subscribeSettings } from '@/shared/config';
import { refreshHomepage, switchHomepageLanguage } from '@/entities/category';
import { clearCollections, syncCollections } from '@/features/collections';

async function syncAccount() {
  await Promise.all([loadProfile(), syncCollections()]);
}

const CACHE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export function bootSession() {
  pruneCache(CACHE_MAX_AGE_MS);
  restoreSession();
  subscribeSettings((key) => {
    if (key === 'homepageLanguage' || key === 'uiLanguage') void switchHomepageLanguage();
  });
  void refreshHomepage();
  if (isLoggedIn()) void syncAccount();
}

export async function handleLogin() {
  invalidate('claims:');
  invalidate('feed:');
  await Promise.all([refreshHomepage(true), syncAccount()]);
}

export async function handleLogout() {
  await signOut();
  clearCollections(['watchLater', 'favorites']);
  invalidate('claims:');
  invalidate('feed:');
}
