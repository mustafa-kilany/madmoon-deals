import { QueryClient } from '@tanstack/react-query';
import type { Bid, Item } from '@/lib/types';
import {
  applyLiveBid,
  connectLiveBids,
} from '@/services/negotiation/live';
import { queryKeys } from '@/services/queryClient';

const ID = 'auction-1';
const itemKey = queryKeys.item(ID);
const bidsKey = ['bids', ID];

const item = (priceFils: number, bidCount = 0) =>
  ({
    id: ID,
    priceFils,
    auction: { endsAt: Date.now() + 60_000, bidCount, incrementFils: 100 },
  }) as Item;
const bid = (amountFils: number, id = `bid-${amountFils}`): Bid => ({
  id,
  itemId: ID,
  bidderId: 'u1',
  bidderName: 'Sara',
  amountFils,
  createdAt: 1000,
});

describe('applyLiveBid', () => {
  let client: QueryClient;
  beforeEach(() => {
    client = new QueryClient();
  });
  afterEach(() => client.clear());

  test('updates the price, the count and the list, using the keys the screen reads', async () => {
    client.setQueryData(itemKey, item(1000, 2));
    client.setQueryData(bidsKey, [bid(1000)]);
    await applyLiveBid(client, bid(2000));
    const updated = client.getQueryData<Item>(itemKey)!;
    expect(updated.priceFils).toBe(2000);
    expect(updated.auction?.bidCount).toBe(3);
    expect(
      client.getQueryData<Bid[]>(bidsKey)!.map(b => b.amountFils),
    ).toEqual([2000, 1000]);
  });

  test('the same bid twice (a poll already brought it) counts once', async () => {
    client.setQueryData(itemKey, item(2000, 1));
    client.setQueryData(bidsKey, [bid(2000)]);
    await applyLiveBid(client, bid(2000));
    expect(client.getQueryData<Item>(itemKey)!.auction?.bidCount).toBe(1);
    expect(client.getQueryData<Bid[]>(bidsKey)).toHaveLength(1);
  });

  test('an older bid never lowers the price, and the list stays highest first', async () => {
    client.setQueryData(itemKey, item(3000));
    client.setQueryData(bidsKey, [bid(3000)]);
    await applyLiveBid(client, bid(2000));
    expect(client.getQueryData<Item>(itemKey)!.priceFils).toBe(3000);
    expect(
      client.getQueryData<Bid[]>(bidsKey)!.map(b => b.amountFils),
    ).toEqual([3000, 2000]);
  });

  test('a poll already on its way can’t put the old price back', async () => {
    client.setQueryData(itemKey, item(1000));
    let answer: (value: Item) => void = () => {};
    const poll = client.fetchQuery({
      queryKey: itemKey,
      queryFn: () => new Promise<Item>(resolve => (answer = resolve)),
    });
    poll.catch(() => {});
    await Promise.resolve();
    await applyLiveBid(client, bid(2000));
    answer(item(1000)); // the answer to a question asked before the bid
    await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
    expect(client.getQueryData<Item>(itemKey)!.priceFils).toBe(2000);
  });

  test('a bid during the first load survives that load’s older answer', async () => {
    let answerItem: (value: Item) => void = () => {};
    let answerBids: (value: Bid[]) => void = () => {};
    const loads = Promise.all([
      client.fetchQuery({
        queryKey: itemKey,
        queryFn: () => new Promise<Item>(resolve => (answerItem = resolve)),
      }),
      client.fetchQuery({
        queryKey: bidsKey,
        queryFn: () => new Promise<Bid[]>(resolve => (answerBids = resolve)),
      }),
    ]);
    await Promise.resolve();
    const applied = applyLiveBid(client, bid(2000));
    await Promise.resolve();
    // The first load isn't cancelled (that would leave the screen on its spinner)…
    expect(client.getQueryState(itemKey)?.fetchStatus).toBe('fetching');
    // …and its answers are from before the bid.
    answerItem(item(1000, 0));
    answerBids([]);
    await loads;
    await applied;
    const loaded = client.getQueryData<Item>(itemKey)!;
    expect(loaded.priceFils).toBe(2000);
    expect(loaded.auction?.bidCount).toBe(1);
    expect(client.getQueryData<Bid[]>(bidsKey)!.map(b => b.id)).toEqual([
      'bid-2000',
    ]);
  });

  test('a failed first load: nothing to update, and no error', async () => {
    const loading = client.fetchQuery({
      queryKey: itemKey,
      retry: false,
      queryFn: () => Promise.reject(new Error('offline')),
    });
    const applied = applyLiveBid(client, bid(2000));
    await expect(loading).rejects.toThrow('offline');
    await expect(applied).resolves.toBeUndefined();
    expect(client.getQueryData(itemKey)).toBeUndefined();
  });
});

describe('connectLiveBids', () => {
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
  const realSocket = globalThis.WebSocket;
  const handlers = () => ({
    onBid: jest.fn(),
    onUp: jest.fn(),
    onDown: jest.fn(),
  });

  beforeEach(() => {
    jest.useFakeTimers();
    FakeSocket.all = [];
    globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  });
  afterEach(() => {
    jest.useRealTimers();
    globalThis.WebSocket = realSocket;
  });

  test('passes bids on with dates as the app uses them; ignores anything else', () => {
    const h = handlers();
    const stop = connectLiveBids('ws://x', h);
    latest().up();
    expect(h.onUp).toHaveBeenCalledTimes(1);
    latest().onmessage?.({
      data: JSON.stringify({
        type: 'bid',
        bid: { ...bid(2000), createdAt: '2026-11-08T12:00:00.000Z' },
      }),
    });
    expect(h.onBid).toHaveBeenCalledWith({
      ...bid(2000),
      createdAt: Date.parse('2026-11-08T12:00:00.000Z'),
    });
    // Each one wrong in exactly one way, so each check has to do its own work.
    const good = { ...bid(2000), createdAt: '2026-11-08T12:00:00.000Z' };
    for (const data of [
      '{"type":"alive"}',
      'not json',
      '{"type":"bid"}',
      JSON.stringify({ type: 'bid', bid: null }),
      JSON.stringify({ type: 'other', bid: good }),
      JSON.stringify({ type: 'bid', bid: { ...good, id: 1 } }),
      JSON.stringify({ type: 'bid', bid: { ...good, itemId: 1 } }),
      JSON.stringify({ type: 'bid', bid: { ...good, bidderId: 1 } }),
      JSON.stringify({ type: 'bid', bid: { ...good, bidderName: 1 } }),
      JSON.stringify({ type: 'bid', bid: { ...good, amountFils: '2000' } }),
      JSON.stringify({ type: 'bid', bid: { ...good, createdAt: 1000 } }),
    ])
      latest().onmessage?.({ data });
    expect(h.onBid).toHaveBeenCalledTimes(1);
    stop();
  });

  test('connection lost: says so, retries, and waits longer each time', () => {
    jest.spyOn(Math, 'random').mockReturnValue(1); // no random part
    const h = handlers();
    const stop = connectLiveBids('ws://x', h);
    latest().onclose?.();
    expect(h.onDown).toHaveBeenCalledTimes(1);
    expect(FakeSocket.all).toHaveLength(1);
    jest.advanceTimersByTime(1000);
    expect(FakeSocket.all).toHaveLength(2);
    latest().onclose?.();
    jest.advanceTimersByTime(1000);
    expect(FakeSocket.all).toHaveLength(2);
    jest.advanceTimersByTime(1000);
    expect(FakeSocket.all).toHaveLength(3);
    latest().up(); // success starts the waiting over
    latest().onclose?.();
    jest.advanceTimersByTime(1000);
    expect(FakeSocket.all).toHaveLength(4);
    stop();
    jest.restoreAllMocks();
  });

  test('a network that died silently is noticed', () => {
    const h = handlers();
    const stop = connectLiveBids('ws://x', h);
    const first = latest();
    first.up();
    jest.advanceTimersByTime(50_000);
    first.onmessage?.({ data: '{"type":"alive"}' }); // still fine
    jest.advanceTimersByTime(50_000);
    expect(h.onDown).not.toHaveBeenCalled();
    jest.advanceTimersByTime(30_000);
    expect(h.onDown).toHaveBeenCalledTimes(1);
    expect(first.closed).toBe(true);
    stop();
  });

  test('stopping closes it and nothing comes back', () => {
    const h = handlers();
    const stop = connectLiveBids('ws://x', h);
    const socket = latest();
    socket.up();
    stop();
    expect(socket.closed).toBe(true);
    jest.advanceTimersByTime(120_000);
    expect(FakeSocket.all).toHaveLength(1);
    expect(h.onDown).not.toHaveBeenCalled();
  });
});
