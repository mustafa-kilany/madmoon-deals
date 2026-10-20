# Sahla API Contract & Connection Guide

This document defines the REST API contract expected by the **Sahla** mobile application, as well as instructions for connecting the app to a live backend service.

The app's HTTP service layer (`src/services/*/http.ts`) and API client (`src/services/api/client.ts`) are fully implemented and integrated. Connecting to a real API server requires only a configuration update in `src/config.ts`.

---

## Connecting the Mobile App to the Backend

### 1. Update `src/config.ts`

Open [`src/config.ts`](file:///C:/Users/mustafa/Desktop/Sahla/Sahla/src/config.ts) and set `apiBaseUrl` and toggles for `mock`:

```ts
export const config = {
  /** Base URL of your Sahla REST API server */
  apiBaseUrl: 'https://api.sahla.jo/v1', // or 'http://10.0.2.2:4000/v1' for Android Emulator

  /** Toggles: set to false to use real HTTP API endpoints instead of mock data */
  mock: {
    catalog: false, // Uses httpCatalogService (/categories, /listings, /cities, etc.)
    auth: false,    // Uses httpAuthService (/auth/login, /auth/signup, /me, etc.)
  },

  requestTimeoutMs: 15_000,
  uploadTimeoutMs: 60_000,
} as const;
```

> [!NOTE]
> * **Android Emulator Host Loopback:** Use `http://10.0.2.2:<port>/v1` to point to a server running locally on your development PC.
> * **iOS Simulator Host Loopback:** Use `http://localhost:<port>/v1`.
> * **Gradual Integration:** You can set `auth: false` and keep `catalog: true` (or vice versa) to integrate backend services independently.

---

### 2. How the App Handles Requests & Authentication

* **Headers & Content-Type:**
  * Standard JSON endpoints automatically include `Accept: application/json` and `Content-Type: application/json`.
  * Upload endpoints (e.g. `idPhoto`, `avatar`) use `FormData` (`multipart/form-data`). The client automatically lets the platform set the correct boundary header.
* **Authentication Tokens:**
  * When signed in, the app stores a bearer token in MMKV via [`tokenStorage`](file:///C:/Users/mustafa/Desktop/Sahla/Sahla/src/services/api/tokenStorage.ts).
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
| **Category IDs** | Fixed set: `clothing`, `tech`, `vehicles`, `furniture`, `shoes`, `gaming`, `watches`, `more`. |
| **Timestamps** | ISO-8601 UTC strings (e.g. `"2026-10-19T12:00:00Z"`). |
| **Errors** | Non-2xx responses return `{ "error": { "code": "ERROR_CODE", "message": "..." } }`. |

### Error Codes Standard

| Code | HTTP Status | Description |
|---|---|---|
| `VALIDATION` | 400 / 422 | Bad parameters or missing required fields |
| `UNAUTHORIZED` | 401 | Missing, invalid, or expired authentication token |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password during login |
| `NOT_FOUND` | 404 | Resource with the specified ID does not exist |
| `EMAIL_TAKEN` | 409 | Attempting sign-up with an already registered email |

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
  method: 'email' | 'id';
  verified: boolean;
  cityId: string; // 'amman', 'irbid', 'zarqa', 'aqaba'
  avatarUrl: string;
  card?: { brand: string; last4: string };
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
  id: string; // 'clothing', 'tech', 'vehicles', etc.
  name: Localized;
  icon: string; // 'Shirt', 'Laptop', 'Car', etc.
  imageUrl: string;
};

type Item = {
  id: string;
  category: string;
  title: Localized;
  priceFils: number; // Integer fils
  imageUrl: string;
  condition: 'new' | 'excellent' | 'good' | 'loved';
  seller: Localized;
  brand?: string;
  type: string;
  verified: boolean;
  location: { id: string; name: Localized };
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
Returns available item types and brands per category for the filter sheet.
* **Response (200):** `{ [categoryId]: { types: [{ id, name: Localized }], brands: string[] } }`

#### 3. `GET /cities`
Returns available delivery/location cities in Jordan.
* **Response (200):** `[{ id: "amman", name: { ar: "عمّان", en: "Amman" } }]`

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
| `q` | `iphone 14` | Free text. Every word must match title (ar or en), brand or type name (ar or en). Server should normalise Arabic (أ/إ/آ→ا, ة→ه, ى→ي, strip tashkeel) and may add typo tolerance. |
| `category` | `tech` | One category id. |
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
| `ids` | `tech-0,tech-1` | Fetch exactly these listings, in this order (Saved, recently viewed). Other params ignored; missing ids are skipped. |

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

* **`POST /listings` *(Authenticated)***
  * **Request (JSON):** `category`, `titleAr`, `titleEn`, `priceFils`, `imageUrl`, `condition`, `brand?`, `type`, `locationId`, `saleType`, `auctionEndsAt?` (epoch ms), `incrementFils?`. Photo upload to storage arrives in Phase 7; until then `imageUrl` is the first photo's URL.
  * **Response (201):** `Item`
* **`PATCH /listings/:id` *(Authenticated)***
  * **Request:** `{ "priceFils"?: 50000, "condition"?: "excellent" }`
  * **Response (200):** `Item`
* **`DELETE /listings/:id` *(Authenticated)***
  * **Response:** 204 No Content

### Phase 5: Negotiation, Chat & Auction Bids

* **`GET /chats` *(Authenticated)*** → `ChatThread[]`
* **`GET /chats/:id/messages` *(Authenticated)*** → `ChatMessage[]`
* **`POST /chats/:id/messages` *(Authenticated)*** → Body: `{ "text": "Is this still available?" }` → `ChatMessage`
* **`POST /listings/:id/offers` *(Authenticated)*** → Body: `{ "amountFils": 450000 }` → `{ "offer": Offer, "chatId": "..." }`
* **`POST /offers/:id/respond` *(Authenticated, seller)*** → Body: `{ "status": "accepted" | "countered" | "rejected", "counterAmountFils"?: 480000 }` → `Offer`
* **`POST /listings/:id/bids` *(Authenticated)*** → Body: `{ "amountFils": 530000 }` → `Bid` (the item's `priceFils` and `bidCount` update; refetch the item)
* **`GET /listings/:id/bids`** → `Bid[]`

### Phase 6: Checkout, Orders & Escrow

* **`POST /orders` *(Authenticated)*** → Body: `{ "listingId": "tech-0", "offerId"?: "..." }` → `Order` (returns calculated `itemPriceFils`, `buyerProtectionFils`, `deliveryFils`, `totalFils`)
* **`POST /orders/:id/pay` *(Authenticated)*** → Body: `{ "cardToken": "..." }` (provider token, or `"saved"` to charge the account's saved card) → `Order` (`status: "escrow_held"`, includes the delivery `pin`)
* **`GET /me/orders` *(Authenticated)*** → `Order[]` (Buyer order history)
* **`GET /me/sales` *(Authenticated)*** → `Order[]` (Seller sales history)
* **`GET /orders/:id` *(Authenticated)*** → `Order` (Includes buyer's delivery `pin`)
* **`POST /courier/confirm-delivery` *(Authenticated - Courier Role)*** → Body: `{ "orderId": "ord-123", "pin": "8492" }` → `Order` (`status: "completed"`, releases escrow funds to seller)

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
   mock: { catalog: true, auth: false }
   ```
2. Run `npm test` to execute automated integration tests against the contract server.


