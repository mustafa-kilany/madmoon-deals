// The notification inbox (BACKEND_REVIEW M2): the bell's dot, the list, reading it, and a tap
// opening the same screen as the push would.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { go } from '@/features/auth/authFlow';
import { useSessionStore } from '@/features/auth/sessionStore';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { NotificationsScreen } from '@/features/notifications/NotificationsScreen';
import { changeLanguage } from '@/i18n';
import { api } from '@/services/api/client';
import { applyAccountEvent, connectLiveAccount } from '@/services/negotiation/live';
import { notificationsService } from '@/services/notifications';
import { queryClient } from '@/services/queryClient';
import { demoAccount } from '@/services/mock/users';

jest.mock('@/features/auth/authFlow', () => ({
  ...jest.requireActual('@/features/auth/authFlow'),
  go: jest.fn(),
}));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ canGoBack: () => true, goBack: jest.fn() }),
}));
jest.mock('@/services/api/client', () => ({
  ...jest.requireActual('@/services/api/client'),
  api: { get: jest.fn(), post: jest.fn() },
}));

const inbox = (unreadCount: number) => ({
  unreadCount,
  items: [
    { id: 'n1', type: 'sale', refId: 'SA-123456', title: 'Sold!', body: 'A driver will pick it up', read: false, createdAt: '2026-11-10T10:00:00.000Z' },
    { id: 'n2', type: 'outbid', refId: 'lamp', title: 'Outbid', body: 'Someone bid more', read: true, createdAt: '2026-11-09T10:00:00.000Z' },
  ],
});
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const show = (ui: React.ReactElement) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </SafeAreaProvider>,
  );

beforeEach(async () => {
  await changeLanguage('en');
  queryClient.clear();
  jest.mocked(api.get).mockReset();
  jest.mocked(api.post).mockReset().mockResolvedValue(undefined);
  jest.mocked(go).mockReset();
  useSessionStore.setState({ user: { ...demoAccount } });
});

afterEach(async () => {
  await cleanup();
  queryClient.clear();
});

test('the service asks in the app’s language and reads the dates', async () => {
  jest.mocked(api.get).mockResolvedValueOnce(inbox(1));
  const result = await notificationsService.get('ar');
  expect(api.get).toHaveBeenCalledWith('/me/notifications?lang=ar');
  expect(result.items[0].createdAt).toBe(Date.parse('2026-11-10T10:00:00.000Z'));
  await notificationsService.markRead();
  expect(api.post).toHaveBeenCalledWith('/me/notifications/read');
});

test('the bell: a dot and the count for screen readers while something is unread', async () => {
  jest.mocked(api.get).mockResolvedValue(inbox(1));
  await show(<NotificationBell />);
  await waitFor(() => expect(screen.getByTestId('notification-dot')).toBeTruthy());
  expect(screen.getByRole('button', { name: 'Notifications, 1 new' })).toBeTruthy();
  await fireEvent.press(screen.getByTestId('notification-bell'));
  expect(go).toHaveBeenCalledWith({ name: 'Notifications' });
});

test('the bell: no dot when all is read, and no bell for a guest', async () => {
  jest.mocked(api.get).mockResolvedValue(inbox(0));
  const view = await show(<NotificationBell />);
  await waitFor(() => expect(api.get).toHaveBeenCalled());
  expect(screen.queryByTestId('notification-dot')).toBeNull();
  await view.unmount();
  useSessionStore.setState({ user: null });
  await show(<NotificationBell />);
  expect(screen.queryByTestId('notification-bell')).toBeNull();
});

test('the inbox lists them, reads them on opening, and a tap opens the push’s screen', async () => {
  jest.mocked(api.get).mockResolvedValue(inbox(1));
  await show(<NotificationsScreen />);
  await waitFor(() => expect(screen.getByText('Sold!')).toBeTruthy());
  expect(screen.getByText('Someone bid more')).toBeTruthy();
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/me/notifications/read'));
  await fireEvent.press(screen.getByTestId('notification-n2'));
  expect(go).toHaveBeenCalledWith({ name: 'AuctionBidding', params: { itemId: 'lamp' } });
  await fireEvent.press(screen.getByTestId('notification-n1'));
  expect(go).toHaveBeenLastCalledWith({ name: 'MySales' });
});

test('nothing read yet: no call to mark it', async () => {
  jest.mocked(api.get).mockResolvedValue(inbox(0));
  await show(<NotificationsScreen />);
  await waitFor(() => expect(screen.getByText('Sold!')).toBeTruthy());
  expect(api.post).not.toHaveBeenCalled();
});

test('the live connection says a notification arrived: the inbox refreshes, nothing else', () => {
  const c = new QueryClient();
  c.setQueryData(['notifications', 'en'], inbox(0));
  c.setQueryData(['chats'], []);
  applyAccountEvent(c, { type: 'notifications' });
  expect(c.getQueryState(['notifications', 'en'])?.isInvalidated).toBe(true);
  expect(c.getQueryState(['chats'])?.isInvalidated).toBe(false);
  c.clear(); // its clean-up timers would keep Jest running

  const sockets: { onmessage?: (e: { data: string }) => void }[] = [];
  const onEvent = jest.fn();
  const stop = connectLiveAccount(
    () => {
      const socket = { close: jest.fn() } as unknown as WebSocket;
      sockets.push(socket as never);
      return socket;
    },
    { onEvent, onUp: jest.fn(), onDown: jest.fn() },
  );
  sockets[0].onmessage?.({ data: '{"type":"notifications"}' });
  expect(onEvent).toHaveBeenCalledWith({ type: 'notifications' });
  stop();
});
