# Sahla API Contract & Connection Guide

This document defines the REST API contract expected by the **Sahla** mobile application, as well as instructions for connecting the app to a live backend service.

The app's HTTP service layer (`src/services/*/http.ts`) and API client (`src/services/api/client.ts`) are fully implemented and integrated. Connecting to a real API server requires only a configuration update in `src/config.ts`.

## Changes on 2026-10-23 (backend: please read)

* `Item` has `views` (times the listing was opened). `GET /listings` takes `sort=most_viewed`.
* New endpoint `POST /listings/:id/views`: the app calls it each time someone opens a listing.
* The product page asks `GET /listings` for similar items: same `category` and `types`, with
  `minPrice` / `maxPrice` at ±30% of the price; the auction page uses `sort=most_viewed` instead
  of a price range.

## Changes on 2026-10-21 (backend: please read)

**Breaking**
* Sign-up proves the email first: `POST /auth/send-otp` emails a code, then `POST /auth/signup` takes `code` with name, email and password. **`POST /auth/verify-otp` is removed.**
* `POST /orders` requires `delivery` (name, Jordanian mobile, area, address). `Order` has `delivery`.
* `Item` has `sellerId`, `status` (`active` / `reserved` / `sold`) and optional `description`. `Offer` has `sellerId` and `counterAmountFils`. `ChatThread` has `otherPartyId`.

**New endpoints**
* `POST /auth/forgot-password`, `POST /auth/reset-password`: password reset by emailed code.
* `DELETE /me`: account deletion (the App Store rejects apps without it).
* `POST /reports`, `POST /me/blocked`, `GET /me/blocked`, `DELETE /me/blocked/:userId`: report and block (the App Store requires these for apps with user content and chat).

**New rules**
* Who may answer an offer (seller for `pending`, buyer for `countered`), nobody bids on / offers for / buys their own listing, a listing sells once, an ended auction sells only to its winner (`auction.winnerId`).
* Payment may need the bank's card check (3-D Secure): `Order.paymentUrl`.
* New error codes: `FORBIDDEN` (403), `ITEM_UNAVAILABLE` (409), `INVALID_CODE` (422), `OPEN_ORDERS` (409).

---

## Connecting the Mobile App to the Backend

### 1. Update `src/config.ts`

Open [`src/config.ts`](file:///C:/Users/mustafa/Desktop/Sahla/Sahla/src/config.ts) and set `apiBaseUrl` and toggles for `mock`:

```ts
export const config = {
  /** Debug builds → local server; release builds → the production API. */
  apiBaseUrl: __DEV__ ? 'http://10.0.2.2:4000/v1' : 'https://api.sahla.jo/v1',

  /** true = in-app mock data; false = the real HTTP endpoints below. */
  mock: {
    catalog: true,      // /categories, /cities, /listings, /uploads/listing-photo
    auth: false,        // /auth/*, /me/*
    negotiation: true,  // /offers, /listings/:id/bids, /chats, /reports, /me/blocked
    orders: true,       // /orders, /me/orders, /courier/*
  },

  requestTimeoutMs: 15_000,
  uploadTimeoutMs: 60_000,
  pollMs: { auction: 3_000, chat: 5_000, orders: 15_000 }, // see "Live updates"
} as const;
```

> [!IMPORTANT]
> **Backend developer:** send the production base URL (`https://…/v1`) to the app developer. Each
> service is switched to `false` when its endpoints are live, one at a time.

> [!NOTE]
> * **Android Emulator Host Loopback:** Use `http://10.0.2.2:<port>/v1` to point to a server running locally on your development PC.
> * **iOS Simulator Host Loopback:** Use `http://localhost:<port>/v1`.
> * **Gradual Integration:** Each of `catalog`, `auth`, `negotiation`, `orders` switches on its own.
> * **Every endpoint below is checked by `__tests__/httpContract.test.ts`:** it records the exact
>   method, path and body the app sends, and fails if an endpoint the app calls is missing here.

---

### 2. How the App Handles Requests & Authentication

* **Headers & Content-Type:**
  * Standard JSON endpoints automatically include `Accept: application/json` and `Content-Type: application/json`.
  * Upload endpoints (e.g. `idPhoto`, `avatar`) use `FormData` (`multipart/form-data`). The client automatically lets the platform set the correct boundary header.
* **Authentication Tokens:**
  * When signed in, the app keeps the bearer token in the device keychain (iOS Keychain / Android Keystore) via [`tokenStorage`](file:///C:/Users/mustafa/Desktop/Sahla/Sahla/src/services/api/tokenStorage.ts). Tokens should be long-lived (e.g. 30–90 days) and revoked by `POST /auth/logout`; the app has no refresh-token flow, so an expired token simply signs the user out.
  * Every outgoing HTTP request automatically appends the header:
    `Authorization: Bearer <token>`
* **Automatic Sign-Out on Expired/Invalid Tokens (401):**
  * If the API returns HTTP `401 Unauthorized` for an authenticated request, the app catches it, clears the local token and session store, and redirects the user to the guest state automatically.

---

## Conventions & Data Types

| Topic | Rule |
|---|---|
| **Format** | JSON, UTF-8 encoded. File uploads are `multipart/form-data`. |
| **Authentication** | `Authorization: Bearer <token>` header on authenticated endpoints. |
| **Money / Currency** | Integers in **fils** (1 JOD = 1000 fils). Never use floating point or decimals. Field names end with `Fils` (e.g. `priceFils`, `incrementFils`). |
| **Localized Strings** | Dual-language catalog fields use `{ "ar": "...", "en": "..." }` (`Localized`). |
| **Category IDs** | Fixed set: `mobiles`, `electronics`, `vehicles`, `furniture`, `appliances`, `fashion`, `kids`, `hobbies`. Item types per category come from `GET /categories/filters` (e.g. gaming is a type under `electronics`, watches under `fashion`). |
| **Timestamps** | ISO-8601 UTC strings (e.g. `"2026-10-19T12:00:00Z"`) in both directions: every `createdAt`, `updatedAt`, `deliveredAt`, `endsAt`, `auctionEndsAt`. The app converts them (`src/services/api/wire.ts`). |
| **Errors** | Non-2xx responses return `{ "error": { "code": "ERROR_CODE", "message": "..." } }`. |

### Error Codes Standard

| Code | HTTP Status | Description |
|---|---|---|
| `VALIDATION` | 400 / 422 | Bad parameters or missing required fields |
| `UNAUTHORIZED` | 401 | Missing, invalid, or expired authentication token |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password during login |
| `NOT_FOUND` | 404 | Resource with the specified ID does not exist |
| `FORBIDDEN` | 403 | Signed in, but not allowed: e.g. answering an offer when it's not your turn, bidding on your own auction, confirming a delivery without the courier role |
| `EMAIL_TAKEN` | 409 | Attempting sign-up with an already registered email |
| `ITEM_UNAVAILABLE` | 409 | The listing is reserved, sold, from a blocked user, or an auction you didn't win |
| `OPEN_ORDERS` | 409 | Account deletion while orders are in escrow (as buyer or seller) |
| `INVALID_PIN` | 422 | Courier typed the wrong delivery PIN (nothing is released) |
| `INVALID_CODE` | 422 | Wrong or expired emailed code (sign-up, password reset) |

Any other code is shown to the user as a generic error, so new codes need an app update to get their own message.

Only `401` signs the user out. Use `403 FORBIDDEN` (never 401) when a signed-in user isn't allowed to do something.

---

## Accounts & Authentication Endpoints

### Data Models

```ts
type Session = {
  token: string;
  user: User;
};

type User = {
  id: string;
  name: string;
  email?: string;
  method: 'email' | 'google' | 'apple';
  verified: boolean; // true after POST /me/id-verification is approved
  cityId: string;    // an area id from GET /cities, e.g. 'salt', 'amman-khalda'
  avatarUrl: string;
  card?: { brand: string; last4: string };
  role?: 'courier';  // courier accounts only
};
```

### Endpoints Specification

#### 1. `POST /auth/signup`
Creates a new account. The app first calls `POST /auth/send-otp`; the user types the emailed code here, which proves they own the address.
* **Request Body:** `{ "name": "Ahmad", "email": "ahmad@sahla.jo", "password": "password123", "code": "482913" }`
* **Rules:** name ≥ 2 characters, password ≥ 8 characters, email stored lower-cased. Check `EMAIL_TAKEN` and `VALIDATION` before the code.
* **Response (200 or 201):** `Session`
* **Errors:** `EMAIL_TAKEN` (409), `VALIDATION` (422), `INVALID_CODE` (422)

#### 2. `POST /auth/login`
Authenticates an existing user.
* **Request Body:** `{ "email": "ahmad@sahla.jo", "password": "password123" }`
* **Response (200):** `Session`
* **Errors:** `INVALID_CREDENTIALS` (401), `VALIDATION` (400/422)

#### 3. `POST /auth/google`
Authenticates or registers a user via Google OAuth ID token.
* **Request Body:** `{ "idToken": "google_oauth_token" }`. The server **must verify** the token with Google (signature, audience = Sahla's client ID, expiry) and take the email from it, never from the request.
* **Response (200):** `Session`

#### 4. `POST /auth/apple`
Authenticates or registers a user via Apple Sign-In identity token.
* **Request Body:** `{ "idToken": "apple_identity_token" }`. Verify it with Apple's public keys the same way. Apple may hide the user's email (relay address); that's still a valid account.
* **Response (200):** `Session`

#### 5. `POST /auth/send-otp`
Emails a 6-digit code to a **new** address, before sign-up.
* **Request Body:** `{ "email": "user@sahla.jo" }`
* **Response:** 204 No Content
* **Errors:** `EMAIL_TAKEN` (409), `VALIDATION` (422)
* **Codes (also for password reset):** random 6 digits, valid ~10 minutes, ~5 wrong tries then a new code is needed, resend at most once a minute per email.

#### 6. `POST /auth/forgot-password`
Emails a 6-digit reset code if the address has an account.
* **Request Body:** `{ "email": "user@sahla.jo" }`
* **Response:** 204 No Content, **whether or not the account exists** (so it can't be used to find out who uses Sahla).

#### 7. `POST /auth/reset-password`
Sets a new password with the emailed code and signs in.
* **Request Body:** `{ "email": "user@sahla.jo", "code": "482913", "password": "newpassword" }`
* **Response (200):** `Session`. Revoke the account's other sessions (the old password may have leaked).
* **Errors:** `INVALID_CODE` (422, also when there is no such account), `VALIDATION` (422)

#### 8. `POST /auth/logout` *(Authenticated)*
Revokes the session token on the server.
* **Headers:** `Authorization: Bearer <token>`
* **Response:** 204 No Content

#### 9. `GET /me` *(Authenticated)*
Fetches the currently authenticated user profile.
* **Response (200):** `User`
* **Errors:** `UNAUTHORIZED` (401)

#### 10. `PATCH /me` *(Authenticated)*
Updates user profile settings (name or city).
* **Request Body:** `{ "name"?: "Ahmad", "cityId"?: "amman" }`
* **Response (200):** `User`

#### 11. `POST /me/avatar` *(Authenticated)*
Uploads a new profile picture.
* **Request Body:** `multipart/form-data` with field `avatar` (JPEG/PNG up to 10MB)
* **Response (200):** `User` (with updated `avatarUrl`)

#### 12. `POST /me/id-verification` *(Authenticated)*
Submits a national ID document to earn the Verified badge. Accounts are created with email (or Google/Apple) only; ID verification happens afterwards.
* **Request Body:** `multipart/form-data` with field `idPhoto`
* **Response (200):** `User` (`verified: true`)

#### 13. `POST /me/payment-card` *(Authenticated)*
Attaches a saved card reference using a payment token generated by the payment provider's mobile SDK. Raw card numbers are never sent to Sahla servers.
* **Request Body:** `{ "cardToken": "provider_token_xyz" }`
* **Response (200):** `User` (with updated `card: { brand, last4 }`)

#### 14. `DELETE /me/payment-card` *(Authenticated)*
Removes the saved payment card reference.
* **Response (200):** `User` (`card` removed)

#### 15. `DELETE /me` *(Authenticated)*
Deletes the account (Profile → Delete account). **Required by the App Store** (guideline 5.1.1(v)) for any app where people create accounts.
* **Response:** 204 No Content. The app then signs out locally.
* **Server:** revoke all sessions; remove or anonymise the profile, avatar, ID photo, saved card reference, active listings, push tokens and blocks; keep only what the law requires (e.g. completed payment records). The email can sign up again afterwards.
* **Errors:** `OPEN_ORDERS` (409) while any order is `escrow_held` with this user as buyer or seller.

---

## Catalog & Listings Endpoints

### Data Models

```ts
type Localized = { ar: string; en: string };

type Category = {
  id: string; // 'mobiles', 'electronics', 'vehicles', etc.
  name: Localized;
  icon: string; // 'Shirt', 'Laptop', 'Car', etc.
  imageUrl: string;
};

type Item = {
  id: string;
  category: string;
  title: Localized;
  priceFils: number; // Integer fils; for auctions, the current highest bid
  imageUrl: string;    // cover photo: a ~400×400 thumbnail (cards, lists)
                       // — never the full-size upload; it's shown 2 per row
  imageUrls?: string[]; // every photo, cover first, full size (≤1200 px, product page)
  condition: 'new' | 'excellent' | 'good' | 'loved';
  seller: Localized;
  sellerId: string;  // the app hides Buy / Offer / Bid on the user's own listings
  description?: string; // as the seller typed it (one language), max 2000 chars
  status: 'active' | 'reserved' | 'sold'; // reserved = paid, waiting for delivery
  brand?: string;
  model?: string;    // e.g. "iPhone 14 Pro", "Camry" (usually from types[].models)
  type: string;
  verified: boolean;
  location: { id: string; name: Localized; governorate: Localized };
  saleType: 'fixed' | 'auction';
  auction?: {
    endsAt: string; // ISO-8601 UTC date
    bidCount: number;
    incrementFils: number;
    winnerId?: string; // once ended with bids: the highest bidder
  };
  views: number; // times the listing was opened (POST /listings/:id/views)
};
```

**Listing status:** `active` until an order for it is paid (`escrow_held`) → `reserved`; the courier
confirms delivery → `sold`; a refund puts it back to `active`. Auctions stay `active` after they end
until the winner pays.

### Endpoints Specification

#### 1. `GET /categories`
Returns all marketplace root categories.
* **Response (200):** `Category[]`

#### 2. `GET /categories/filters`
Item types per category, each with the brands sellers pick from and, where buyers search by
model, the models per brand. Feeds the filter sheet and the Add Listing brand / model pickers.
The app's seed copy is `src/services/mock/brands.ts` (~400 brands, ~1,000 models, popular in
Jordan first; models newest first).
* **Response (200):**
  ```ts
  {
    [categoryId]: {
      types: {
        id: string;
        name: Localized;
        brands?: string[];                   // most popular first; [] or missing = no brand picker
        models?: { [brand: string]: string[] }; // phones, tablets, laptops, consoles, cameras, cars, …
      }[];
      brands: string[];                      // every type's brands, de-duplicated
    }
  }
  ```
* Brands and models are suggestions, not a closed list: a seller may type one that isn't listed,
  so `POST /listings` accepts any `brand` / `model` string (trim it, max ~60 chars).

#### 3. `GET /cities`
Every area a listing or account can be in: Jordan's 12 governorates and their main cities /
cities and towns, and the neighbourhoods of Amman, Irbid, Zarqa and Aqaba. The app's seed copy
is `src/services/mock/places.ts` (170 areas). Ids are stable: add areas, never rename or reuse
an id (listings and accounts store them).
* **Response (200):**
  ```json
  [{ "id": "salt", "name": { "ar": "السلط", "en": "Salt" },
     "governorate": { "ar": "البلقاء", "en": "Balqa" }, "lat": 32.039, "lng": 35.727 }]
  ```
  The app shows it as **"البلقاء / السلط"** (just "إربد" when the area is the governorate's capital).
  `lat`/`lng` are the area's rough centre.
* **Location privacy:** "Use my current location" and the "Near me" filter run **on the phone**:
  GPS → nearest area(s) using these centres. The app only ever sends **area ids** (`cityId`,
  `locationId`, `cities=` filter), never coordinates or streets, so the backend doesn't need to
  store locations.
* `Item.location` is a `Place` with `governorate` (no `lat`/`lng`): `{ id, name, governorate }`.

#### 4. `GET /listings` — search, filter, sort, paginate
The app never downloads the whole catalog. Every browsing screen (Search, Category, Auctions,
Home's featured auction, Product's similar items, Saved) asks for **one page** at a time and asks
for the next page when the user scrolls near the end (infinite scroll). **Searching, filtering,
sorting and counting all happen on the server.** The mock backend's reference implementation is
`queryListings()` in `src/lib/browsing.ts`; the app builds the query string in
`listingParams()` (`src/services/catalog/http.ts`).

**Query parameters** (all optional; lists are comma-separated):

| Param | Example | Meaning |
|---|---|---|
| `q` | `iphone 14` | Free text. Every word must match title (ar or en), brand, model or type name (ar or en). Server should normalise Arabic (أ/إ/آ→ا, ة→ه, ى→ي, strip tashkeel) and may add typo tolerance. |
| `category` | `mobiles` | One category id. |
| `format` | `fixed` \| `auction` | Omit for all. Ended auctions are never returned. |
| `types` | `phones,laptops` | Item type ids. |
| `brands` | `Apple,Samsung` | Brand names. |
| `conditions` | `new,excellent` | |
| `cities` | `amman,irbid` | Location ids. |
| `minPrice` / `maxPrice` | `10000` | **Integer fils**, inclusive. |
| `verifiedOnly` | `true` | Verified sellers only. |
| `endingSoon` | `true` | Auctions ending within 24 h. |
| `sort` | `recommended` | `recommended` (verified sellers first, then relevance), `price_asc`, `price_desc`, `ending_soon`, `most_bids`, `most_viewed`. |
| `cursor` | `eyJvZmZzZXQiOjIwfQ` | Opaque value from the previous page's `nextCursor`. |
| `limit` | `20` | Page size, default 20, max 50. |
| `ids` | `mobiles-0,mobiles-1` | Fetch exactly these listings, in this order (Saved, recently viewed). Other params ignored; missing ids are skipped; reserved and sold listings **are** returned (with their `status`). |

Without `ids`, only `active` listings are returned, and never listings from users the caller blocked (or who blocked the caller).

**Response (200):**
```ts
{
  items: Item[];               // this page only
  nextCursor: string | null;   // null = last page
  total: number;               // matches for the whole query
  counts: { all: number; fixed: number; auction: number }; // same filters, per format (tabs)
  facets: {                    // options that exist in scope, before filters (Filters sheet)
    categories: string[];
    conditions: Condition[];
    cities: { id: string; name: Localized }[];
    byCategory: { [categoryId]: { types: string[]; brands: string[] } };
  };
}
```

* **Errors:** `VALIDATION` (422) for a bad `sort`, `minPrice > maxPrice`, unknown `cursor`.
* **Backend notes:** use cursor (keyset) pagination, not page numbers, so new listings don't
  shift pages while scrolling. Index the filter columns (`category`, `sale_type`, `price_fils`,
  `city_id`, `verified`, `auction_ends_at`). Full-text search: Postgres `tsvector` + `pg_trgm`
  is enough to start; Meilisearch / Typesense / Elasticsearch when typo tolerance and ranking
  matter. `counts` and `facets` can be cached briefly per query; they don't change per page.

#### 5. `GET /listings/:id`
Returns a single item's detailed view.
* **Response (200):** `Item`
* **Errors:** `NOT_FOUND` (404)

#### 5b. `POST /listings/:id/views`
Counts one view; the app calls it when someone opens the listing (not on the auction page's
3-second refresh). No body, signed in or not. Counting each device once a day is up to the server.
* **Response (204)**
* **Errors:** `NOT_FOUND` (404)

#### 6. `GET /me/listings` *(Authenticated)*
Returns all listings created by the signed-in user, every status, newest first.
* **Response (200):** `Item[]`

---

## Endpoints Specification for Subsequent Phases

### Phase 4: Selling (Create & Manage Listings)

Publishing a listing is two steps: the app uploads each photo (up to 5, in parallel), then creates
the listing with the returned URLs.

* **`POST /uploads/listing-photo` *(Authenticated)***
  * **Request:** `multipart/form-data` with one field `photo` (JPEG/PNG/WebP, up to 10 MB).
  * **Response (201):** `{ "url": "https://cdn.sahla.jo/listings/…jpg" }` — a public URL the app can show.
  * **Backend notes:** check the real file type from its bytes, not the name; strip EXIF (it can
    contain the seller's GPS position); resize (e.g. 1600 px long side) and serve from a CDN.
    Uploads that no listing uses within ~24 h can be deleted.
* **`POST /listings` *(Authenticated)***
  * **Request (JSON):** `category`, `titleAr`, `titleEn`, `priceFils`, `imageUrls` (1–5 URLs from the upload above, cover first), `condition`, `description?` (max 2000 characters), `brand?`, `model?`, `type`, `locationId` (area id), `saleType` (`fixed` or `auction`), `auctionEndsAt?` (ISO-8601), `incrementFils?`.
  * The seller is the caller: set `sellerId` and `seller` from the token, `status: "active"`.
  * Only accept `imageUrls` that this server issued. For auctions, `priceFils` is the starting bid.
  * **Response (201):** `Item`
* **`PATCH /listings/:id` *(Authenticated)***
  * **Request:** `{ "priceFils"?: 50000, "condition"?: "excellent" }`
  * **Response (200):** `Item`
* **`DELETE /listings/:id` *(Authenticated)***
  * **Response:** 204 No Content

### Phase 5: Negotiation, Chat & Auction Bids

```ts
type Offer = {
  id: string;
  itemId: string;
  itemTitle: Localized;
  itemImageUrl: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  amountFils: number;         // the buyer's offer; once accepted, the agreed price
  counterAmountFils?: number; // the seller's counter price (status countered)
  status: 'pending' | 'accepted' | 'countered' | 'rejected';
  createdAt: string; // ISO-8601
};

type Bid = {
  id: string;
  itemId: string;
  bidderId: string;
  bidderName: string;
  amountFils: number;
  createdAt: string;
};

type ChatThread = {
  id: string;
  itemId: string;
  itemTitle: Localized;
  itemImageUrl: string;
  otherPartyId: string;   // for Block and Report
  otherPartyName: string; // the seller for the buyer, and the buyer for the seller
  lastMessage: string;
  updatedAt: string;
};

type ChatMessage = {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  text: string;
  offer?: Offer; // on messages about an offer: the offer's CURRENT state
  createdAt: string;
};
```

Lists are newest first except `GET /chats/:id/messages` (oldest first, like a conversation).

**Offer flow.** One chat per buyer and listing. Each step also posts a message (with `offer`) in that chat:
1. Buyer: `POST /listings/:id/offers` → `pending`.
2. Seller answers a `pending` offer: `accepted`, `rejected`, or `countered` with `counterAmountFils` (above the offer).
3. Buyer answers a `countered` offer: `accepted` (then `amountFils` becomes `counterAmountFils`) or `rejected`. To go lower again, the buyer makes a new offer.
4. Only the buyer of an `accepted` offer can check out with it (`POST /orders` with `offerId`).

Anyone else answering, or answering out of turn: `FORBIDDEN` (403). Answering a finished offer: `VALIDATION` (422).

* **`GET /chats` *(Authenticated)*** → `ChatThread[]`
* **`GET /chats/:id/messages` *(Authenticated)*** → `ChatMessage[]`, the latest 50 (oldest first). Older ones: `?before=<messageId>&limit=50` (the app doesn't page back yet).
* **`POST /chats/:id/messages` *(Authenticated)*** → Body: `{ "text": "Is this still available?" }` → `ChatMessage`
* **`POST /listings/:id/offers` *(Authenticated)*** → Body: `{ "amountFils": 450000 }` → `{ "offer": Offer, "chatId": "..." }`. Fixed-price `active` listings only (`ITEM_UNAVAILABLE` otherwise); not your own (`FORBIDDEN`).
* **`POST /offers/:id/respond` *(Authenticated, seller)*** → Body: `{ "status": "accepted" | "countered" | "rejected", "counterAmountFils"?: 480000 }` → `Offer`
* **`POST /listings/:id/bids` *(Authenticated)*** → Body: `{ "amountFils": 530000 }` → `Bid` (the item's `priceFils` and `bidCount` update; refetch the item)
  * `VALIDATION` (422) if `amountFils` < current bid + `incrementFils` or the auction has ended; `FORBIDDEN` (403) if the bidder is the seller. Check and update in one transaction so two bids at the same moment can't both win.
  * **Auction end:** when `endsAt` passes, the highest bidder wins: set `auction.winnerId`. The app shows the winner a Pay button; they check out with `POST /orders` like a fixed-price buyer, at the winning bid.
* **`GET /listings/:id/bids`** → `Bid[]`

### Phase 6: Checkout, Orders & Escrow

```ts
type Order = {
  id: string;            // short, readable: "SA-123456" (the courier types it)
  itemId: string;
  itemTitle: Localized;
  itemImageUrl: string;
  itemPriceFils: number; // listing price, or the accepted offer's amount
  buyerProtectionFils: number; // 3% of item price, min 1000
  deliveryFils: number;  // 2000 flat
  totalFils: number;
  status: 'awaiting_payment' | 'escrow_held' | 'completed' | 'refunded';
  pin?: string;          // 4 digits, buyer only, once escrow_held
  offerId?: string;
  delivery: DeliveryDetails;
  paymentUrl?: string;   // the bank's card-check page, while awaiting_payment (see below)
  createdAt: string;     // ISO-8601
  deliveredAt?: string;  // ISO-8601, once the courier confirms
};

type DeliveryDetails = {
  name: string;    // recipient, 2+ characters
  phone: string;   // Jordanian mobile: 07[789] + 7 digits (the app sends it as typed; store it as 07XXXXXXXX)
  cityId: string;  // area id from GET /cities
  address: string; // street, building, floor: 5–200 characters
  notes?: string;  // for the courier, max 200
};
```

The app remembers the last delivery details on the phone and fills them in next time. Show
`delivery` to the courier (and the seller's pickup address, once that exists) but never to other users.

**The server prices every order.** The app shows the same breakdown (`calculateCheckoutBreakdown` in
`src/lib/money.ts`) but never sends amounts.

* **`POST /orders` *(Authenticated)*** → Body: `{ "listingId": "mobiles-0", "offerId"?: "...", "delivery": DeliveryDetails }` → `Order` (`status: "awaiting_payment"`).
  * With `offerId`, the offer must be **accepted**, on this listing, and made by this buyer; its `amountFils` becomes `itemPriceFils`. Otherwise `VALIDATION` (422).
  * An auction: only after it ended, only for `auction.winnerId`, at the winning bid. Otherwise `ITEM_UNAVAILABLE` (409).
  * The listing must be `active` and not from a blocked user (`ITEM_UNAVAILABLE`); not the buyer's own (`FORBIDDEN`); `delivery` complete and valid (`VALIDATION`).
* **`POST /orders/:id/pay` *(Authenticated, the order's buyer)*** → Body: `{ "cardToken": "..." }` (provider token, or `"saved"` to charge the account's saved card) → `Order`
  * Paid: `status: "escrow_held"`, with the delivery `pin`. The listing becomes `reserved`.
  * **Bank card check (3-D Secure):** Jordanian cards usually need it, so with MEPS expect this path. Return the order still `awaiting_payment` with `paymentUrl` (the bank's page). The app opens it in the browser and then polls `GET /me/orders` / `GET /orders/:id`. When the bank calls back, the server sets `escrow_held` (or leaves `awaiting_payment` if it failed, so the buyer can pay again). The bank's return page can simply say "Payment done, go back to Sahla".
  * Two buyers racing: the first payment wins; the other gets `ITEM_UNAVAILABLE` (409) and isn't charged. Do the check and the status change in one transaction.
* **`GET /me/orders` *(Authenticated)*** → `Order[]` (Buyer order history)
* **`GET /me/sales` *(Authenticated)*** → `Order[]` (Seller sales history)
* **`GET /orders/:id` *(Authenticated)*** → `Order` (Includes buyer's delivery `pin`)
* **`GET /offers/:id` *(Authenticated, buyer or seller)*** → `Offer` (Checkout loads the accepted offer to show its price)
* **`POST /courier/confirm-delivery` *(Authenticated, `user.role === "courier"`)*** → Body: `{ "orderId": "SA-123456", "pin": "8492" }` → `Order` (`status: "completed"`, `deliveredAt` set; escrow funds released to the seller).
  * Errors: `INVALID_PIN` (422) wrong PIN, nothing released; `VALIDATION` (422) order not in `escrow_held`; `NOT_FOUND` (404); `FORBIDDEN` (403) not a courier.
  * The listing becomes `sold`.
  * The PIN check and release happen **only on the server**. Rate-limit attempts per order (e.g. lock after 5 wrong PINs) so a PIN can't be guessed.
* **Refunds:** if the item never arrives, support/admin moves the order to `refunded`, the escrow is returned to the buyer and the listing goes back to `active` (no app endpoint).
* **`User.role`**: optional, `"courier"` for courier accounts. Couriers see "Confirm a Delivery" in the menu.

### Safety: report and block

**Required by the App Store** (guideline 1.2) for apps where people post listings and chat: users must
be able to report content and block people, and the team must act on reports within 24 hours.

* **`POST /reports` *(Authenticated)*** → Body: `{ "targetType": "listing" | "user", "targetId": "...", "reason": "scam" | "prohibited" | "offensive" | "wrong_info" | "other", "details"?: "max 500 chars" }` → 204
  * The app offers it on every product page ("Report this listing") and in the chat menu (the other person).
  * `NOT_FOUND` (404) for an unknown target, `VALIDATION` (422) for an unknown reason.
  * Store with the reporter's id and time and show them in the admin tool. Hide a listing quickly when several people report it.
* **`POST /me/blocked` *(Authenticated)*** → Body: `{ "userId": "..." }` → 204 (blocking twice is fine; yourself is `VALIDATION`)
* **`GET /me/blocked` *(Authenticated)*** → `{ "id": string, "name": string }[]` (Profile → Blocked users)
* **`DELETE /me/blocked/:userId` *(Authenticated)*** → 204
* **What a block does, both ways:** hide each other's listings (`GET /listings`) and chats (`GET /chats`); refuse messages, offers and orders between them (`FORBIDDEN` / `ITEM_UNAVAILABLE`). Orders already paid continue.

---

## Live Updates & Notifications

**Today (works with any REST backend):** screens that change while open ask again on a timer, only
while they're on screen and the app is in the foreground (`config.pollMs`):

| Screen | Requests | Every |
|---|---|---|
| Auction bidding | `GET /listings/:id`, `GET /listings/:id/bids` | 3 s |
| Chats / open conversation | `GET /chats`, `GET /chats/:id/messages` | 5 s |
| Order tracking | `GET /me/orders` | 15 s |

These endpoints must therefore be cheap. Optional: support `ETag` / `If-None-Match` → `304`.

**Planned — push notifications** (needs a Firebase project for Android and an Apple Push key for
iOS; not in the app yet). Proposed endpoints, so the backend can plan for them:

* **`POST /me/devices` *(Authenticated)*** → Body: `{ "token": "<FCM token>", "platform": "android" | "ios" }` → 204. Sent after sign-in and whenever the token changes.
* **`DELETE /me/devices/:token` *(Authenticated)*** → 204. Sent on log-out.
* Server sends a push for: new chat message, offer accepted / countered, outbid, auction won,
  order delivered. Payload `data`: `{ "type": "chat" | "offer" | "outbid" | "auction_won" | "order", "id": "<chat, listing or order id>" }` so tapping it opens the right screen.

Later, a WebSocket (or Server-Sent Events) channel can replace the timers for chat and live
bidding; the screens won't change.

---

## Testing the API Locally

The repository includes a standalone local contract server for testing:

```bash
# Start the local contract server on http://localhost:4000/v1
npm run contract-server
```

To run the mobile app against it:
1. In [`src/config.ts`](file:///C:/Users/mustafa/Desktop/Sahla/Sahla/src/config.ts), set:
   ```ts
   apiBaseUrl: 'http://10.0.2.2:4000/v1',
   mock: { catalog: true, auth: false, negotiation: true, orders: true }
   ```
   (The contract server implements the **Accounts** endpoints only, demo code `123456`; the others stay on mock.)
2. `npm test` runs, among others, `__tests__/contract.test.js` (the app's account HTTP code against the
   contract server over real HTTP) and `__tests__/httpContract.test.ts` (every request the app can send,
   checked against this document).


