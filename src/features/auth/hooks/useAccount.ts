// Account actions as TanStack Query mutations. Screens call these; they talk
// to authService and keep the session store in sync.

import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { LocalPhoto, Session, User } from '@/lib/types';
import { authService, type ProfilePatch } from '@/services/auth';
import { paymentProvider } from '@/services/payments';
import { queryKeys } from '@/services/queryClient';
import { toast } from '@/store/toastStore';
import { go, leaveAuth } from '../authFlow';
import { useSessionStore, useUser } from '../sessionStore';

/** Signed in: store the session, greet, continue where the user was going. */
function useFinishAuth() {
  const { t } = useTranslation();
  const signIn = useSessionStore(s => s.signIn);
  return (session: Session) => {
    signIn(session);
    leaveAuth();
    toast.success(t('auth.welcome', { name: session.user.name }));
  };
}

export const useSignUpWithEmail = () =>
  useMutation({
    mutationFn: authService.signUpWithEmail,
    onSuccess: useFinishAuth(),
  });

export const useLogInWithEmail = () =>
  useMutation({
    mutationFn: authService.logInWithEmail,
    onSuccess: useFinishAuth(),
  });

export const useSignUpWithId = () =>
  useMutation({
    mutationFn: authService.signUpWithId,
    onSuccess: useFinishAuth(),
  });

/** Mutation whose result is the updated user. */
function useUserMutation<T>(mutationFn: (input: T) => Promise<User>) {
  const setUser = useSessionStore(s => s.setUser);
  return useMutation({ mutationFn, onSuccess: setUser });
}

export const useVerifyId = () =>
  useUserMutation((photo: LocalPhoto) => authService.verifyId(photo));

export const useUpdateProfile = () =>
  useUserMutation((patch: ProfilePatch) => authService.updateProfile(patch));

export const useChangeAvatar = () =>
  useUserMutation<LocalPhoto | void>(photo =>
    authService.changeAvatar(photo || undefined),
  );

/** Card number → provider token → account. The number never reaches our API. */
export const useSavePaymentCard = () =>
  useUserMutation(async (cardNumber: string) =>
    authService.savePaymentCard(await paymentProvider.tokenizeCard(cardNumber)),
  );

export const useRemovePaymentCard = () =>
  useUserMutation<void>(() => authService.removePaymentCard());

/**
 * Sign out (locally even if the server call fails) and go Home, as the
 * prototype does. Navigation lives here, not in the caller's mutate()
 * callbacks: the signed-in screen unmounts first and those wouldn't run.
 */
export function useLogOut() {
  const signOut = useSessionStore(s => s.signOut);
  return useMutation({
    mutationFn: () => authService.logOut().catch(() => {}),
    onSettled: () => {
      signOut();
      go({ name: 'Tabs', params: { screen: 'Home' } });
    },
  });
}

/**
 * Refresh the signed-in user from the server when the app starts (name,
 * verification status may have changed elsewhere). Mounted once in App.
 */
export function useSessionRefresh() {
  const user = useUser();
  const setUser = useSessionStore(s => s.setUser);
  const { data } = useQuery({
    queryKey: queryKeys.me,
    queryFn: authService.getMe,
    enabled: !!user,
  });
  useEffect(() => {
    if (data) setUser(data);
  }, [data, setUser]);
}
