// Push notifications through Firebase Cloud Messaging (backend/docs/PUSH.md).
// Signed in: ask permission once, send this phone's token and language to the
// server (POST /me/devices), and send it again when Firebase changes it. The
// server picks the pushes; this file only registers and opens what was tapped.

import {
  getInitialNotification,
  getMessaging,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  requestPermission,
  AuthorizationStatus,
  type RemoteMessage,
} from '@react-native-firebase/messaging';
import { PermissionsAndroid, Platform } from 'react-native';
import { go } from '@/features/auth/authFlow';
import type { Lang } from '@/lib/types';
import { api } from '../api/client';
import { routeForPush } from './routeForPush';

const messaging = () => getMessaging();

/** Android 13+ asks the user; older Android allows it. iPhone always asks. */
async function allowed(): Promise<boolean> {
  if (Platform.OS === 'android') {
    if (Platform.Version < 33) return true;
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }
  const status = await requestPermission(messaging());
  return (
    status === AuthorizationStatus.AUTHORIZED ||
    status === AuthorizationStatus.PROVISIONAL
  );
}

const register = (token: string, language: Lang) =>
  api.post<void>('/me/devices', {
    token,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    language,
  });

/**
 * After sign-in and at every launch while signed in. Returns a function that
 * stops listening for new tokens (on sign-out). Never throws: pushes are extra.
 */
export async function startPush(language: Lang): Promise<() => void> {
  try {
    if (!(await allowed())) return () => {};
    await register(await getToken(messaging()), language);
    return onTokenRefresh(messaging(), token => {
      register(token, language).catch(() => {});
    });
  } catch {
    return () => {};
  }
}

/** Before log-out (needs the session): this phone stops getting the account's pushes. */
export async function stopPush(): Promise<void> {
  try {
    const token = await getToken(messaging());
    await api.delete<void>(`/me/devices/${encodeURIComponent(token)}`);
  } catch {
    // The server also drops it with the session.
  }
}

const open = (message: RemoteMessage | null) => {
  const route = routeForPush(message?.data);
  if (route) go(route);
};

/**
 * Taps on pushes: one that started the app, and later ones while it runs in
 * the background. While the app is open, a push shows as a toast instead
 * (Android doesn't show it then). Call once the navigation is ready.
 */
export function handlePushTaps(
  showWhileOpen: (text: string) => void,
): () => void {
  try {
    getInitialNotification(messaging()).then(open, () => {});
    const offTap = onNotificationOpenedApp(messaging(), open);
    const offOpen = onMessage(messaging(), message => {
      const { title, body } = message.notification ?? {};
      const text = [title, body].filter(Boolean).join(': ');
      if (text) showWhileOpen(text);
    });
    return () => {
      offTap();
      offOpen();
    };
  } catch {
    return () => {};
  }
}
