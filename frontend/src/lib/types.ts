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
export type ItemType = {
  id: string;
  name: Localized;
  /** Brands sellers pick from for this type (most popular first). */
  brands?: string[];
  /** Models per brand, where buyers search by model (phones, cars, …). */
  models?: Record<string, string[]>;
  /** Electronics a shop can test: listing one needs a test certificate. */
  requiresTestCertificate?: boolean;
};

/** A city a listing is in. Filters match on `id`, so they survive a language switch. */
/** A city or area. `governorate` lets it show as "البلقاء / السلط". */
export type Place = { id: string; name: Localized; governorate?: Localized };

/** A GPS fix on the phone. */
export type Position = { lat: number; lng: number };

/** An area from GET /cities: always has its governorate and a rough centre. */
export type City = Place & { governorate: Localized; lat: number; lng: number };

export type CategoryFilters = { types: ItemType[]; brands: string[] };

/**
 * Condition keys; labels and tag colors come from i18n and ConditionTag.
 * refurbished_* grades are only on brand-certified listings (Item.refurbished).
 */
export type Condition =
  | 'new'
  | 'excellent'
  | 'good'
  | 'loved'
  | 'refurbished_like_new'
  | 'refurbished_excellent'
  | 'refurbished_good';

export type SaleType = 'fixed' | 'auction';

export type Auction = {
  /** Epoch milliseconds. */
  endsAt: number;
  bidCount: number;
  incrementFils: number;
  /** Set once the auction has ended with bids: the highest bidder, who may check out. */
  winnerId?: string;
};

/** active = for sale; reserved = paid, waiting for delivery; sold = delivered. */
export type ListingStatus = 'active' | 'reserved' | 'sold';

/** A marketplace listing. */
export type Item = {
  id: string;
  category: CategoryId;
  title: Localized;
  /** Fixed price, or the current bid for auctions. Integer fils. */
  priceFils: number;
  /** Cover photo (the first of imageUrls). */
  imageUrl: string;
  /** Every photo, cover first. Missing on listings with a single photo. */
  imageUrls?: string[];
  condition: Condition;
  seller: Localized;
  /** The seller's user id: the app hides Buy / Offer / Bid on your own listings. */
  sellerId: string;
  /** What the seller wrote, as typed (one language), at least 10 words. */
  description: string;
  status: ListingStatus;
  brand?: string;
  /** e.g. "iPhone 14 Pro", "Camry"; free text, usually from ItemType.models. */
  model?: string;
  /** ItemType id within the category. */
  type: string;
  verified: boolean;
  location: Place;
  saleType: SaleType;
  auction?: Auction;
  /** Times the listing was opened; ranks "most viewed". Missing = 0. */
  views?: number;
  /**
   * Brand-certified refurbished, sold by the brand's official store (the
   * Certified Refurbished store). 0 months = brand-inspected, no warranty.
   */
  refurbished?: { warrantyMonths: number };
  /** The shop's test report, on phones and electronics (ItemType.requiresTestCertificate). */
  testCertificate?: TestCertificate;
};

/** A shop's test report that passed the server's check, as buyers see it. */
export type TestCertificate = {
  /** The photo of the stamped paper. */
  image: ImageSourcePropType;
  /** As read off the stamp / letterhead. */
  shopName: string;
  /** Epoch ms of the date printed on the report. */
  testedAt: number;
  /** As read off the report, e.g. ["256GB", "Battery 89%"]. */
  specs: string[];
};

/** Why the check turned a test certificate down (labels under `certificate.problem.*`). */
export type CertificateProblem =
  | 'unreadable'
  | 'no_stamp'
  | 'no_shop'
  | 'device_mismatch'
  | 'no_specs'
  | 'too_old'
  | 'already_used';

/** POST /test-certificates: the server read the photo (OCR) and checked it against the device. */
export type CertificateCheck = {
  /** Sent as testCertificateId when the listing is published. */
  id: string;
  status: 'passed' | 'failed';
  /** Empty when passed. */
  problems: CertificateProblem[];
  shopName?: string;
  testedAt?: number;
  /** Brand and model as written on the report. */
  device?: string;
  specs: string[];
};

export type AuthMethod = 'email' | 'google' | 'apple';

/** A saved payment card. Only the provider's reference + last 4 digits ever reach the app. */
export type PaymentCard = { brand: string; last4: string };

/** A signed-in account. Guests have no User (sessionStore.user is null). */
export type User = {
  id: string;
  name: string;
  email?: string;
  /** How the account was created. */
  method: AuthMethod;
  /** National ID checked with Sanad → Verified Seller badge, listings ranked first. */
  verified: boolean;
  /** Place id (amman, irbid, …). */
  cityId: string;
  avatarUrl: string;
  card?: PaymentCard;
  /** Couriers confirm deliveries with the buyer's PIN (Courier screen). */
  role?: 'courier';
  /** B15.8: the terms version this account accepted (asked again when it changes). */
  termsVersion?: string;
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
  | 'most_bids'
  | 'most_viewed';

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
  /** The Refurbished switch beside the format tabs. */
  refurbished: boolean;
  sort: BrowseSort;
  filters: ActiveFilters;
  query: string;
};

/**
 * pending: the seller answers (accept, counter, reject). countered: the buyer
 * answers the seller's counterAmountFils (accept or reject).
 */
export type OfferStatus = 'pending' | 'accepted' | 'countered' | 'rejected';

export type Offer = {
  id: string;
  itemId: string;
  itemTitle: Localized;
  itemImageUrl: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  /** The agreed price once accepted (a countered offer accepted at the counter amount). */
  amountFils: number;
  /** The seller's counter price while status is countered. */
  counterAmountFils?: number;
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
  /** The other person's user id (for Block and Report). */
  otherPartyId: string;
  otherPartyName: string;
  lastMessage: string;
  updatedAt: number;
  /** Messages from the other person this person hasn't read yet. */
  unreadCount: number;
};

export type OrderStatus =
  | 'awaiting_payment'
  | 'escrow_held'
  | 'completed'
  | 'refunded'
  /** The buyer cancelled before pickup (B15.3); the money went back. */
  | 'cancelled';

/** Why an order didn't simply arrive (B15.3–B15.4); reason ids in lib/deliveryProblems.ts. */
export type OrderProblem = { reason: string; note?: string; at: number };
export type DeliveryFailure = OrderProblem & { stage: 'pickup' | 'dropoff' };

/** Where the courier delivers. `phone` is a Jordanian mobile, e.g. 0791234567. */
export type DeliveryDetails = {
  name: string;
  phone: string;
  /** Area id from GET /cities. */
  cityId: string;
  /** Street, building, floor, landmark. */
  address: string;
  notes?: string;
};

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
  delivery: DeliveryDetails;
  /**
   * The bank's card check (3-D Secure) page, while status is still
   * awaiting_payment after POST /orders/:id/pay. The app opens it.
   */
  paymentUrl?: string;
  createdAt: number;
  /** When the courier confirmed delivery (escrow released). */
  deliveredAt?: number;
  /** The driver's progress, once one is assigned. */
  courierStatus?: CourierStatus;
  /** The buyer cancelled (B15.3). */
  cancel?: OrderProblem;
  /** The buyer's report at the door instead of the PIN (B15.4). */
  itemIssue?: OrderProblem;
  /** The driver couldn't finish, and why (B15.4). */
  deliveryFailed?: DeliveryFailure;
  refundedAt?: number;
  /** The seller's view (GET /me/sales): their money once delivered. */
  payout?: { status: 'pending' | 'paid' | 'failed'; amountFils: number };
};

/** The courier's progress: collect from the seller, then hand over with the buyer's PIN. */
export type CourierStatus = 'to_pickup' | 'picked_up' | 'delivered' | 'failed';

/** One of the courier's deliveries (GET /courier/deliveries). */
export type Delivery = {
  /** The order number, e.g. SA-123456. */
  orderId: string;
  status: CourierStatus;
  itemTitle: Localized;
  itemImageUrl: string;
  /** Where the courier collects it: given with the listing, copied onto the order (empty phone and address on older orders). */
  pickup: DeliveryDetails;
  /** The buyer's delivery details from the order. */
  dropoff: DeliveryDetails;
  assignedAt: number;
  pickedUpAt?: number;
  deliveredAt?: number;
  /** The buyer reported a problem with the item at the door (B15.4). */
  buyerIssue?: OrderProblem;
  /** This delivery was marked failed (B15.4). */
  failed?: DeliveryFailure;
};

/** One request for a page of listings (GET /listings). The server filters, sorts and pages. */
export type ListingQuery = {
  /** Free-text search. */
  q?: string;
  /** Fixed scope (category page); filters.category narrows further on Search/Auctions. */
  category?: CategoryId;
  format: ListingFormat;
  /** Certified refurbished listings only (the store, and the Refurbished switch). */
  refurbished?: boolean;
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
  /** Longest refurbished warranty in scope; missing when none is refurbished. */
  maxWarrantyMonths?: number;
};

export type ListingPage = {
  items: Item[];
  /** Opaque; pass back to get the next page. null = last page. */
  nextCursor: string | null;
  /** Matches for the whole query, all pages. */
  total: number;
  /** Matches per format with the same search, switch and filters (the format tabs). */
  counts: Record<ListingFormat, number>;
  /** Matches with the same search, format and filters: everything, and refurbished only. */
  refurbishedCounts: { all: number; refurbished: number };
  facets: ListingFacets;
};

/** Why something is reported (POST /reports). */
export type ReportReason =
  | 'scam'
  | 'prohibited'
  | 'offensive'
  | 'wrong_info'
  | 'other';

export type ReportTarget = { type: 'listing' | 'user'; id: string };

/** Someone the signed-in user blocked: their listings and chats are hidden. */
export type BlockedUser = { id: string; name: string };
