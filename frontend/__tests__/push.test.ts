// Push notifications (backend/docs/PUSH.md): the phone registers its token and
// language after sign-in, removes it before log-out, and a tapped push opens
// the right screen.

import {
  getInitialNotification,
  onMessage,
} from '@react-native-firebase/messaging';
import { PermissionsAndroid, Platform } from 'react-native';
import { go } from '@/features/auth/authFlow';
import { tokenStorage } from '@/services/api/tokenStorage';
import { handlePushTaps, startPush, stopPush } from '@/services/push';
import { routeForPush } from '@/services/push/routeForPush';

jest.mock('@/config', () => ({
  config: { apiBaseUrl: 'https://api.test/v1', requestTimeoutMs: 1000 },
}));
jest.mock('@/features/auth/authFlow', () => ({ go: jest.fn() }));

const fetchMock = jest.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;
const ok = () =>
  fetchMock.mockResolvedValue({ ok: true, status: 204, text: async () => '' });
const request = (i = 0) => {
  const [url, init] = fetchMock.mock.calls[i];
  return { url, method: init.method, body: init.body && JSON.parse(init.body) };
};

beforeEach(() => {
  fetchMock.mockReset();
  tokenStorage.set('tok123');
  Object.defineProperty(Platform, 'OS', {
    value: 'android',
    configurable: true,
  });
  Object.defineProperty(Platform, 'Version', { value: 34, configurable: true });
});

test('signed in and allowed: the token and language go to the server', async () => {
  ok();
  jest.spyOn(PermissionsAndroid, 'request').mockResolvedValueOnce('granted');
  await startPush('ar');
  expect(request()).toEqual({
    url: 'https://api.test/v1/me/devices',
    method: 'POST',
    body: {
      token: 'test-fcm-token-0123456789abcdef',
      platform: 'android',
      language: 'ar',
    },
  });
});

test('notifications refused: nothing is registered, and nothing throws', async () => {
  jest.spyOn(PermissionsAndroid, 'request').mockResolvedValueOnce('denied');
  await expect(startPush('en')).resolves.toBeInstanceOf(Function);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('log-out removes this phone first; a failure never blocks log-out', async () => {
  ok();
  await stopPush();
  expect(request()).toMatchObject({
    url: 'https://api.test/v1/me/devices/test-fcm-token-0123456789abcdef',
    method: 'DELETE',
  });
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  await expect(stopPush()).resolves.toBeUndefined();
});

test('each push type opens its screen', () => {
  expect(routeForPush({ type: 'chat', id: 'c1' })).toEqual({
    name: 'Tabs',
    params: { screen: 'Chats', params: { chatId: 'c1' } },
  });
  expect(routeForPush({ type: 'offer', id: 'c2' })).toEqual({
    name: 'Tabs',
    params: { screen: 'Chats', params: { chatId: 'c2' } },
  });
  expect(routeForPush({ type: 'outbid', id: 'l1' })).toEqual({
    name: 'AuctionBidding',
    params: { itemId: 'l1' },
  });
  expect(routeForPush({ type: 'auction_won', id: 'l1' })).toEqual({
    name: 'AuctionBidding',
    params: { itemId: 'l1' },
  });
  expect(routeForPush({ type: 'order', id: 'SA-123456' })).toEqual({
    name: 'OrderTracking',
  });
  expect(routeForPush({ type: 'sale', id: 'SA-123456' })).toEqual({
    name: 'Tabs',
    params: { screen: 'Profile' },
  });
  expect(routeForPush({ type: 'something_new', id: 'x' })).toBeNull();
  expect(routeForPush(undefined)).toBeNull();
});

test('the push that opened the app is followed; one arriving while open is a toast', async () => {
  (getInitialNotification as jest.Mock).mockResolvedValueOnce({
    data: { type: 'order', id: 'SA-123456' },
  });
  const shown: string[] = [];
  handlePushTaps(text => shown.push(text));
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(go).toHaveBeenCalledWith({ name: 'OrderTracking' });

  const whileOpen = (onMessage as jest.Mock).mock.calls[0][1];
  whileOpen({ notification: { title: 'Lamp', body: 'New offer: 80 JOD' } });
  expect(shown).toEqual(['Lamp: New offer: 80 JOD']);
});
