import { STORAGE } from '@/shared/config';
import { createStore, readJson, writeJson, removeKey } from '@/shared/lib';
import { invalidate } from '@/shared/api';

export interface ProfileChannel { id: string; name: string; thumb: string | null }

export interface User {
  primary_email?: string;
  has_verified_email?: boolean;
  channel?: ProfileChannel;
  profile_image?: string | null;
}

export interface SessionState { token: string | null; user: User | null }

export const session = createStore<SessionState>({ token: null, user: null });

export const useSession = session.use;
export const getToken = () => session.get().token;
export const isLoggedIn = () => Boolean(session.get().user?.primary_email);

function persist(state: SessionState) {
  if (state.token) writeJson(STORAGE.AUTH, { authToken: state.token, user: state.user });
  else removeKey(STORAGE.AUTH);
}

export function updateSession(patch: Partial<SessionState>) {
  const next = { ...session.get(), ...patch };
  session.set(next);
  persist(next);
}

export function updateUser(patch: Partial<User>) {
  const user = session.get().user;
  if (user) updateSession({ user: { ...user, ...patch } });
}

export function restoreSession() {
  const saved = readJson<{ authToken?: string; user?: User } | null>(STORAGE.AUTH, null);
  session.set({ token: saved?.authToken || null, user: saved?.user || null });
}

export function clearSession() {
  invalidate('acct:');
  updateSession({ token: null, user: null });
}
