import { act, render, renderHook, screen } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { config } from '@/config';
import '@/i18n';
import { AuctionBiddingScreen } from '@/features/auctions/screens/AuctionBiddingScreen';
import { useLiveAuction } from '@/features/auctions/hooks/useLiveAuction';
import { RECONNECTING_AFTER_MS } from '@/hooks/useReconnecting';
import { useItem } from '@/features/catalog/hooks/useCatalog';
import { useBids } from '@/features/offers/hooks/useNegotiation';
import { useIsFocused } from '@react-navigation/native';
import type { Item } from '@/lib/types';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: jest.fn(() => true),
}));
jest.mock('@/features/catalog/hooks/useCatalog', () => ({
  useItem: jest.fn(),
}));
jest.mock('@/features/catalog/hooks/useSimilarItems', () => ({
  useSimilarItems: () => ({ items: [], fallback: false }),
}));
jest.mock('@/features/offers/hooks/useNegotiation', () => ({
  useBids: jest.fn(() => ({ data: [], isLoading: false })),
  usePlaceBid: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/features/auth/hooks/useRequireAuth', () => ({
  useRequireAuth: () => jest.fn(),
}));
jest.mock('@/features/auth/sessionStore', () => ({ useUser: () => undefined }));
jest.mock('@/components/BackButton', () => ({ BackButton: () => null }));

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
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
const realSocket = globalThis.WebSocket;

beforeEach(() => {
  jest.useFakeTimers();
  FakeSocket.all = [];
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as typeof appStateListener;
    return { remove: jest.fn() } as never;
  });
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  globalThis.WebSocket = realSocket;
});

type Props = { isFocused: boolean; itemId: string | undefined };
const hook = (focused = true, id: string | undefined = 'a1') =>
  renderHook<ReturnType<typeof useLiveAuction>, Props>(
    ({ isFocused, itemId }) => useLiveAuction(itemId, isFocused),
    { initialProps: { isFocused: focused, itemId: id } },
  );

describe('closes whenever nobody is looking', () => {
  test('connects only while the screen is showing', async () => {
    const { rerender, unmount } = await hook(false);
    expect(FakeSocket.all).toHaveLength(0);

    await rerender({ isFocused: true, itemId: 'a1' });
    expect(openSockets()).toHaveLength(1);
    expect(latest().url).toMatch(/^ws:\/\/.*\/v1\/listings\/a1\/live$/);

    await rerender({ isFocused: false, itemId: 'a1' }); // checkout opened on top
    expect(openSockets()).toHaveLength(0);

    await rerender({ isFocused: true, itemId: 'a1' }); // back again
    expect(openSockets()).toHaveLength(1);

    await unmount(); // left the screen
    expect(openSockets()).toHaveLength(0);
  });

  test('closes in the background and reconnects on return', async () => {
    const { result, unmount } = await hook();
    await act(async () => {
      latest().up();
    });
    expect(result.current.connected).toBe(true);

    await act(async () => {
      appStateListener('background');
    });
    expect(openSockets()).toHaveLength(0);
    expect(result.current.connected).toBe(false);

    // Hours later, nothing has been retrying behind the person's back.
    await act(async () => {
      jest.advanceTimersByTime(3_600_000);
    });
    expect(FakeSocket.all).toHaveLength(1);

    await act(async () => {
      appStateListener('active');
    });
    expect(openSockets()).toHaveLength(1);
    await unmount();
  });

  test('opened while in the background: waits for the app to come forward', async () => {
    Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });
    const { unmount } = await hook();
    expect(FakeSocket.all).toHaveLength(0);
    await act(async () => {
      appStateListener('active');
    });
    expect(openSockets()).toHaveLength(1);
    await unmount();
  });

  test('another auction gets its own connection, and the old one closes', async () => {
    const { rerender, unmount } = await hook();
    const first = latest();
    await rerender({ isFocused: true, itemId: 'a2' });
    expect(first.closed).toBe(true);
    expect(latest().url).toMatch(/\/listings\/a2\/live$/);
    expect(openSockets()).toHaveLength(1);
    await unmount();
  });

  test('the in-app demo never connects', async () => {
    const mock = config.mock as { negotiation: boolean };
    mock.negotiation = true;
    try {
      const { result, unmount } = await hook();
      expect(FakeSocket.all).toHaveLength(0);
      await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
      expect(result.current.reconnecting).toBe(false);
      await unmount();
    } finally {
      mock.negotiation = false;
    }
  });
});

describe('reconnecting', () => {
  test('not for a short blink, yes once it has lasted, gone when back', async () => {
    const { result, unmount } = await hook();
    await act(async () => {
      latest().up();
    });

    await act(async () => {
      latest().onclose?.();
    });
    expect(result.current.connected).toBe(false);
    await act(async () => {
      jest.advanceTimersByTime(RECONNECTING_AFTER_MS - 1);
    });
    expect(result.current.reconnecting).toBe(false);

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.reconnecting).toBe(true);

    // Failed tries keep it up and don't restart the wait.
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    await act(async () => {
      latest().onclose?.();
    });
    expect(result.current.reconnecting).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    await act(async () => {
      latest().up();
    });
    expect(result.current.connected).toBe(true);
    expect(result.current.reconnecting).toBe(false);
    await unmount();
  });

  test('a blink that recovers in time shows nothing, ever', async () => {
    const { result, unmount } = await hook();
    await act(async () => {
      latest().up();
    });
    await act(async () => {
      latest().onclose?.();
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    await act(async () => {
      latest().up();
    });
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(result.current.reconnecting).toBe(false);
    await unmount();
  });

  test('never connected at all also tells the person', async () => {
    const { result, unmount } = await hook();
    await act(async () => {
      jest.advanceTimersByTime(RECONNECTING_AFTER_MS);
    });
    expect(result.current.reconnecting).toBe(true);
    await unmount();
  });

  test('not while away: leaving and returning starts the wait over', async () => {
    const { result, rerender, unmount } = await hook();
    await act(async () => {
      jest.advanceTimersByTime(RECONNECTING_AFTER_MS);
    });
    expect(result.current.reconnecting).toBe(true);

    await rerender({ isFocused: false, itemId: 'a1' });
    expect(result.current.reconnecting).toBe(false);
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(result.current.reconnecting).toBe(false);

    await rerender({ isFocused: true, itemId: 'a1' });
    expect(result.current.reconnecting).toBe(false);
    await unmount();
  });
});

describe('the auction screen', () => {
  const item = (endsAt: number) =>
    ({
      id: 'a1',
      priceFils: 5000,
      imageUrl: 'https://images.example.com/x.jpg',
      title: { ar: 'كنبة', en: 'Sofa' },
      seller: { ar: 'سارة', en: 'Sara' },
      sellerId: 's1',
      condition: 'good',
      status: 'active',
      saleType: 'auction',
      auction: { endsAt, bidCount: 0, incrementFils: 1000 },
    }) as unknown as Item;

  const show = async (endsAt = Date.now() + 3_600_000) => {
    jest.mocked(useItem).mockReturnValue({ data: item(endsAt), isLoading: false } as never);
    return render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 400, height: 800 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <AuctionBiddingScreen
          route={{ params: { itemId: 'a1' } } as never}
          navigation={{ goBack: jest.fn() } as never}
        />
      </SafeAreaProvider>,
    );
  };
  const itemPoll = () => jest.mocked(useItem).mock.lastCall![1]!.pollMs!;
  const bidsPoll = () => jest.mocked(useBids).mock.lastCall![1];

  beforeEach(() => jest.mocked(useIsFocused).mockReturnValue(true));

  test('shows the warning after a lasting drop, and can still bid', async () => {
    const view = await show();
    await act(async () => {
      latest().up();
    });
    expect(screen.queryByTestId('auction-reconnecting')).toBeNull();

    await act(async () => {
      latest().onclose?.();
    });
    await act(async () => {
      jest.advanceTimersByTime(RECONNECTING_AFTER_MS);
    });
    expect(screen.getByTestId('auction-reconnecting')).toBeTruthy();
    expect(screen.getByText(/Reconnecting/)).toBeTruthy();
    expect(screen.getByText('Place Bid')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    await act(async () => {
      latest().up();
    });
    expect(screen.queryByTestId('auction-reconnecting')).toBeNull();
    await view.unmount();
  });

  test('no warning once the auction has ended: there’s nothing live to miss', async () => {
    const view = await show(Date.now() - 1000);
    await act(async () => {
      jest.advanceTimersByTime(RECONNECTING_AFTER_MS);
    });
    expect(screen.queryByTestId('auction-reconnecting')).toBeNull();
    await view.unmount();
  });

  test('polls quickly when down, slowly when connected, not at all under another screen', async () => {
    const live = item(Date.now() + 3_600_000);
    const view = await show();
    expect(itemPoll()(live)).toBe(config.pollMs.auction);
    expect(bidsPoll()).toBe(config.pollMs.auction);

    await act(async () => {
      latest().up();
    });
    expect(itemPoll()(live)).toBe(config.pollMs.auctionLive);
    expect(bidsPoll()).toBe(config.pollMs.auctionLive);
    // Ended: the winner comes from the server's closing job, so back to asking quickly.
    expect(itemPoll()(item(Date.now() - 1000))).toBe(config.pollMs.auction);
    await view.unmount();

    jest.mocked(useIsFocused).mockReturnValue(false);
    const hidden = await show();
    expect(itemPoll()(live)).toBe(false);
    expect(bidsPoll()).toBe(false);
    expect(FakeSocket.all.filter(s => !s.closed)).toHaveLength(0);
    await hidden.unmount();
  });
});
