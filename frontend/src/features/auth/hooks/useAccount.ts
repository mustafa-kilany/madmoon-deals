// Account actions as TanStack Query mutations. Screens call these; they talk
// to authService and keep the session store in sync.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Share } from 'react-native';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { config } from '@/config';
import type { LocalPhoto, Session, User } from '@/lib/types';
import { authService, type ProfilePatch } from '@/services/auth';
import { forgetGoogleAccount, pickGoogleAccount } from '@/services/auth/google';
import { paymentProvider } from '@/services/payments';
import { stopPush } from '@/services/push';
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

/**
 * Google's account picker → ID token → our server. Resolves to null (and does
 * nothing) when the user closes the picker. The mock backend needs no token.
 */
export function useLogInWithGoogle() {
  const finish = useFinishAuth();
  return useMutation({
    mutationFn: async (): Promise<Session | null> => {
      if (config.mock.auth) return authService.logInWithGoogle();
      const idToken = await pickGoogleAccount();
      return idToken ? authService.logInWithGoogle(idToken) : null;
    },
    onSuccess: session => {
      if (session) finish(session);
    },
  });
}

export const useLogInWithApple = () =>
  useMutation({
    mutationFn: authService.logInWithApple,
    onSuccess: useFinishAuth(),
  });

export const useSendOtp = () =>
  useMutation({
    mutationFn: authService.sendOtp,
  });

export const useForgotPassword = () =>
  useMutation({
    mutationFn: authService.forgotPassword,
  });

export const useResetPassword = () =>
  useMutation({
    mutationFn: authService.resetPassword,
    onSuccess: useFinishAuth(),
  });

/** Mutation whose result is the updated user. */
function useUserMutation<T>(mutationFn: (input: T) => Promise<User>) {
  const setUser = useSessionStore(s => s.setUser);
  return useMutation({ mutationFn, onSuccess: setUser });
}

export const useStartIdVerification = () =>
  useMutation({ mutationFn: authService.startIdVerification });

/** Reload the signed-in user (e.g. back from Sanad: verified yet?). */
export function useReloadUser() {
  const setUser = useSessionStore(s => s.setUser);
  return useMutation({ mutationFn: authService.getMe, onSuccess: setUser });
}

export const useUpdateProfile = () =>
  useUserMutation((patch: ProfilePatch) => authService.updateProfile(patch));

export const useChangeAvatar = () =>
  useUserMutation((photo: LocalPhoto) => authService.changeAvatar(photo));

/** Card number → provider token → account. The number never reaches our API. */
export const useSavePaymentCard = () =>
  useUserMutation(async (cardNumber: string) =>
    authService.savePaymentCard(await paymentProvider.tokenizeCard(cardNumber)),
  );

const PAYOUT_KEY = ['payout-account'];

/** S3.7: where the seller's money goes. Only for signed-in sellers. */
export const usePayoutAccount = (enabled = true) =>
  useQuery({ queryKey: PAYOUT_KEY, queryFn: authService.getPayoutAccount, enabled });

export function useSavePayoutAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authService.savePayoutAccount,
    onSuccess: saved => queryClient.setQueryData(PAYOUT_KEY, saved),
  });
}

export const useSendPayoutCode = () => useMutation({ mutationFn: authService.sendPayoutCode });

/** S8.4: a copy of the person's data, handed to the phone's share sheet. */
export const useExportMyData = () =>
  useMutation({
    mutationFn: async () => {
      const data = await authService.exportMyData();
      await Share.share({ title: 'madmoon-my-data.json', message: JSON.stringify(data, null, 2) });
    },
  });

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
    // The push token goes first: removing it needs the session.
    mutationFn: () =>
      stopPush()
        .then(() => authService.logOut())
        .catch(() => {})
        .then(forgetGoogleAccount),
    onSettled: () => {
      // A courier's navigator has no Tabs: signing out swaps in the shopper's
      // navigator, which already opens on Home.
      const wasCourier = useSessionStore.getState().user?.role === 'courier';
      signOut();
      if (!wasCourier) go({ name: 'Tabs', params: { screen: 'Home' } });
    },
  });
}

/** Delete the account on the server, then sign out locally and go Home. */
export function useDeleteAccount() {
  const { t } = useTranslation();
  const signOut = useSessionStore(s => s.signOut);
  return useMutation({
    mutationFn: authService.deleteAccount,
    onSuccess: () => {
      forgetGoogleAccount();
      signOut();
      go({ name: 'Tabs', params: { screen: 'Home' } });
      toast.success(t('profile.accountDeleted'));
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
