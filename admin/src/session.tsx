// Who is signed in to the dashboard. On load, a saved token is checked with
// GET /admin/me; a rejected token (expired, logged out elsewhere, no longer an
// admin) sends the admin back to the log-in page with a note.

import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setSignedOutHandler, token } from './api';
import type { Admin, LoginDone } from './types';

type Session = {
  /** undefined while checking a saved token; null = signed out. */
  admin: Admin | null | undefined;
  /** Why the last session ended, for the log-in page. */
  endedNote: string | null;
  signIn: (done: LoginDone) => void;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [admin, setAdmin] = useState<Admin | null | undefined>(token.get() ? undefined : null);
  const [endedNote, setEndedNote] = useState<string | null>(null);

  useEffect(() => {
    setSignedOutHandler(() => {
      queryClient.clear();
      setAdmin(null);
      setEndedNote('Your session ended. Log in again.');
    });
    if (token.get())
      api.get<Admin>('/admin/me').then(setAdmin, () => {
        token.clear();
        setAdmin(null);
      });
  }, [queryClient]);

  const signIn = useCallback((done: LoginDone) => {
    token.set(done.token);
    setEndedNote(null);
    setAdmin(done.admin);
  }, []);

  const signOut = useCallback(async () => {
    await api.post('/admin/auth/logout').catch(() => {});
    token.clear();
    queryClient.clear();
    setAdmin(null);
  }, [queryClient]);

  return <SessionContext.Provider value={{ admin, endedNote, signIn, signOut }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession outside SessionProvider');
  return session;
}
