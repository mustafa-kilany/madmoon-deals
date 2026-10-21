# Sahla API Contract & Connection Guide

This document defines the REST API contract expected by the **Sahla** mobile application, as well as instructions for connecting the app to a live backend service.

The app's HTTP service layer (`src/services/*/http.ts`) and API client (`src/services/api/client.ts`) are fully implemented and integrated. Connecting to a real API server requires only a configuration update in `src/config.ts`.

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
    negotiation: true,  // /offers, /listings/:id/bids, /chats
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
| `EMAIL_TAKEN` | 409 | Attempting sign-up with an already registered email |
| `INVALID_PIN` | 422 | Courier typed the wrong delivery PIN (nothing is released) |

Any other code is shown to the user as a generic error, so new codes need an app update to get their own message.

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
Creates a new account using email and password.
* **Request Body:** `{ "name": "Ahmad", "email": "ahmad@sahla.jo", "password": "password123" }`
* **Response (200):** `Session`
* **Errors:** `EMAIL_TAKEN` (409), `VALIDATION` (400/422)

#### 2. `POST /auth/login`
Authenticates an existing user.
* **Request Body:** `{ "email": "ahmad@sahla.jo", "password": "password123" }`
* **Response (200):** `Session`
* **Errors:** `INVALID_CREDENTIALS` (401), `VALIDATION` (400/422)

#### 3. `POST /auth/google`
Authenticates or registers a user via Google OAuth ID token.
* **Request Body:** `{ "idToken"?: "google_oauth_token" }`
* **Response (200):** `Session`

#### 4. `POST /auth/apple`
Authenticates or registers a user via Apple Sign-In identity token.
* **Request Body:** `{ "idToken"?: "apple_identity_token" }`
* **Response (200):** `Session`

#### 5. `POST /auth/send-otp`
Requests a 6-digit OTP verification code to be sent to the user's email.
* **Request Body:** `{ "email": "user@sahla.jo" }`
* **Response (200):** 200 OK

#### 6. `POST /auth/verify-otp`
Verifies the OTP code sent to the email and returns a session.
* **Request Body:** `{ "email": "user@sahla.jo", "code": "123456" }`
* **Response (200):** `Session`
* **Errors:** `INVALID_CREDENTIALS` (401)

#### 7. `POST /auth/logout` *(Authenticated)*
Revokes the session token on the server.
* **Headers:** `Authorization: Bearer <token>`
* **Response:** 204 No Content

#### 8. `GET /me` *(Authenticated)*
Fetches the currently authenticated user profile.
* **Response (200):** `User`
* **Errors:** `UNAUTHORIZED` (401)

#### 9. `PATCH /me` *(Authenticated)*
Updates user profile settings (name or city).
* **Request Body:** `{ "name"?: "Ahmad", "cityId"?: "amman" }`
* **Response (200):** `User`

#### 10. `POST /me/avatar` *(Authenticated)*
Uploads a new profile picture.
* **Request Body:** `multipart/form-data` with field `avatar` (JPEG/PNG up to 10MB)
* **Response (200):** `User` (with updated `avatarUrl`)

#### 11. `POST /me/id-verification` *(Authenticated)*
Submits a national ID document to earn the Verified badge. Accounts are created with email (or Google/Apple) only; ID verification happens afterwards.
* **Request Body:** `multipart/form-data` with field `idPhoto`
* **Response (200):** `User` (`verified: true`)

#### 12. `POST /me/payment-card` *(Authenticated)*
Attaches a saved card reference using a payment token generated by the payment provider's mobile SDK. Raw card numbers are never sent to Sahla servers.
* **Request Body:** `{ "cardToken": "provider_token_xyz" }`
* **Response (200):** `User` (with updated `card: { brand, last4 }`)

#### 13. `DELETE /me/payment-card` *(Authenticated)*
Removes the saved payment card reference.
* **Response (200):** `User` (`card` removed)

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
  };
};
```

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
| `sort` | `recommended` | `recommended` (verified sellers first, then relevance), `price_asc`, `price_desc`, `ending_soon`, `most_bids`. |
| `cursor` | `eyJvZmZzZXQiOjIwfQ` | Opaque value from the previous page's `nextCursor`. |
| `limit` | `20` | Page size, default 20, max 50. |
| `ids` | `mobiles-0,mobiles-1` | Fetch exactly these listings, in this order (Saved, recently viewed). Other params ignored; missing ids are skipped. |

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

#### 6. `GET /me/listings` *(Authenticated)*
Returns all listings created by the signed-in user.
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
  * **Request (JSON):** `category`, `titleAr`, `titleEn`, `priceFils`, `imageUrls` (1–5 URLs from the upload above, cover first), `condition`, `brand?`, `model?`, `type`, `locationId` (area id), `saleType` (`fixed` or `auction`), `auctionEndsAt?` (ISO-8601), `incrementFils?`.
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
  sellerName: string;
  amountFils: number;
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
  offer?: Offer; // present on "offer made / countered / accepted" messages
  createdAt: string;
};
```

Lists are newest first except `GET /chats/:id/messages` (oldest first, like a conversation).

* **`GET /chats` *(Authenticated)*** → `ChatThread[]`
* **`GET /chats/:id/messages` *(Authenticated)*** → `ChatMessage[]`
* **`POST /chats/:id/messages` *(Authenticated)*** → Body: `{ "text": "Is this still available?" }` → `ChatMessage`
* **`POST /listings/:id/offers` *(Authenticated)*** → Body: `{ "amountFils": 450000 }` → `{ "offer": Offer, "chatId": "..." }`
* **`POST /offers/:id/respond` *(Authenticated, seller)*** → Body: `{ "status": "accepted" | "countered" | "rejected", "counterAmountFils"?: 480000 }` → `Offer`
* **`POST /listings/:id/bids` *(Authenticated)*** → Body: `{ "amountFils": 530000 }` → `Bid` (the item's `priceFils` and `bidCount` update; refetch the item)
  * `VALIDATION` (422) if `amountFils` < current bid + `incrementFils`, the auction has ended, or the bidder is the seller. Check and update in one transaction so two bids at the same moment can't both win.
  * **Auction end:** when `endsAt` passes, the server closes the auction and the highest bidder is the winner (they check out like a fixed-price buyer; the app part for this is still to do).
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
  createdAt: string;     // ISO-8601
  deliveredAt?: string;  // ISO-8601, once the courier confirms
};
```

**The server prices every order.** The app shows the same breakdown (`calculateCheckoutBreakdown` in
`src/lib/money.ts`) but never sends amounts.

* **`POST /orders` *(Authenticated)*** → Body: `{ "listingId": "mobiles-0", "offerId"?: "..." }` → `Order` (`status: "awaiting_payment"`). With `offerId`, the offer must be **accepted**, on this listing, and made by this buyer; its `amountFils` becomes `itemPriceFils`. Otherwise `VALIDATION` (422).
* **`POST /orders/:id/pay` *(Authenticated)*** → Body: `{ "cardToken": "..." }` (provider token, or `"saved"` to charge the account's saved card) → `Order` (`status: "escrow_held"`, includes the delivery `pin`)
* **`GET /me/orders` *(Authenticated)*** → `Order[]` (Buyer order history)
* **`GET /me/sales` *(Authenticated)*** → `Order[]` (Seller sales history)
* **`GET /orders/:id` *(Authenticated)*** → `Order` (Includes buyer's delivery `pin`)
* **`GET /offers/:id` *(Authenticated, buyer or seller)*** → `Offer` (Checkout loads the accepted offer to show its price)
* **`POST /courier/confirm-delivery` *(Authenticated, `user.role === "courier"`)*** → Body: `{ "orderId": "SA-123456", "pin": "8492" }` → `Order` (`status: "completed"`, `deliveredAt` set; escrow funds released to the seller).
  * Errors: `INVALID_PIN` (422) wrong PIN, nothing released; `VALIDATION` (422) order not in `escrow_held`; `NOT_FOUND` (404); `UNAUTHORIZED` (403) not a courier.
  * The PIN check and release happen **only on the server**. Rate-limit attempts per order (e.g. lock after 5 wrong PINs) so a PIN can't be guessed.
* **Refunds:** if the item never arrives, support/admin moves the order to `refunded` and the escrow is returned to the buyer (no app endpoint).
* **`User.role`**: optional, `"courier"` for courier accounts. Couriers see "Confirm a Delivery" in the menu.

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
   (The contract server implements the **Accounts** endpoints only; the others stay on mock.)
2. Run `npm test` to execute automated integration tests against the contract server.


