// The mock backend's shared marketplace state: one copy of the listings and
// bids for the catalog, negotiation and orders mocks (so a bid, a sale or a
// block shows up everywhere), and who is calling. Mock-only.

import { useSessionStore } from '@/features/auth/sessionStore';
import type { Bid, Item } from '@/lib/types';
import { ApiError } from '../api/errors';
import { buildItems } from './catalog';
import { buildRefurbishedItems } from './refurbished';

// Auction end times count from app launch, as in the prototype.
const startedAt = Date.now();
const seedItems = [
  ...buildItems(startedAt),
  ...buildRefurbishedItems(startedAt),
];

/** Listings published in this session, newest first. */
export const userListings: Item[] = [];

/** Bids per listing, oldest first. The mobiles demo auction has a history. */
export const bids: Record<string, Bid[]> = {
  'auction-mobiles': [
    {
      id: 'bid-1',
      itemId: 'auction-mobiles',
      bidderId: 'user-omar',
      bidderName: 'Omar',
      amountFils: 440000,
      createdAt: Date.now() - 3600000,
    },
    {
      id: 'bid-2',
      itemId: 'auction-mobiles',
      bidderId: 'user-sami',
      bidderName: 'Sami',
      amountFils: 450000,
      createdAt: Date.now() - 1800000,
    },
  ],
};

/** Users the caller blocked: id → name. */
export const blocked = new Map<string, string>();

export const allItems = () => [...userListings, ...seedItems];

/** The stored listing (mutable), or NOT_FOUND. */
export function findItem(id: string): Item {
  const item = allItems().find(i => i.id === id);
  if (!item) throw new ApiError('NOT_FOUND', 'Listing not found', 404);
  return item;
}

/** Who is calling. A real server reads this from the bearer token. */
export function me(): { id: string; name: string } {
  const user = useSessionStore.getState().user;
  return user
    ? { id: user.id, name: user.name }
    : { id: 'user-demo', name: 'Ahmad' };
}

/** A copy as the API returns it: an ended auction names its highest bidder. */
export function publicItem(item: Item, now = Date.now()): Item {
  if (!item.auction) return { ...item };
  const history = bids[item.id] ?? [];
  const winnerId =
    item.auction.endsAt <= now
      ? history[history.length - 1]?.bidderId
      : undefined;
  return { ...item, auction: { ...item.auction, winnerId } };
}

let sequence = 0;
/** Unique ids even within the same millisecond. */
export const nextId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${(sequence++).toString(36)}`;
