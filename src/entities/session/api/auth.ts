import { LBRY_COM_URL } from '@/shared/config';
import { t } from '@/shared/i18n';
import { postForm, invalidate } from '@/shared/api';
import { getToken, updateSession, clearSession, type User } from '../model/store';

interface ApiResponse<T> { success?: boolean; data?: T; error?: string | { message?: string } }
type UserData = User & { auth_token?: string };

const errorText = (error: ApiResponse<unknown>['error'], fallback: string) => (
  typeof error === 'string' ? error : error?.message || fallback
);

export async function ensureToken() {
  const existing = getToken();
  if (existing) return existing;
  try {
    const response = await fetch(`${LBRY_COM_URL}/user/new`);
    const body = (await response.json()) as ApiResponse<{ auth_token: string }>;
    if (body.success && body.data) {
      updateSession({ token: body.data.auth_token });
      return body.data.auth_token;
    }
  } catch (error) {
    console.error('Failed to create anonymous account', error);
  }
  return null;
}

export async function signIn(email: string, password: string): Promise<{ success: true; user: User } | { success: false; error: string }> {
  const token = await ensureToken();
  if (!token) return { success: false, error: t('Network error. Please try again.') };
  try {
    const { body } = await postForm<ApiResponse<UserData>>(`${LBRY_COM_URL}/user/signin`, { auth_token: token, email, password });
    if (body.success && body.data) {
      const { auth_token: nextToken, ...user } = body.data;
      invalidate('acct:');
      updateSession({ token: nextToken || token, user });
      return { success: true, user };
    }
    return { success: false, error: errorText(body.error, t('Login failed')) };
  } catch (error) {
    console.error('Sign in failed', error);
    return { success: false, error: t('Network error. Please try again.') };
  }
}

export async function requestMagicLink(email: string): Promise<{ success: boolean; error?: string }> {
  const token = await ensureToken();
  if (!token) return { success: false, error: t('Network error. Please try again.') };
  try {
    const first = await postForm<ApiResponse<UserData>>(`${LBRY_COM_URL}/user/signin`, { auth_token: token, email });
    if (first.body.success) {
      if (first.body.data?.auth_token) updateSession({ token: first.body.data.auth_token });
      return { success: true };
    }
    if (first.status === 409) {
      const resend = await postForm<ApiResponse<unknown>>(`${LBRY_COM_URL}/user_email/resend_token`, { auth_token: token, email, only_if_expired: 'true' });
      if (resend.body.success) return { success: true };
    }
    return { success: false, error: errorText(first.body.error, t('Failed to send magic link')) };
  } catch (error) {
    console.error('Magic link failed', error);
    return { success: false, error: t('Network error. Please try again.') };
  }
}

export async function checkLoginStatus(): Promise<User | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const { body } = await postForm<ApiResponse<UserData>>(`${LBRY_COM_URL}/user/me`, { auth_token: token });
    if (body.success && body.data?.primary_email && body.data.has_verified_email) {
      const { auth_token: _unused, ...user } = body.data;
      invalidate('acct:');
      updateSession({ user });
      return user;
    }
  } catch (error) {
    console.error('Login status check failed', error);
  }
  return null;
}

export async function signOut() {
  const token = getToken();
  if (token) {
    try {
      await fetch(`${LBRY_COM_URL}/user/signout?${new URLSearchParams({ auth_token: token })}`, { method: 'POST' });
    } catch (error) {
      console.error('Sign out request failed', error);
    }
  }
  clearSession();
}
