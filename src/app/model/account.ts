import { invalidate } from '@/shared/api';
import { isLoggedIn, loadProfile, restoreSession, signOut } from '@/entities/session';
import { refreshHomepage } from '@/entities/category';
import { clearCollections, syncCollections } from '@/features/collections';

async function syncAccount() {
  await Promise.all([loadProfile(), syncCollections()]);
}

export function bootSession() {
  restoreSession();
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
