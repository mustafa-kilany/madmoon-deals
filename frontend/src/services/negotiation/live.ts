// Live connections (docs/API.md → Live updates). Auctions: each new bid arrives as it's saved and goes
// straight into the screen's cached data, with no request. Chats and support: a signed-in connection
// that only says what changed, so the app fetches it through the normal API and private messages
// never travel on it. No React Native imports here, so the speed check (and the tests) run this same code.

import type { QueryClient } from '@tanstack/react-query';
import type { Bid, Item } from '@/lib/types';
import { fromIso } from '../api/wire';

const RETRY_FIRST_MS = 1_000;
const RETRY_MAX_MS = 30_000;
/** The server says something every 25 s. Longer silence: the network died without telling us. */
const SILENCE_MS = 60_000;

/**
 * Any answer already on its way may have left before this bid, so it mustn't have the last word.
 * A poll is dropped. A first load is waited for instead: dropping it would leave the screen on its spinner.
 */
async function update<T>(
  client: QueryClient,
  queryKey: string[],
  change: (current: T) => T,
) {
  if (client.getQueryData(queryKey) === undefined)
    await client
      .getQueryCache()
      .find({ queryKey, exact: true })
      ?.promise?.catch(() => {});
  else await client.cancelQueries({ queryKey, exact: true });
  client.setQueryData<T>(queryKey, current =>
    current === undefined ? current : change(current),
  );
}

/** Puts a new bid on the screen: the price, the top of the list, and the end time if a late bid moved it. */
export async function applyLiveBid(
  client: QueryClient,
  bid: Bid,
  endsAt?: number,
) {
  await Promise.all([
    update<Item>(client, ['items', bid.itemId], item => {
      const higher = bid.amountFils > item.priceFils;
      const later =
        endsAt !== undefined &&
        !!item.auction &&
        endsAt > item.auction.endsAt;
      if (!higher && !later) return item;
      return {
        ...item,
        priceFils: higher ? bid.amountFils : item.priceFils,
        auction: item.auction && {
          ...item.auction,
          bidCount: item.auction.bidCount + (higher ? 1 : 0),
          endsAt: later ? endsAt : item.auction.endsAt,
        },
      };
    }),
    update<Bid[]>(client, ['bids', bid.itemId], bids =>
      bids.some(known => known.id === bid.id)
        ? bids
        : [bid, ...bids]
            .sort((x, y) => y.amountFils - x.amountFils)
            .slice(0, 100),
    ),
  ]);
}

export type AccountEvent =
  | { type: 'chat'; chatId: string }
  | { type: 'support' }
  | { type: 'notifications' };

/** Something changed for this person: fetch it now, instead of at the next poll. */
export function applyAccountEvent(client: QueryClient, event: AccountEvent) {
  if (event.type === 'support') {
    client.invalidateQueries({ queryKey: ['support'] });
    return;
  }
  if (event.type === 'notifications') {
    client.invalidateQueries({ queryKey: ['notifications'] });
    return;
  }
  // The list (last message, unread counts) and the conversation; an offer may have moved on too.
  client.invalidateQueries({ queryKey: ['chats'] });
  client.invalidateQueries({ queryKey: ['offers'] });
}

function parseBid(data: unknown): { bid: Bid; endsAt?: number } | undefined {
  try {
    const message = JSON.parse(String(data));
    const bid = message?.type === 'bid' ? message.bid : undefined;
    if (
      typeof bid?.id !== 'string' ||
      typeof bid.itemId !== 'string' ||
      typeof bid.bidderId !== 'string' ||
      typeof bid.bidderName !== 'string' ||
      typeof bid.amountFils !== 'number' ||
      typeof bid.createdAt !== 'string'
    )
      return undefined;
    const endsAt =
      typeof message.auctionEndsAt === 'string'
        ? fromIso(message.auctionEndsAt)
        : undefined;
    return {
      bid: { ...bid, createdAt: fromIso(bid.createdAt) },
      endsAt: Number.isNaN(endsAt) ? undefined : endsAt,
    };
  } catch {
    return undefined;
  }
}

function parseAccountEvent(data: unknown): AccountEvent | undefined {
  try {
    const message = JSON.parse(String(data));
    if (message?.type === 'support') return { type: 'support' };
    if (message?.type === 'notifications') return { type: 'notifications' };
    if (message?.type === 'chat' && typeof message.chatId === 'string')
      return { type: 'chat', chatId: message.chatId };
  } catch {
    /* not ours */
  }
  return undefined;
}

type ConnectionHandlers = {
  /** Connected. Things may have been missed before this: time to catch up. */
  onUp: () => void;
  /** Not connected: the screen goes back to polling quickly. */
  onDown: () => void;
};

/** Stays connected until stopped, retrying with a growing, random wait so a restart isn't a stampede. */
function connect(
  createSocket: () => WebSocket,
  onData: (data: unknown) => void,
  { onUp, onDown }: ConnectionHandlers,
) {
  let socket: WebSocket | undefined;
  let stopped = false;
  let tries = 0;
  let heardAt = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const detach = () => {
    if (!socket) return;
    socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
    socket.close();
    socket = undefined;
  };

  const lost = () => {
    detach();
    if (stopped) return;
    onDown();
    const wait = Math.min(RETRY_MAX_MS, RETRY_FIRST_MS * 2 ** tries++);
    retry = setTimeout(open, wait * (0.5 + Math.random() / 2));
  };

  const open = () => {
    socket = createSocket();
    socket.onopen = () => {
      tries = 0;
      heardAt = Date.now();
      onUp();
    };
    socket.onmessage = event => {
      heardAt = Date.now();
      onData(event.data);
    };
    socket.onerror = () => {}; // onclose follows
    socket.onclose = lost;
  };
  open();

  const watchdog = setInterval(() => {
    if (socket?.readyState === 1 && Date.now() - heardAt > SILENCE_MS) lost();
  }, SILENCE_MS / 4);

  return () => {
    stopped = true;
    clearTimeout(retry);
    clearInterval(watchdog);
    detach();
  };
}

/** One auction's new bids. Public: no log-in. */
export function connectLiveBids(
  url: string,
  {
    onBid,
    ...handlers
  }: ConnectionHandlers & { onBid: (bid: Bid, endsAt?: number) => void },
) {
  return connect(
    () => new WebSocket(url),
    data => {
      const parsed = parseBid(data);
      if (parsed) onBid(parsed.bid, parsed.endsAt);
    },
    handlers,
  );
}

/**
 * What changed for the signed-in person. `createSocket` sends the token in a header, never in the
 * address, where it would end up in logs.
 */
export function connectLiveAccount(
  createSocket: () => WebSocket,
  {
    onEvent,
    ...handlers
  }: ConnectionHandlers & { onEvent: (event: AccountEvent) => void },
) {
  return connect(
    createSocket,
    data => {
      const event = parseAccountEvent(data);
      if (event) onEvent(event);
    },
    handlers,
  );
}
