// Shared domain types. Ported from the prototype's lib/types.ts, with two
// changes: catalog text is stored in both languages (`Localized`) instead of
// being translated at creation time, and money is integer fils (1 JOD = 1000).

import type { ImageSourcePropType } from 'react-native';
import type { IconName } from '@/components/icons';

export type Lang = 'ar' | 'en';

/** Catalog text that comes with the data (titles, names), in both languages. */
export type Localized = { ar: string; en: string };

export type CategoryId =
  | 'mobiles'
  | 'electronics'
  | 'vehicles'
  | 'furniture'
  | 'appliances'
  | 'fashion'
  | 'kids'
  | 'hobbies';

export type Category = {
  id: CategoryId;
  name: Localized;
  /** Square product photo used as the category tile (bundled). */
  image: ImageSourcePropType;
  /** Line icon shown if the image fails to load. */
  icon: IconName;
};

/** A sub-type within a category (e.g. Phones under Tech), used for filtering. */
export type ItemType = { id: string; name: Localized };

/** A city a listing is in. Filters match on `id`, so they survive a language switch. */
/** A city or area. `governorate` lets it show as "البلقاء / السلط". */
export type Place = { id: string; name: Localized; governorate?: Localized };

/** An area from GET /cities: always has its governorate and a rough centre. */
export type City = Place & { governorate: Localized; lat: number; lng: number };

export type CategoryFilters = { types: ItemType[]; brands: string[] };

/** Condition keys; labels and tag colors come from i18n and ConditionTag. */
export type Condition = 'new' | 'excellent' | 'good' | 'loved';

export type SaleType = 'fixed' | 'auction';

export type Auction = {
  /** Epoch milliseconds. */
  endsAt: number;
  bidCount: number;
  incrementFils: number;
};

/** A marketplace listing. */
export type Item = {
  id: string;
  category: CategoryId;
  title: Localized;
  /** Fixed price, or the current bid for auctions. Integer fils. */
  priceFils: number;
  imageUrl: string;
  condition: Condition;
  seller: Localized;
  brand?: string;
  /** ItemType id within the category. */
  type: string;
  verified: boolean;
  location: Place;
  saleType: SaleType;
  auction?: Auction;
};

export type AuthMethod = 'email' | 'id' | 'google' | 'apple';

/** A saved payment card. Only the provider's reference + last 4 digits ever reach the app. */
export type PaymentCard = { brand: string; last4: string };

/** A signed-in account. Guests have no User (sessionStore.user is null). */
export type User = {
  id: string;
  name: string;
  email?: string;
  /** How the account was created; ID sign-ups start verified. */
  method: AuthMethod;
  /** National ID checked → Verified Seller badge, listings ranked first. */
  verified: boolean;
  /** Place id (amman, irbid, …). */
  cityId: string;
  avatarUrl: string;
  card?: PaymentCard;
  /** Couriers confirm deliveries with the buyer's PIN (Courier screen). */
  role?: 'courier';
};

export type Session = { token: string; user: User };

/** A photo taken or picked on the device, ready to upload. */
export type LocalPhoto = { uri: string; mimeType: string; fileName: string };

/** Fixed price, auction, or both — the All / Buy now / Auctions tabs. */
export type ListingFormat = 'all' | SaleType;

export type BrowseSort =
  | 'recommended'
  | 'ending_soon'
  | 'price_asc'
  | 'price_desc'
  | 'most_bids';

/**
 * Filter selections. Values are ids (type id, brand, Condition, Place id), so
 * they don't depend on the language. Prices are what the user typed, in JOD.
 */
export type ActiveFilters = {
  category: CategoryId | '';
  types: string[];
  brands: string[];
  conditions: Condition[];
  locations: string[];
  min: string;
  max: string;
  verifiedOnly: boolean;
  endingSoon: boolean;
};

export type BrowseState = {
  format: ListingFormat;
  sort: BrowseSort;
  filters: ActiveFilters;
  query: string;
};

export type OfferStatus = 'pending' | 'accepted' | 'countered' | 'rejected';

export type Offer = {
  id: string;
  itemId: string;
  itemTitle: Localized;
  itemImageUrl: string;
  buyerId: string;
  buyerName: string;
  sellerName: string;
  amountFils: number;
  status: OfferStatus;
  createdAt: number;
};

export type Bid = {
  id: string;
  itemId: string;
  bidderId: string;
  bidderName: string;
  amountFils: number;
  createdAt: number;
};

export type ChatMessage = {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  text: string;
  offer?: Offer;
  createdAt: number;
};

export type ChatThread = {
  id: string;
  itemId: string;
  itemTitle: Localized;
  itemImageUrl: string;
  otherPartyName: string;
  lastMessage: string;
  updatedAt: number;
};

export type OrderStatus =
  | 'awaiting_payment'
  | 'escrow_held'
  | 'completed'
  | 'refunded';

/** A purchase. Amounts are computed by the server (mock: calculateCheckoutBreakdown). */
export type Order = {
  id: string;
  itemId: string;
  itemTitle: Localized;
  itemImageUrl: string;
  itemPriceFils: number;
  buyerProtectionFils: number;
  deliveryFils: number;
  totalFils: number;
  status: OrderStatus;
  /** Delivery PIN the buyer gives the courier; only present once the payment is held. */
  pin?: string;
  /** Set when the checkout price came from an accepted offer. */
  offerId?: string;
  createdAt: number;
  /** When the courier confirmed delivery (escrow released). */
  deliveredAt?: number;
};

/** One request for a page of listings (GET /listings). The server filters, sorts and pages. */
export type ListingQuery = {
  /** Free-text search. */
  q?: string;
  /** Fixed scope (category page); filters.category narrows further on Search/Auctions. */
  category?: CategoryId;
  format: ListingFormat;
  filters: ActiveFilters;
  sort: BrowseSort;
  /** Fetch exactly these listings (Saved, recently viewed); ignores paging. */
  ids?: string[];
};

/** Filter options that exist among the listings in scope (before filters apply). */
export type ListingFacets = {
  categories: CategoryId[];
  conditions: Condition[];
  cities: Place[];
  /** Types and brands per category, so the sheet follows the chosen category. */
  byCategory: Partial<
    Record<CategoryId, { types: string[]; brands: string[] }>
  >;
};

export type ListingPage = {
  items: Item[];
  /** Opaque; pass back to get the next page. null = last page. */
  nextCursor: string | null;
  /** Matches for the whole query, all pages. */
  total: number;
  /** Matches per format with the same search and filters (the format tabs). */
  counts: Record<ListingFormat, number>;
  facets: ListingFacets;
};
