// Who is signed in. The user is kept on the device so the app shows the
// account straight away on launch; the token lives in tokenStorage. A 401
// from the API (expired or revoked token) signs the user out.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useFavoritesStore } from '@/features/favorites/store';
import { zustandStorage } from '@/lib/storage';
import type { Session, User } from '@/lib/types';
import { setUnauthorizedHandler } from '@/services/api/client';
import { tokenStorage } from '@/services/api/tokenStorage';
import { queryClient, queryKeys } from '@/services/queryClient';

type SessionState = {
  /** null = guest. */
  user: User | null;
  signIn: (session: Session) => void;
  setUser: (user: User) => void;
  signOut: () => void;
};

export const useSessionStore = create<SessionState>()(
  persist(
    set => ({
      user: null,
      signIn: ({ token, user }) => {
        tokenStorage.set(token);
        set({ user });
      },
      setUser: user => set({ user }),
      signOut: () => {
        tokenStorage.clear();
        queryClient.removeQueries({ queryKey: queryKeys.me });
        useFavoritesStore.getState().clear();
        set({ user: null });
      },
    }),
    { name: 'session', storage: zustandStorage },
  ),
);

/** Launch: load the token from the keychain; a saved user without one isn't signed in. */
export async function restoreSession(): Promise<void> {
  await tokenStorage.load();
  if (!tokenStorage.get()) {
    useSessionStore.setState({ user: null });
    useFavoritesStore.getState().clear();
  }
}

setUnauthorizedHandler(() => {
  if (useSessionStore.getState().user) useSessionStore.getState().signOut();
});

export const useUser = () => useSessionStore(s => s.user);
