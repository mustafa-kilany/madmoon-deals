// The live auction connection (docs/API.md → Live updates): each new bid arrives as it's saved and
// goes straight into the screen's cached data, with no request. No React Native imports here, so
// the speed check (and the tests) run this same code.

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

/** Puts a new bid on the screen: the price and the top of the list. */
export async function applyLiveBid(client: QueryClient, bid: Bid) {
  await Promise.all([
    update<Item>(client, ['items', bid.itemId], item =>
      bid.amountFils <= item.priceFils
        ? item
        : {
            ...item,
            priceFils: bid.amountFils,
            auction: item.auction && {
              ...item.auction,
              bidCount: item.auction.bidCount + 1,
            },
          },
    ),
    update<Bid[]>(client, ['bids', bid.itemId], bids =>
      bids.some(known => known.id === bid.id)
        ? bids
        : [bid, ...bids]
            .sort((x, y) => y.amountFils - x.amountFils)
            .slice(0, 100),
    ),
  ]);
}

function parseBid(data: unknown): Bid | undefined {
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
    return { ...bid, createdAt: fromIso(bid.createdAt) };
  } catch {
    return undefined;
  }
}

type LiveHandlers = {
  onBid: (bid: Bid) => void;
  /** Connected. Bids may have been missed before this: time to catch up. */
  onUp: () => void;
  /** Not connected: the screen goes back to polling quickly. */
  onDown: () => void;
};

/** Stays connected until stopped, retrying with a growing, random wait so a restart isn't a stampede. */
export function connectLiveBids(
  url: string,
  { onBid, onUp, onDown }: LiveHandlers,
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
    socket = new WebSocket(url);
    socket.onopen = () => {
      tries = 0;
      heardAt = Date.now();
      onUp();
    };
    socket.onmessage = event => {
      heardAt = Date.now();
      const bid = parseBid(event.data);
      if (bid) onBid(bid);
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
