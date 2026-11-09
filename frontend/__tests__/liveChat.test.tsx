import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomNav } from '@/components/BottomNav';
import { UnreadBadge } from '@/components/UnreadBadge';
import { useUser } from '@/features/auth/sessionStore';
import {
  useLiveAccount,
  useLiveAccountStatus,
} from '@/features/offers/hooks/useLiveAccount';
import { totalUnread } from '@/features/offers/hooks/useNegotiation';
import { ChatsScreen } from '@/features/offers/screens/ChatsScreen';
import { RECONNECTING_AFTER_MS } from '@/hooks/useReconnecting';
import '@/i18n';
import type { ChatMessage, ChatThread } from '@/lib/types';
import { useIsFocused } from '@react-navigation/native';
import { tokenStorage } from '@/services/api/tokenStorage';
import { negotiationService } from '@/services/negotiation';
import {
  applyAccountEvent,
  connectLiveAccount,
} from '@/services/negotiation/live';
import { queryClient, queryKeys } from '@/services/queryClient';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: jest.fn(() => true),
  useNavigation: () => ({ setParams: jest.fn(), navigate: jest.fn() }),
  useRoute: () => ({ params: undefined }),
}));
jest.mock('@/features/auth/sessionStore', () => ({
  ...jest.requireActual('@/features/auth/sessionStore'),
  useUser: jest.fn(() => ({ id: 'me', name: 'Me' })),
}));
jest.mock('@/features/auth/hooks/useRequireAuth', () => ({
  useRequireAuth: () => jest.fn(),
}));
jest.mock('@/components/BackButton', () => ({ BackButton: () => null }));
jest.mock('@/services/negotiation', () => ({
  negotiationService: {
    getChatThreads: jest.fn(),
    getChatMessages: jest.fn(),
    markChatRead: jest.fn(),
    sendMessage: jest.fn(),
  },
}));
jest.mock('@/services/api/tokenStorage', () => ({
  tokenStorage: { get: jest.fn(() => 'the-token') },
}));

const service = jest.mocked(negotiationService);

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(
    public url: string,
    public protocols?: unknown,
    public options?: { headers: Record<string, string> },
  ) {
    FakeSocket.all.push(this);
  }
  close() {
    this.closed = true;
  }
  up() {
    this.readyState = 1;
    this.onopen?.();
  }
}
const latest = () => FakeSocket.all[FakeSocket.all.length - 1];
const openSockets = () => FakeSocket.all.filter(s => !s.closed);

let appStateListener: (state: AppStateStatus) => void = () => {};
const setAppState = (value: string) =>
  Object.defineProperty(AppState, 'currentState', {
    value,
    configurable: true,
  });
const realSocket = globalThis.WebSocket;

beforeEach(() => {
  FakeSocket.all = [];
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_type, listener) => {
      appStateListener = listener as typeof appStateListener;
      return { remove: jest.fn() } as never;
    });
  setAppState('active');
  jest.mocked(useUser).mockReturnValue({ id: 'me', name: 'Me' } as never);
  jest.mocked(useIsFocused).mockReturnValue(true);
  for (const mock of Object.values(service)) mock.mockReset();
  queryClient.clear();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  globalThis.WebSocket = realSocket;
  queryClient.clear();
});

const thread = (unreadCount: number, id = 'c1'): ChatThread => ({
  id,
  itemId: 'i1',
  itemTitle: { ar: 'كنبة', en: 'Sofa' },
  itemImageUrl: 'https://images.example.com/x.jpg',
  otherPartyId: 'other',
  otherPartyName: 'Sara',
  lastMessage: 'Hello',
  updatedAt: 1000,
  unreadCount,
});
const message = (id: string, senderId = 'other'): ChatMessage => ({
  id,
  chatId: 'c1',
  senderId,
  senderName: 'Sara',
  text: `message ${id}`,
  createdAt: 1000,
});

describe('what the server says', () => {
  const client = () => {
    const c = new QueryClient();
    for (const key of [
      ['chats'],
      ['chats', 'c1', 'messages'],
      ['offers', 'o1'],
      ['support'],
      ['items', 'x'],
    ])
      c.setQueryData(key, 'old');
    return c;
  };
  const invalid = (c: QueryClient, key: string[]) =>
    c.getQueryState(key)?.isInvalidated;

  test('a chat changed: refresh chats and offers, nothing else', () => {
    const c = client();
    applyAccountEvent(c, { type: 'chat', chatId: 'c1' });
    expect(invalid(c, ['chats'])).toBe(true);
    expect(invalid(c, ['chats', 'c1', 'messages'])).toBe(true);
    expect(invalid(c, ['offers', 'o1'])).toBe(true);
    expect(invalid(c, ['support'])).toBe(false);
    expect(invalid(c, ['items', 'x'])).toBe(false);
  });

  test('support changed: refresh only support', () => {
    const c = client();
    applyAccountEvent(c, { type: 'support' });
    expect(invalid(c, ['support'])).toBe(true);
    expect(invalid(c, ['chats'])).toBe(false);
  });

  test('uses the keys the screens read', () => {
    expect(queryKeys.chats).toEqual(['chats']);
    expect(queryKeys.chatMessages('c1').slice(0, 1)).toEqual(['chats']);
    expect(queryKeys.support).toEqual(['support']);
    expect(queryKeys.offer('o1')[0]).toBe('offers');
  });

  test('anything else on the wire is ignored', () => {
    jest.useFakeTimers();
    const onEvent = jest.fn();
    const stop = connectLiveAccount(() => new WebSocket('ws://x'), {
      onEvent,
      onUp: jest.fn(),
      onDown: jest.fn(),
    });
    for (const data of [
      '{"type":"alive"}',
      'not json',
      '{"type":"chat"}',
      '{"type":"chat","chatId":5}',
      '{"type":"bid","bid":{}}',
      'null',
    ])
      latest().onmessage?.({ data });
    expect(onEvent).not.toHaveBeenCalled();
    latest().onmessage?.({ data: '{"type":"chat","chatId":"c1"}' });
    latest().onmessage?.({ data: '{"type":"support"}' });
    expect(onEvent.mock.calls.map(c => c[0])).toEqual([
      { type: 'chat', chatId: 'c1' },
      { type: 'support' },
    ]);
    stop();
  });
});

describe('the connection', () => {
  test('sends the token in a header, never in the address', async () => {
    const { unmount } = await renderHook(() => useLiveAccount());
    const socket = latest();
    expect(socket.url).toMatch(/^ws:\/\/.*\/v1\/me\/live$/);
    expect(socket.url).not.toContain('the-token');
    expect(socket.options?.headers.Authorization).toBe('Bearer the-token');
    expect(jest.mocked(tokenStorage.get)).toHaveBeenCalled();
    await unmount();
  });

  test('a guest has none, and signing out closes it', async () => {
    jest.mocked(useUser).mockReturnValue(undefined as never);
    const { rerender, unmount } = await renderHook(() => useLiveAccount());
    expect(FakeSocket.all).toHaveLength(0);

    jest.mocked(useUser).mockReturnValue({ id: 'me' } as never);
    await rerender({});
    expect(openSockets()).toHaveLength(1);

    jest.mocked(useUser).mockReturnValue(undefined as never);
    await rerender({});
    expect(openSockets()).toHaveLength(0);
    await unmount();
  });

  test('closes in the background, reconnects on return, and catches up', async () => {
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    const { unmount } = await renderHook(() => useLiveAccount());
    await act(async () => latest().up());
    expect(spy).toHaveBeenCalledWith({ queryKey: ['chats'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['support'] });

    await act(async () => appStateListener('background'));
    expect(openSockets()).toHaveLength(0);
    await act(async () => appStateListener('active'));
    expect(openSockets()).toHaveLength(1);
    await unmount();
  });

  test('a signal refreshes the chats at once', async () => {
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    const { unmount } = await renderHook(() => useLiveAccount());
    await act(async () => latest().up());
    spy.mockClear();
    await act(async () =>
      latest().onmessage?.({ data: '{"type":"chat","chatId":"c1"}' }),
    );
    expect(spy).toHaveBeenCalledWith({ queryKey: ['chats'] });
    await unmount();
  });

  test('tells the screens: connected, then reconnecting only after a real gap', async () => {
    jest.useFakeTimers();
    const { unmount } = await renderHook(() => useLiveAccount());
    const { result, unmount: done } = await renderHook(() =>
      useLiveAccountStatus(),
    );

    await act(async () => latest().up());
    expect(result.current.connected).toBe(true);
    expect(result.current.reconnecting).toBe(false);

    await act(async () => latest().onclose?.());
    expect(result.current.connected).toBe(false);
    expect(result.current.reconnecting).toBe(false);

    await act(async () => {
      jest.advanceTimersByTime(RECONNECTING_AFTER_MS);
    });
    expect(result.current.reconnecting).toBe(true);
    await done();
    await unmount();
  });
});

describe('unread numbers', () => {
  test('the total adds up every chat', () => {
    expect(totalUnread(undefined)).toBe(0);
    expect(totalUnread([thread(2), thread(0, 'c2'), thread(3, 'c3')])).toBe(5);
  });

  test('the badge: nothing at zero, the number, then 99+', async () => {
    const view = await render(<UnreadBadge count={0} testID="b" />);
    expect(screen.queryByTestId('b')).toBeNull();
    await view.rerender(<UnreadBadge count={7} testID="b" />);
    expect(screen.getByText('7')).toBeTruthy();
    await view.rerender(<UnreadBadge count={100} testID="b" />);
    expect(screen.getByText('99+')).toBeTruthy();
    await view.unmount();
  });

  const metrics = {
    frame: { x: 0, y: 0, width: 400, height: 800 },
    insets: { top: 0, left: 0, right: 0, bottom: 0 },
  };
  const nav = () =>
    render(
      <SafeAreaProvider initialMetrics={metrics}>
        <QueryClientProvider client={queryClient}>
          <BottomNav
            {...({
              state: { index: 0, routes: [{ name: 'Home' }] },
              navigation: { navigate: jest.fn() },
            } as unknown as BottomTabBarProps)}
          />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );

  test('the Chats tab shows the total, and says it to a screen reader', async () => {
    service.getChatThreads.mockResolvedValue([thread(2), thread(3, 'c2')]);
    const view = await nav();
    await waitFor(() => expect(screen.getByTestId('tab-unread')).toBeTruthy());
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /5 unread messages/ })).toBeTruthy();
    await view.unmount();
  });

  test('nothing to show: no number on the tab', async () => {
    service.getChatThreads.mockResolvedValue([thread(0)]);
    const view = await nav();
    await waitFor(() => expect(service.getChatThreads).toHaveBeenCalled());
    expect(screen.queryByTestId('tab-unread')).toBeNull();
    await view.unmount();
  });

  test('guests and drivers have no chats to ask for', async () => {
    jest.mocked(useUser).mockReturnValue(undefined as never);
    let view = await nav();
    expect(service.getChatThreads).not.toHaveBeenCalled();
    await view.unmount();

    jest.mocked(useUser).mockReturnValue({ id: 'd', role: 'courier' } as never);
    view = await nav();
    expect(service.getChatThreads).not.toHaveBeenCalled();
    await view.unmount();
  });

  const chats = () =>
    render(
      <SafeAreaProvider initialMetrics={metrics}>
        <QueryClientProvider client={queryClient}>
          <ChatsScreen />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
  /** Opens the chat from the list. */
  const openChat = async () => {
    await waitFor(() => expect(screen.getByText('Sara')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Sara'));
    });
    await waitFor(() => expect(service.getChatMessages).toHaveBeenCalled());
  };

  test('the list shows each chat’s number', async () => {
    service.getChatThreads.mockResolvedValue([thread(4)]);
    const view = await chats();
    await waitFor(() =>
      expect(screen.getByTestId('chat-unread-c1')).toBeTruthy(),
    );
    expect(screen.getByText('4')).toBeTruthy();
    await view.unmount();
  });

  test('opening a chat reads it up to the newest message, once, and clears the number', async () => {
    service.getChatThreads.mockResolvedValue([thread(2)]);
    service.getChatMessages.mockResolvedValue([message('m1'), message('m2')]);
    service.markChatRead.mockResolvedValue(undefined);
    const view = await chats();
    await openChat();
    await waitFor(() =>
      expect(service.markChatRead).toHaveBeenCalledWith('c1', 'm2'),
    );
    await waitFor(() =>
      expect(
        queryClient.getQueryData<ChatThread[]>(queryKeys.chats)?.[0]
          .unreadCount,
      ).toBe(0),
    );
    expect(service.markChatRead).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  test('a new message while it’s open is read too', async () => {
    service.getChatThreads.mockResolvedValue([thread(1)]);
    service.getChatMessages.mockResolvedValue([message('m1')]);
    service.markChatRead.mockResolvedValue(undefined);
    const view = await chats();
    await openChat();
    await waitFor(() =>
      expect(service.markChatRead).toHaveBeenLastCalledWith('c1', 'm1'),
    );

    service.getChatThreads.mockResolvedValue([thread(1)]);
    service.getChatMessages.mockResolvedValue([message('m1'), message('m2')]);
    await act(async () => {
      applyAccountEvent(queryClient, { type: 'chat', chatId: 'c1' });
    });
    await waitFor(() => expect(screen.getByText('message m2')).toBeTruthy());
    await waitFor(() =>
      expect(service.markChatRead).toHaveBeenLastCalledWith('c1', 'm2'),
    );
    await view.unmount();
  });

  test('nothing unread: nothing to mark', async () => {
    service.getChatThreads.mockResolvedValue([thread(0)]);
    service.getChatMessages.mockResolvedValue([message('m1', 'me')]);
    const view = await chats();
    await openChat();
    await waitFor(() => expect(screen.getByText('message m1')).toBeTruthy());
    expect(service.markChatRead).not.toHaveBeenCalled();
    await view.unmount();
  });

  test('not read while the app is in the background', async () => {
    setAppState('background');
    service.getChatThreads.mockResolvedValue([thread(2)]);
    service.getChatMessages.mockResolvedValue([message('m1')]);
    const view = await chats();
    await openChat();
    await waitFor(() => expect(screen.getByText('message m1')).toBeTruthy());
    expect(service.markChatRead).not.toHaveBeenCalled();
    await view.unmount();
  });

  test('not read while another tab is showing', async () => {
    jest.mocked(useIsFocused).mockReturnValue(false);
    service.getChatThreads.mockResolvedValue([thread(2)]);
    service.getChatMessages.mockResolvedValue([message('m1')]);
    const view = await chats();
    await openChat();
    await waitFor(() => expect(screen.getByText('message m1')).toBeTruthy());
    expect(service.markChatRead).not.toHaveBeenCalled();
    await view.unmount();
  });

  test('the same newest message is only marked once, whatever the list says meanwhile', async () => {
    service.getChatThreads.mockResolvedValue([thread(1)]);
    service.getChatMessages.mockResolvedValue([message('m1')]);
    service.markChatRead.mockResolvedValue(undefined);
    const view = await chats();
    await openChat();
    await waitFor(() => expect(service.markChatRead).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        queryClient.getQueryData<ChatThread[]>(queryKeys.chats)?.[0]
          .unreadCount,
      ).toBe(0),
    );

    // A list answer from before the read lands: still "1 unread", same newest message.
    await act(async () => {
      queryClient.setQueryData(queryKeys.chats, [thread(1)]);
    });
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 20));
    });
    expect(service.markChatRead).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  test('marking failed: the same message is tried again when the list changes', async () => {
    service.getChatThreads.mockResolvedValue([thread(1)]);
    service.getChatMessages.mockResolvedValue([message('m1')]);
    service.markChatRead.mockRejectedValueOnce(new Error('offline'));
    service.markChatRead.mockResolvedValue(undefined);
    const view = await chats();
    await openChat();
    await waitFor(() => expect(service.markChatRead).toHaveBeenCalledTimes(1));

    await act(async () => {
      queryClient.setQueryData(queryKeys.chats, [thread(2)]);
    });
    await waitFor(() => expect(service.markChatRead).toHaveBeenCalledTimes(2));
    expect(service.markChatRead).toHaveBeenLastCalledWith('c1', 'm1');
    await view.unmount();
  });

  test('marking failed: it tries again at the next change', async () => {
    service.getChatThreads.mockResolvedValue([thread(1)]);
    service.getChatMessages.mockResolvedValue([message('m1')]);
    service.markChatRead.mockRejectedValueOnce(new Error('offline'));
    service.markChatRead.mockResolvedValue(undefined);
    const view = await chats();
    await openChat();
    await waitFor(() => expect(service.markChatRead).toHaveBeenCalledTimes(1));

    service.getChatMessages.mockResolvedValue([message('m1'), message('m2')]);
    await act(async () => {
      applyAccountEvent(queryClient, { type: 'chat', chatId: 'c1' });
    });
    await waitFor(() =>
      expect(service.markChatRead).toHaveBeenLastCalledWith('c1', 'm2'),
    );
    await view.unmount();
  });
});
