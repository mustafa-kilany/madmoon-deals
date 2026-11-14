# Madmoon Deals API Contract & Connection Guide

This document defines the REST API contract expected by the **Madmoon Deals** mobile application, as well as instructions for connecting the app to a live backend service.

The app's HTTP service layer (`frontend/src/services/*/http.ts`) and API client (`frontend/src/services/api/client.ts`) are fully implemented and integrated. Connecting to a real API server requires only a configuration update in `frontend/src/config.ts`. The API itself is in `backend/`.

## Changes on 2026-11-10 (minimum app build, BACKEND_REVIEW M3)

* **`X-App-Build: <Android versionCode>` on every request** (`config.appBuild` in the app, the same number as `versionCode` in `android/app/build.gradle`).
* **426 `UPDATE_REQUIRED`** on any endpoint when the build is older than the server's `MIN_APP_BUILD`. The app then shows only its "update Madmoon Deals" screen, with a button to the store. A request without the header isn't checked (the dashboard, the bank's page).

## Changes on 2026-11-08 (readiness work: `INTERNAL_READINESS_PLAN.md`)

* **`GET /listings/:id/live`:** a WebSocket that delivers each new bid as it's saved. **`GET /me/live`:** a signed-in WebSocket that says when a chat or the support conversation changed. See "Live Updates & Notifications".
* **Auctions extend:** a bid in the last 45 seconds adds 45 seconds to `auction.endsAt`, up to 5 minutes after the end the seller set. The `bid` message on `GET /listings/:id/live` carries `auctionEndsAt`.
* **`ChatThread`** has `unreadCount`; **`POST /chats/:id/read`** marks a chat read.
* **`POST /auth/send-otp`** answers 204 even when the email has an account (it no longer says `EMAIL_TAKEN`): that person gets an email saying so.
  **`POST /auth/signup`** checks the code first, so only the mailbox's owner can see `EMAIL_TAKEN`. **`POST /auth/forgot-password`** answers at once; an email outage isn't reported.
* **`DELETE /me`** also refuses (`OPEN_ORDERS`) with money still owed or in a live auction, and staff accounts (`FORBIDDEN`). It removes the files too.
* **`GET /me/export`:** a copy of the person's data (5 a day).
* **`GET /courier/deliveries`:** a delivered or failed job keeps names and areas only (no phones, addresses or notes).
* **`GET /me/auctions-won`:** the auctions this person won and hasn't paid for (`Item[]`). Ended auctions leave every list and a push may never arrive.
* **Seller's bank account:** `GET` / `PUT /me/payout-account`, `POST /me/payout-account/code` (see Phase 6).
* **`POST /courier/confirm-delivery`** answers 422 until the order is marked picked up.
* **`DELETE /listings/:id`:** an auction with bids can be withdrawn 48 hours after it ended, if the winner never paid.
* **`cardToken`** (`POST /orders/:id/pay`, `POST /me/payment-card`) that looks like a card number → 422.
* **Admin order answers** never include `pin`. **`POST /admin/payouts/:id/paid`** → 422 with no bank account, or within 24 hours of a change.
  `GET /admin/payouts` rows get `account: { holderName, iban, heldUntil? } | null`.

## Changes on 2026-11-07 (B15)

**Delivery problems and cancelling** (BACKEND_PLAN B15.3–B15.4). `Order.status` can be `cancelled` (the buyer
cancelled). `Order` has `courierStatus`, `cancel`, `itemIssue`, `deliveryFailed`, `refundedAt`; `Delivery.status`
can be `failed` and has `buyerIssue` / `failed`. New: `POST /orders/:id/cancel`, `POST /orders/:id/problem`,
`POST /courier/deliveries/:orderId/failed`, `POST /admin/orders/:id/resolve-problem`,
`GET /admin/orders?problems=true`. Reason lists: `frontend/src/lib/deliveryProblems.ts` (shared by app and server).
New pushes: sold (seller), assigned (driver, `type: "delivery"`), picked up (buyer), cancelled, delivery failed,
problem resolved.

## Changes on 2026-10-30 (backend: please read)

**ID verification is Sanad only (breaking).** `POST /me/id-verification` (ID photo) is gone: no photos,
no manual review. New: `POST /me/id-verification/sanad` → `{ redirectUrl }`; the app opens it, Sanad sends the
user back to the server, and `GET /me` then shows `verified: true`. Until Madmoon Deals has Sanad access it answers
`503 SANAD_UNAVAILABLE` (the app says "coming soon").

**Planned: courier app** ([Couriers](#couriers-drivers-planned-backend_plan-b14)). Courier accounts are
made by admins with the staff email domain, never by sign-up; couriers see only their deliveries (pickup,
drop-off, PIN). New: `GET /courier/deliveries`, `POST /courier/deliveries/:orderId/picked-up`; sign-up
refuses staff-domain emails; customer endpoints answer `FORBIDDEN` for couriers.

**Breaking**
* **Certified refurbished listings are always fixed price.** Vendors set the price, so the import
  (`POST /admin/refurbished/import`) has no `auctionEndsAt` / `auctionIncrementJod` any more: a row that
  still has them (the old Excel template) is refused with a row error. Imported listings are
  `saleType: "fixed"` without `auction`. `GET /listings?format=auction&refurbished=true` is always empty.
* The app shows no format tabs in the Certified Refurbished store and no Refurbished choice on the
  Auctions tab.

## Changes on 2026-10-26, part 2 (backend: please read)

**Breaking**
* **Every listing has a description of at least 10 words** (max 2000 characters). `Item.description`
  is no longer optional; `POST /listings` and the refurbished import reject a missing or shorter one
  (`VALIDATION`). Give existing listings without one a description before deploying (or hide them).
* **Phones and electronics need a shop test certificate.** Item types with
  `requiresTestCertificate: true` in `GET /categories/filters` (today: phones, tablets, smartwatches,
  laptops, gaming, TVs, cameras, audio) can only be listed with a photo of a shop's stamped test report
  that the server has read (OCR) and checked: `POST /listings` takes `testCertificateId` and rejects
  those types without a passed one (`VALIDATION`).

**New**
* `POST /test-certificates`: upload the report photo; the server reads it and checks the stamp, the
  shop, the device, the specs and the date (see [Shop test certificates](#shop-test-certificates-phones--electronics)).
* `Item.testCertificate`: the passed report on the listing (photo, shop, date, specs). Buyers see it.
* `GET /geocode/reverse`: the street at the buyer's GPS position, so checkout can fill in the delivery
  address (see [Phase 6](#phase-6-checkout-orders--escrow)). Coordinates are only sent for this lookup;
  orders still carry only the typed `DeliveryDetails`.

## Changes on 2026-10-26 (backend: please read)

**Certified Refurbished store.** Brand-certified refurbished listings, sold by each brand's
official store account (e.g. "Apple Certified") with a warranty. Nobody lists them in the app:
they are **imported**, by the brand's system through the API or from the Excel sheet in the admin
dashboard, with the new endpoint `POST /admin/refurbished/import` (see
[Certified Refurbished import](#certified-refurbished-import-admin-dashboard--brand-systems)).
Once imported they are ordinary listings in their normal category, so search, category and auction
browsing show them too; the app has a store screen, a Home banner and a Refurbished switch beside
the All / Buy now / Auctions tabs.
* `Item` has optional `refurbished: { warrantyMonths }` (0 = brand-inspected, no warranty).
* `Item.condition` has three more values, `refurbished_like_new`, `refurbished_excellent`,
  `refurbished_good`, used only on imported refurbished listings. `POST /listings` rejects them
  (`VALIDATION`).
* `GET /listings` takes `refurbished=true` (refurbished listings only). The response has
  `refurbishedCounts: { all, refurbished }` and `facets.maxWarrantyMonths`.
* New endpoints `POST /admin/refurbished/import` and `DELETE /admin/refurbished/:storeId/:sku`.

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
  pollMs: { auction: 3_000, auctionLive: 15_000, chat: 5_000, orders: 15_000 }, // see "Live updates"
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
| **App build** | `X-App-Build: <Android versionCode>` on every request. Older than the server's `MIN_APP_BUILD`: 426 `UPDATE_REQUIRED` everywhere. |
| **Device id** | `X-Device-Id: <32 hex characters>` on every request: a random id the app makes once per install (MMKV). Counts listing views per phone and lets the risk checker spot many accounts on one phone. Not a hardware id. |
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
| `PAYMENT_DECLINED` | 402 | The card was declined (`POST /orders/:id/pay`); the order stays `awaiting_payment`, the buyer can try another card |
| `INVALID_CODE` | 422 | Wrong or expired emailed code (sign-up, password reset) |
| `SANAD_UNAVAILABLE` | 503 | ID verification with Sanad isn't switched on yet ("coming soon") |
| `EMAIL_UNAVAILABLE` | 503 | The emailed code couldn't be sent (email service down or misconfigured); nothing was saved, so asking again works at once (`POST /auth/send-otp`, `POST /auth/forgot-password`) |
| `UPDATE_REQUIRED` | 426 | This build of the app is older than `MIN_APP_BUILD`: show the update screen |
| `RATE_LIMITED` | 429 | Too many tries: log-in / code attempts for one email from one IP (~15 minutes), delivery PINs (5 per order), location lookups (20 an hour) |

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
  verified: boolean; // true once the national ID is checked with Sanad
  cityId: string;    // an area id from GET /cities, e.g. 'salt', 'amman-khalda'
  avatarUrl: string;
  card?: { brand: string; last4: string };
  role?: 'courier';  // courier accounts only
  termsVersion?: string; // B15.8: the terms + privacy version accepted; the app asks again when it changes
};
```

### Endpoints Specification

#### 1. `POST /auth/signup`
Creates a new account. The app first calls `POST /auth/send-otp`; the user types the emailed code here, which proves they own the address.
* **Request Body:** `{ "name": "Ahmad", "email": "ahmad@sahla.jo", "password": "password123", "code": "482913", "acceptTerms": true }`
* **Rules:** `acceptTerms: true` is required (B15.8: the screen shows the Terms and Privacy Policy with the button;
  the server stores the current version and time). Name ≥ 2 characters, password ≥ 8 characters, email stored lower-cased. `VALIDATION` first, then the code, then `EMAIL_TAKEN` (so nobody can test which emails have accounts).
* **Response (200 or 201):** `Session`
* **Errors:** `EMAIL_TAKEN` (409), `VALIDATION` (422), `INVALID_CODE` (422)

#### 2. `POST /auth/login`
Authenticates an existing user.
* **Request Body:** `{ "email": "ahmad@sahla.jo", "password": "password123" }`
* **Response (200):** `Session`
* **Errors:** `INVALID_CREDENTIALS` (401), `VALIDATION` (400/422)

#### 3. `POST /auth/google`
Signs in or signs up with the ID token from Google's sign-in SDK.
* **Request Body:** `{ "idToken": "<Google ID token>", "acceptTerms": true }` (B15.8: needed when it creates a new account,
  else `VALIDATION`; the app always sends it, the terms are shown with the buttons). The server **verifies** it with Google's public keys
  (signature, issuer, audience = one of Madmoon Deals' OAuth client ids, expiry) and takes the account id and email
  from it, never from the request.
* **Which account:** the one already linked to that Google account; else the account with the same
  **verified** email (linked now, so password log-in keeps working too); else a new one
  (`method: "google"`, name and picture from Google). An unverified email never takes over an account.
* **Response (200):** `Session`
* **Errors:** `INVALID_CREDENTIALS` (401) forged / expired / other app's token; `FORBIDDEN` (403) a staff
  account or a suspended one; `VALIDATION` (422) a new account with a staff-domain email; `INTERNAL` (503)
  Google sign-in not set up on the server yet.

#### 4. `POST /auth/apple`
The same with Apple's identity token (Apple's public keys, audience = the app's bundle id).
* **Request Body:** `{ "idToken": "<Apple identity token>", "name"?: "Layla Ahmad" }`. Apple gives the person's
  name **only to the app, only on the first sign-in**, so the app sends it then; it's used for a new account.
* Apple may hide the email (a `@privaterelay.appleid.com` address) or share none; both are valid accounts.
* **Response (200):** `Session`; errors as for Google.

#### 5. `POST /auth/send-otp`
Emails a 6-digit code to a **new** address, before sign-up.
* **Request Body:** `{ "email": "user@sahla.jo" }`
* **Response:** 204 No Content
* **Errors:** `EMAIL_TAKEN` (409), `VALIDATION` (422)
* **Codes (also for password reset):** random 6 digits, valid ~10 minutes, ~5 wrong tries then a new code is needed, resend at most once a minute per email.

#### 6. `POST /auth/forgot-password`
Emails a 6-digit reset code if the address has an account.
* **Request Body:** `{ "email": "user@sahla.jo" }`
* **Response:** 204 No Content, **whether or not the account exists** (so it can't be used to find out who uses Madmoon Deals).

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

#### 10b. `POST /me/terms` *(Authenticated)*
Accepts the current Terms and Privacy Policy (B15.8), e.g. after they changed. The app shows a prompt when
`User.termsVersion` differs from its own `LEGAL_VERSION` (customers only).
* **Request Body:** `{ "version": "2026-11-07" }` (must be the current one, else `VALIDATION`)
* **Response (200):** `User`

**Legal pages (public):** `GET /legal` → `{ version, sanadConsentVersion, supportEmail }`; `GET /legal/privacy` and
`GET /legal/terms` (`?lang=ar|en`, Arabic by default) → HTML pages for the stores and the website, from the same text
as the app (`frontend/src/legal`). The text is a draft for a lawyer to review.

#### 11. `POST /me/avatar` *(Authenticated)*
Uploads a new profile picture.
* **Request Body:** `multipart/form-data` with field `avatar` (JPEG/PNG up to 10MB)
* **Response (200):** `User` (with updated `avatarUrl`)

#### 12. `POST /me/id-verification/sanad` *(Authenticated, customers)*
Starts verifying the account with **Sanad** (Jordan's national digital ID) for the Verified badge. Accounts are
created with email (or Google/Apple) only; ID verification happens afterwards. Madmoon Deals never sees an ID photo or
stores the national number (only a keyed hash: one ID verifies one account).
* **Request Body:** `{ "consent": true }` (B15.8, MoDEE's pledge: the app shows what Madmoon Deals asks Sanad for and why, and the
  person ticks agree; the server stores the consent version and time with the check). Without it: `VALIDATION`.
* **Response (200):** `{ "redirectUrl": "https://…" }`: Sanad's consent page. The app opens it in the browser.
* Sanad then sends the user to the server (`GET /v1/id-verification/sanad/callback?code&state`, the redirect URI
  registered with MoDEE), which checks the answer with Sanad and shows a short "go back to the app" page.
  Back in the app, `GET /me` shows `verified: true` (the badge also shows on the user's listings).
* The link works once and for 15 minutes. Cancelled in Sanad, or an ID that already verifies another account:
  not verified (the page says why).
* **Errors:** `SANAD_UNAVAILABLE` (503) until Madmoon Deals has Sanad access; `VALIDATION` (422) already verified;
  `FORBIDDEN` for couriers.

#### 13. `POST /me/payment-card` *(Authenticated)*
Attaches a saved card reference using a payment token generated by the payment provider's mobile SDK. Raw card numbers are never sent to Madmoon Deals servers.
* **Request Body:** `{ "cardToken": "provider_token_xyz" }`
* **Response (200):** `User` (with updated `card: { brand, last4 }`)
* **Server (B7.8):** the provider swaps the SDK's one-time token for one that can be charged again; only that
  token and the brand / last 4 digits are stored. A new card replaces the old one. Checkout pays with it by
  sending `cardToken: "saved"` to `POST /orders/:id/pay`.
* **Errors:** `VALIDATION` (422) a token the provider doesn't know; `INTERNAL` (503) card payments not switched on.

#### 14. `DELETE /me/payment-card` *(Authenticated)*
Removes the saved payment card reference.
* **Response (200):** `User` (`card` removed)

#### 15. `DELETE /me` *(Authenticated)*
Deletes the account (Profile → Delete account). **Required by the App Store** (guideline 5.1.1(v)) for any app where people create accounts.
* **Response:** 204 No Content. The app then signs out locally.
* **Server:** revoke all sessions; remove or anonymise the profile, avatar, ID photo, saved card reference, active listings, push tokens and blocks; keep only what the law requires (e.g. completed payment records). The email can sign up again afterwards.
* **Errors:** `OPEN_ORDERS` (409) while any order is `escrow_held` with this user as buyer or seller (or a bank card
  check they started in the last hour could still pay). Unpaid checkouts are deleted with the account; finished
  orders stay as payment records without the buyer's id.

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
  condition: 'new' | 'excellent' | 'good' | 'loved'
    | 'refurbished_like_new' | 'refurbished_excellent' | 'refurbished_good'; // refurbished_* only with `refurbished`
  seller: Localized;
  sellerId: string;  // the app hides Buy / Offer / Bid on the user's own listings
  description: string; // as the seller typed it (one language): at least 10 words, max 2000 chars
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
  refurbished?: {  // brand-certified refurbished, sold by the brand's official store account
    warrantyMonths: number; // 0 = brand-inspected, no warranty
  };
  testCertificate?: { // the shop's test report (types with requiresTestCertificate; not on refurbished)
    imageUrl: string;  // the report photo, IMEI / serial blurred (see Shop test certificates)
    shopName: string;  // as read off the letterhead / stamp
    testedAt: string;  // ISO-8601: the date printed on the report
    specs: string[];   // as read, e.g. ["128GB", "Battery 89%"]
  };
};
```

**Certified refurbished listings** belong to a brand's official store account (`seller` e.g.
`{ "en": "Apple Certified", "ar": "Apple المعتمد" }`, `verified: true`). They come only from the
import (`POST /admin/refurbished/import`); sellers can't publish one from the app.

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
        requiresTestCertificate?: boolean;   // listing one needs a shop test certificate (electronics)
      }[];
      brands: string[];                      // every type's brands, de-duplicated
    }
  }
  ```
* Brands and models are suggestions, not a closed list: a seller may type one that isn't listed,
  so `POST /listings` accepts any `brand` / `model` string (trim it, max ~60 chars).
* `requiresTestCertificate` is the switch for the test certificate rule, so the list of types can
  change without an app update. Today (`src/services/mock/catalog.ts`, `testedTypes`): mobiles →
  phones, tablets, smartwatches; electronics → laptops, gaming, tvs, cameras, audio.

#### 2b. `PUT /admin/categories/:id/image` *(admin)*
An admin replaces a category's picture (the dashboard, BACKEND_PLAN B3.8). `multipart/form-data` with field
`image` (JPEG/PNG/WebP, up to 10 MB). The server re-encodes it (≤ 1200 px, no metadata) and `GET /categories`
returns it as `imageUrl` from then on (phones may cache `GET /categories` for 10 minutes).
* **Response (200):** `{ "id": "mobiles", "imageUrl": "https://…" }`
* **Errors:** `FORBIDDEN` (403) for non-admins, `NOT_FOUND` (404) for an unknown category, `VALIDATION` (422) for
  a file that isn't a photo.

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
  GPS → nearest area(s) using these centres. Listings, accounts and filters only ever send **area
  ids** (`cityId`, `locationId`, `cities=` filter), never coordinates, so the backend doesn't need to
  store locations. The one exception is checkout: when the buyer taps "Use my location", the app sends
  the position once to `GET /geocode/reverse` to name the street; don't store or log it.
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
| `refurbished` | `true` | Certified refurbished listings only (`Item.refurbished`): the Refurbished switch, and always on the Certified Refurbished store. |
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
  counts: { all: number; fixed: number; auction: number }; // same `refurbished` + filters, per format (tabs)
  refurbishedCounts: { all: number; refurbished: number }; // same format + filters, without / with `refurbished=true`
  facets: {                    // options that exist in scope (q, category, format, refurbished), before filters
    categories: string[];
    conditions: Condition[];
    cities: { id: string; name: Localized; governorate: Localized }[]; // shown as "البلقاء / السلط"
    byCategory: { [categoryId]: { types: string[]; brands: string[] } };
    maxWarrantyMonths?: number; // longest refurbished warranty in scope; omit when none
  };
}
```
The store and the Home banner show `facets.byCategory` types and brands as quick chips, and
"from N JOD" from the first item of `refurbished=true&sort=price_asc`.

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
  * **Request (JSON):** `category`, `titleAr`, `titleEn`, `priceFils`, `imageUrls` (1–5 URLs from the upload above, cover first), `condition`, `description` (required, see below), `brand?`, `model?`, `type`, `locationId` (area id), `saleType` (`fixed` or `auction`), `auctionEndsAt?` (ISO-8601), `incrementFils?`, `testCertificateId?` (required for types with `requiresTestCertificate`, see below), `pickup` (required, see below).
  * **`pickup`:** `{ phone: string, address: string, notes?: string }`: where the courier collects the item
    when it sells (the same phone and address rules as `DeliveryDetails`; the area is `locationId`, the name the
    seller's). It is copied onto each order, so the assigned courier sees it with the drop-off and nobody types
    anything after the sale. **Never** in `Item` or any listing response: buyers don't see it. The app fills it
    in from the seller's last listing.
  * The seller is the caller: set `sellerId` and `seller` from the token, `status: "active"`.
  * Only accept `imageUrls` that this server issued **to the caller** and that no other listing uses. For
    auctions, `priceFils` is the starting bid.
  * `titleAr` / `titleEn` 2–100 characters; `brand` / `model` up to 60; `priceFils` a whole number above 0.
  * Auctions: `auctionEndsAt` 1 hour to 14 days from now; `incrementFils` at least 100 (default 1000).
    Fixed-price listings ignore both.
  * `condition` must be `new`, `excellent`, `good` or `loved`; `refurbished_*` → `VALIDATION` (422)
    (refurbished stock comes only from the import below).
  * **`description`:** at least **10 words** and at most 2000 characters, else `VALIDATION` (422). A word
    is a whitespace-separated piece with at least one letter or digit (Latin or Arabic), so "- - -" or
    emoji don't count. The app's copy of the rule: `countWords()` / `descriptionValid()` in
    `src/lib/listing.ts`.
  * **`testCertificateId`:** for a type with `requiresTestCertificate`, a certificate from
    `POST /test-certificates` that is the caller's, `passed`, not on another listing, and was checked
    for the same `type`, `brand` and `model` as this listing; otherwise `VALIDATION` (422). Ignored for
    other types. The listing gets `testCertificate` and the certificate is used up.
  * **Response (201):** `Item`

#### Shop test certificates (phones & electronics)

Sellers of phones, laptops, consoles and other electronics a shop can test must show a **test report
from a phone or electronics shop**: a paper with the shop's stamp that names the device (brand, model)
and its specifications. The app has the seller photograph it after choosing the brand and model, sends
it here, and shows the result; Publish stays blocked until it passes. If the seller then changes the
type, brand or model, the app asks them to check it again.

* **`POST /test-certificates` *(Authenticated)***
  * **Request:** `multipart/form-data` with `photo` (JPEG/PNG/WebP, up to 10 MB; the app sends up to
    2000 px, sharp enough to read) and the device the seller chose: `category`, `type`, `brand`,
    `model?` (no field when there is no model).
  * **Response (201):**
    ```ts
    type CertificateCheck = {
      id: string;              // the app sends it as testCertificateId with POST /listings
      status: 'passed' | 'failed';
      problems: (              // empty when passed; the app shows a message for each
        | 'unreadable'         // too blurry / dark / cut off to read
        | 'no_stamp'           // no shop stamp found
        | 'no_shop'            // no shop name or phone number
        | 'device_mismatch'    // brand / model on the paper ≠ the ones sent
        | 'no_specs'           // no specifications (storage, RAM, battery, …)
        | 'too_old'            // no date, a future date, or older than 30 days
        | 'already_used'       // this report is on another listing
      )[];
      shopName?: string;       // as read
      testedAt?: string;       // ISO-8601, the date on the report
      device?: string;         // brand + model as written, e.g. "Apple iPhone 14 Pro"
      specs: string[];         // normalised, e.g. ["128GB", "8GB RAM", "Battery 89%"]
    };
    ```
  * A failed check is a normal **201** with `status: "failed"` (the app shows the problems). Errors are
    only for bad requests: no photo, unknown `category` / `type`, or a type without
    `requiresTestCertificate` → `VALIDATION` (422).
  * Answer within ~10 s (the app's upload timeout is 60 s, but the seller is waiting).
* **How the server checks the photo (OCR + stamp detection)**
  1. **Read the text** with an OCR service that reads Arabic and English, e.g. Google Cloud Vision
     (`DOCUMENT_TEXT_DETECTION`) or Azure AI Vision (Read); not AWS Textract, which has no Arabic
     (comparison: `backend/docs/OCR.md`). Keep the text and the per-word confidence. Too little text or low confidence → `unreadable` (stop here).
  2. **Shop:** a shop name (letterhead or stamp text) and a Jordanian phone number (mobile
     `07[789]XXXXXXX` or landline `0[2356]XXXXXXX`, with or without spaces, Arabic digits too) →
     `shopName`; missing → `no_shop`.
  3. **Stamp:** OCR alone can't see a stamp, so detect it in the image: a round or oval ink mark
     (usually blue, purple or red), often with text around the rim. A first version can be a heuristic
     (colour-segment the ink, look for a roughly circular blob 8–35% of the page width with text
     inside); better, a small image classifier / object detector (e.g. Vertex AI AutoML or Azure Custom
     Vision) trained on a few hundred photos of stamped and unstamped papers. None → `no_stamp`.
  4. **Device:** the text must contain the `brand` (any case and the Arabic spellings, e.g. Apple /
     آبل / ابل, Samsung / سامسونج, Xiaomi / شاومي) and, when sent, the `model` (ignore case and
     spaces; take the longest match, so "iPhone 14 Pro Max" on the paper doesn't pass for "iPhone 14
     Pro") → `device`; else `device_mismatch`.
  5. **Specs:** at least one, e.g. storage (`128GB`, `1TB`, `128 جيجا`), RAM, battery health (`89%`),
     screen size, processor → `specs`; none → `no_specs`.
  6. **Date:** a date on the report (`dd/mm/yyyy`, `yyyy-mm-dd`, Arabic digits) within the last 30
     days and not in the future → `testedAt`; otherwise `too_old`.
  7. **Not reused:** the same photo (perceptual hash) or the same IMEI / serial on another active
     listing → `already_used`.
  8. `passed` only when there are no problems. Store the photo, the OCR text and the result so admins
     can review disputes; reports from shops that keep getting flagged can be blocked.
* **What buyers see** (`Item.testCertificate`): the photo, shop, date and specs. Serve a copy of the
  photo with the IMEI / serial **blurred** (OCR gives its position) and never return the OCR text.
* Refurbished imports (`POST /admin/refurbished/import`) don't need a certificate: the brand
  certifies them.
* **`PATCH /listings/:id` *(Authenticated)***
  * **Request:** `{ "titleAr"?, "titleEn"?, "description"?, "imageUrls"?, "priceFils"?: 50000, "condition"?: "excellent", "pickup"?: { "phone", "address", "notes"? } }`
    (B15.2; same rules as `POST /listings`). `imageUrls` is the whole new list (1–5): photos already on the listing
    and/or new ones from `POST /uploads/listing-photo`; dropped photos are deleted later. The category, type,
    brand, model and sale type can't change. **An auction with bids:** only `pickup` (anything else is
    `VALIDATION`). A new pickup is for orders from now on; orders already placed keep theirs.
  * **Response (200):** `Item`
  * **Errors:** `FORBIDDEN` (403) not the seller; `NOT_FOUND` (404) withdrawn; `OPEN_ORDERS` (409) paid for
    (`reserved`); `ITEM_UNAVAILABLE` (409) sold; `VALIDATION` (422) a refurbished grade, or a new price on an
    auction that has bids.
* **`DELETE /listings/:id` *(Authenticated)***
  * Withdraws the listing: it disappears from search, its page and My listings.
  * **Response:** 204 No Content
  * **Errors:** as for `PATCH`, and `VALIDATION` (422) for an auction that has bids.

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
  unreadCount: number;    // messages from the other person this person hasn't read
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
* **`POST /chats/:id/read` *(Authenticated: either side of the chat)*** → Body: `{ "messageId": "..." }` → 204. This person has read up to that message, and it never moves backward. Only they can see the result: the other side isn't told (no read receipts). A message of another chat: `VALIDATION`.
* **`POST /listings/:id/offers` *(Authenticated)*** → Body: `{ "amountFils": 450000 }` → `{ "offer": Offer, "chatId": "..." }`. Fixed-price `active` listings only (`ITEM_UNAVAILABLE` otherwise, also for brand-store listings and between people who blocked each other); not your own (`FORBIDDEN`). One open offer at a time: while the last one is `pending` or `countered`, a new one is `VALIDATION`.
* **`POST /offers/:id/respond` *(Authenticated: the seller for a `pending` offer, the buyer for a `countered` one)*** → Body: `{ "status": "accepted" | "countered" | "rejected", "counterAmountFils"?: 480000 }` → `Offer` (only the seller may send `countered`)
* **`POST /listings/:id/bids` *(Authenticated)*** → Body: `{ "amountFils": 530000 }` → `Bid` (the item's `priceFils` and `bidCount` update; refetch the item)
  * `VALIDATION` (422) if `amountFils` < current bid + `incrementFils` or the auction has ended; `FORBIDDEN` (403) if the bidder is the seller. Check and update in one transaction so two bids at the same moment can't both win.
  * **Auction end:** when `endsAt` passes, the highest bidder wins: set `auction.winnerId`. The app shows the winner a Pay button; they check out with `POST /orders` like a fixed-price buyer, at the winning bid.
* **`GET /listings/:id/bids`** → `Bid[]`, highest first (anyone can see them)
* Lists the app polls answer `304 Not Modified` to a matching `If-None-Match` (every GET sends an `ETag`).

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
  status: 'awaiting_payment' | 'escrow_held' | 'completed' | 'refunded' | 'cancelled';
  pin?: string;          // 4 digits, buyer only, once escrow_held
  offerId?: string;
  delivery: DeliveryDetails;
  paymentUrl?: string;   // the bank's card-check page, while awaiting_payment (see below)
  createdAt: string;     // ISO-8601
  deliveredAt?: string;  // ISO-8601, once the courier confirms
  // B15.3–B15.4 (buyer and seller both see these):
  courierStatus?: 'to_pickup' | 'picked_up' | 'delivered' | 'failed'; // once a driver is assigned
  cancel?: { reason: CancelReason; note?: string; at: string };            // the buyer cancelled
  itemIssue?: { reason: ItemIssueReason; note?: string; at: string };      // the buyer's report at the door
  deliveryFailed?: { stage: 'pickup' | 'dropoff'; reason: FailReason; note?: string; at: string };
  refundedAt?: string;
};
// Reason ids and their Arabic / English labels: frontend/src/lib/deliveryProblems.ts.

type DeliveryDetails = {
  name: string;    // recipient, 2+ characters
  phone: string;   // Jordanian mobile: 07[789] + 7 digits (the app sends it as typed; store it as 07XXXXXXXX)
  cityId: string;  // area id from GET /cities
  address: string; // street, building, floor: 5–200 characters
  notes?: string;  // for the courier, max 200
};
```

The app remembers the last delivery details on the phone and fills them in next time. Show
`delivery` to the courier (and the pickup the seller gave with the listing) but never to other users.

**Filling the address from the buyer's location.** When checkout opens with no saved address, the
app asks the buyer whether to use their location (there is also a "Use my current location" button
above the fields). It takes one precise GPS fix, picks the area itself (nearest area centre from
`GET /cities`), and asks the server for the street; the buyer then checks the fields, adds the
building and floor, and can change anything. The order is unchanged: it carries only the
`DeliveryDetails` as finally typed, no coordinates.

* **`GET /geocode/reverse?lat=31.95395&lng=35.91063&lang=ar` *(Authenticated)*** → `{ "address": "شارع مكة، تلاع العلي" }`
  * `lat` / `lng`: WGS-84 degrees, 5 decimals. `lang`: `ar` or `en` (the app's language).
  * `address`: street and neighbourhood in that language, without city or country (the app has the
    area), e.g. `"Mecca St, Tla' Al-Ali"`. `""` when the maps service has no street there.
  * Use a reverse-geocoding service, e.g. Google Geocoding API (`latlng=…&language=ar&result_type=route|street_address`),
    HERE, Mapbox, or a self-hosted Nominatim (OpenStreetMap). Keep its API key on the server.
  * **Privacy:** don't store or log the coordinates. Rate-limit per user (e.g. 20 per hour).
  * The app only asks when the fix is accurate to ~150 m (with "approximate location" it fills just the
    area) and only for positions in Jordan; if the request fails, the buyer still gets the area.
  * `VALIDATION` (422) for a missing or out-of-range `lat` / `lng`.
  * **Server (B7.1):** `GEOCODER` in `backend/.env`: `off` (always `""`), `fake` (the nearest area's main street),
    `nominatim` (OpenStreetMap), `google` (Google Geocoding API, the launch choice; `backend/docs/GEOCODING.md`).
    Positions outside Jordan get `""` without a lookup; a failed lookup is `""` too.
    More than 20 an hour per user: `RATE_LIMITED` (429).

**The server prices every order.** The app shows the same breakdown (`calculateCheckoutBreakdown` in
`src/lib/money.ts`) but never sends amounts.

* **`POST /orders` *(Authenticated)*** → Body: `{ "listingId": "mobiles-0", "offerId"?: "...", "delivery": DeliveryDetails }` → `Order` (`status: "awaiting_payment"`).
  * With `offerId`, the offer must be **accepted**, on this listing, and made by this buyer; its `amountFils` becomes `itemPriceFils`. Otherwise `VALIDATION` (422).
  * An auction: only after it ended, only for `auction.winnerId`, at the winning bid. Otherwise `ITEM_UNAVAILABLE` (409).
  * The listing must be `active` and not from a blocked user (`ITEM_UNAVAILABLE`); not the buyer's own (`FORBIDDEN`); `delivery` complete and valid (`VALIDATION`).
  * Response **201**. Checking out again (a changed address, an offer accepted since) updates the buyer's
    unpaid order for that listing and returns it with the same `id`, so unpaid orders don't pile up.
* **`POST /orders/:id/pay` *(Authenticated, the order's buyer)*** → Body: `{ "cardToken": "..." }` (provider token, or `"saved"` to charge the account's saved card) → `Order`
  * Paid: `status: "escrow_held"`, with the delivery `pin`. The listing becomes `reserved`.
  * **Bank card check (3-D Secure):** Jordanian cards usually need it, so with MEPS expect this path. Return the order still `awaiting_payment` with `paymentUrl` (the bank's page). The app opens it in the browser and then polls `GET /me/orders` / `GET /orders/:id`. When the bank calls back, the server sets `escrow_held` (or leaves `awaiting_payment` if it failed, so the buyer can pay again). The bank's return page can simply say "Payment done, go back to Madmoon Deals".
  * Two buyers racing: the first payment wins; the other gets `ITEM_UNAVAILABLE` (409) and isn't charged. Do the check and the status change in one transaction.
  * **Server (B7.4):** a payment that succeeds after the listing was bought (a slow card check) is refunded at
    once and the bank's page says so. The bank sends the browser to `GET /v1/payments/callback?ref=…`; the
    server asks the provider for the result (never trusting the URL), so a repeated callback changes nothing.
  * Errors: `PAYMENT_DECLINED` (402) card declined; `VALIDATION` (422) unknown `cardToken` or the order isn't
    `awaiting_payment`; `NOT_FOUND` (404) not the buyer's order; `ITEM_UNAVAILABLE` (409); `INTERNAL` (503)
    card payments not switched on on the server (`PAYMENT_MODE`, `backend/docs/PAYMENTS.md`).
* **`GET /me/orders` *(Authenticated)*** → `Order[]` (Buyer order history, newest first, up to 100)
* **`GET /me/sales` *(Authenticated)*** → `Order[]` (Seller sales history: paid orders only, newest first). For the
  seller an order has **no `pin`**, and `delivery` is only `{ name, cityId }`: the buyer's phone and address
  are for the courier. Once delivered: `payout: { status: "pending" | "paid" | "failed", amountFils }` (B15.9).
  The app's **My sales** screen shows it; a sale appears the moment the buyer pays (push `type: "sale"`).
* **`GET /orders/:id` *(Authenticated)*** → `Order` (the buyer's, with the delivery `pin`; or the seller's paid
  order, shaped as in `/me/sales`). Anyone else: `NOT_FOUND`.
* **`GET /offers/:id` *(Authenticated, buyer or seller)*** → `Offer` (Checkout loads the accepted offer to show its price)
* **`POST /courier/confirm-delivery` *(Authenticated, `user.role === "courier"`)*** → Body: `{ "orderId": "SA-123456", "pin": "8492" }` → `Order` (`status: "completed"`, `deliveredAt` set; escrow funds released to the seller).
  * Errors: `INVALID_PIN` (422) wrong PIN, nothing released; `VALIDATION` (422) order not in `escrow_held`; `NOT_FOUND` (404); `FORBIDDEN` (403) not a courier.
  * The listing becomes `sold`.
  * The PIN check and release happen **only on the server**. Rate-limit attempts per order (e.g. lock after 5 wrong PINs) so a PIN can't be guessed.
  * **Server (B7.6):** 5 tries per order (counted before the PIN is compared, so guesses sent at once don't get
    more); then `RATE_LIMITED` (429) until Madmoon Deals support unlocks it, even for the right PIN. `orderId` is
    case-insensitive. An order assigned to another courier is `NOT_FOUND`. The seller's payout is the item
    price (Madmoon Deals takes no seller fee; the buyer pays protection and delivery).
* **`POST /orders/:id/cancel` *(the order's buyer)*** → Body: `{ "reason": CancelReason, "note"?: string }` → `Order`
  (`cancelled`, with `cancel`). B15.3: allowed while unpaid, or paid until the driver has picked the item up:
  the money goes back at once, the listing is on sale again, the seller (and the assigned driver) get a push.
  `reason: "other"` needs a `note` (3–500 characters). Picked up or later: `VALIDATION` (422): report a problem
  at the door instead. Not the buyer: `NOT_FOUND`.
* **`POST /orders/:id/problem` *(the order's buyer)*** → Body: `{ "reason": ItemIssueReason, "note"?: string }` → `Order`
  (with `itemIssue`). B15.4: only while the driver has the item (`courierStatus: "picked_up"`): the buyer
  doesn't give the PIN and says why; the driver gets a push and sees it on the delivery; admins see it in the
  problems queue.
* **Refunds:** if the item never arrives, support/admin moves the order to `refunded`, the escrow is returned to the buyer and the listing goes back to `active` (no app endpoint).
  * **`POST /admin/orders/:id/refund`** *(admin)* → `Order` (`refunded`). Only `escrow_held` orders (after delivery
    the money has gone to the seller): otherwise `VALIDATION`.
  * **`POST /admin/orders/:id/unlock-pin`** *(admin)* → `Order`: the courier gets 5 new PIN tries.
* **`User.role`**: optional, `"courier"` for courier accounts. Couriers see only the courier screens
  (below), never browsing, selling or buying.

#### The seller's bank account *(SECURITY_PLAN S3.7)*

Where a seller's money goes after delivery (an admin sends a bank transfer, `POST /admin/payouts/:id/paid`). Customers only.

* **`GET /me/payout-account`** → `{ confirmWith: "password" | "code", account: { holderName, ibanLast4, heldUntil? } | null }`. Never the whole IBAN.
* **`PUT /me/payout-account`** → Body: `{ holderName, iban, password? , code? }` → the same shape. A valid Jordanian IBAN (spaces, dashes and
  Arabic digits are fine). `confirmWith: "password"` needs `password`; `"code"` (Google / Apple accounts) needs `code` from the call below.
  Replacing an account sets `heldUntil` (24 hours: nothing is sent until then). The person always gets a push and an email.
  **Errors:** `VALIDATION` (422), `INVALID_CREDENTIALS` (422: not 401, the app must not sign out), `INVALID_CODE` (422), `RATE_LIMITED` (429, 5 an hour).
* **`POST /me/payout-account/code`** → 204: emails a code (`confirmWith: "code"` accounts only; others get 422).

### Couriers (drivers) *(backend: BACKEND_PLAN B14.3–B14.6; the app's courier mode: B14.7)*

Couriers are Madmoon Deals staff. **Nobody signs up as a courier:** an admin creates the account with a company
email (the staff domain, e.g. `@sahla.jo`) and an invite code is emailed; the courier sets a password with
`POST /auth/reset-password` (the app's normal "forgot password" screens) and then logs in with
`POST /auth/login`. `POST /auth/send-otp` and `POST /auth/signup` refuse staff-domain emails (`VALIDATION`).
With `role: "courier"` the app shows only these screens; every customer endpoint (listings, offers, chats,
orders, saved items) answers `FORBIDDEN` (403) for a courier.

```ts
type Delivery = {
  orderId: string;                  // "SA-123456"
  status: 'to_pickup' | 'picked_up' | 'delivered' | 'failed';
  itemTitle: Localized;
  itemImageUrl: string;
  pickup: DeliveryDetails;          // from the order: the seller's name, the listing's area, and the phone,
                                    // address and notes given with the listing (a store: set in the dashboard)
  dropoff: DeliveryDetails;         // the buyer's delivery details from the order
  assignedAt: string;               // ISO-8601
  pickedUpAt?: string;
  deliveredAt?: string;
  buyerIssue?: { reason: ItemIssueReason; note?: string; at: string }; // the buyer's report at the door
  failed?: { stage: 'pickup' | 'dropoff'; reason: FailReason; note?: string; at: string };
};
```

* **`GET /courier/deliveries`** *(courier)* → `Delivery[]`: the orders assigned to me that aren't delivered
  yet, plus today's delivered ones, oldest assignment first. Pickup and drop-off are shown **only** to the
  assigned courier.
* **`POST /courier/deliveries/:orderId/picked-up`** *(courier)* → `Delivery` (`picked_up`). `NOT_FOUND` if
  it isn't assigned to me; `VALIDATION` if it isn't `to_pickup`.
* **`POST /courier/confirm-delivery`** *(above)*: the buyer tells the courier the 4-digit PIN at the door;
  a correct PIN completes the order (`delivered`), a wrong one is `INVALID_PIN`, five wrong ones lock it.
  Not while the delivery is `failed` (`VALIDATION`).
* **`POST /courier/deliveries/:orderId/failed`** *(courier)* → Body: `{ "reason": FailReason, "note"?: string }` →
  `Delivery` (`failed`). B15.4: the driver can't finish. Before pickup the reason comes from the pickup list
  (seller not there, refused, not as listed, damaged, wrong pickup address, other), after pickup from the drop-off
  list (buyer not there, refused: defect / not as described / wrong item, changed mind, wrong address, other);
  a reason from the other list is `VALIDATION`; `other` needs a note. The buyer and seller get a push with the
  reason; the order waits in the admins' problems queue. Today's failed ones stay on the driver's list.
* **Problems queue (admin):** `GET /admin/orders?problems=true` (each order has `problem: true`; the order page
  shows `cancel`, `itemIssue`, `deliveryFailed`, `problemResolution`).
  **`POST /admin/orders/:id/resolve-problem`** → Body: `{ "action": "retry", "courierId"?: "..." }` (back to
  where it stopped: at the seller → `to_pickup`, with the driver → `picked_up`; optionally another driver) or
  `{ "action": "refund", "relist"?: boolean }` (money back; `relist: false` keeps a faulty item off sale) →
  `Order`. Logged in the audit log with the reasons. No open problem: `VALIDATION`.
* **Nobody types an address after the sale.** An admin picks the paid order and the driver in the dashboard (the
  Orders list or the order page); the driver's screen then shows the **pickup** and the **drop-off** from the order:
  the drop-off is the buyer's `DeliveryDetails` from checkout, the pickup was copied from the listing's `pickup`
  (a brand store's: `POST /admin/refurbished/stores/:id/pickup`) when the order was placed. The seller sees it on
  the sale (`GET /me/sales` → `pickup`). Orders placed before pickups came with listings show the seller's name
  and the listing's area with an empty `phone` and `address`.
* **`POST /admin/orders/:id/assign`** *(admin)* → Body: `{ "courierId": "..." }` → `Order`. Paid orders not
  picked up yet (it can be reassigned until then); the courier must be an active courier account.
* `orderId` in the courier paths is case-insensitive. "Today" for delivered ones is Jordan time.
* **Courier accounts (admin):** `GET /admin/couriers` → `{ id, name, email, active, createdAt }[]`;
  `POST /admin/couriers` with `{ name, email }` (staff domain only, else `VALIDATION`; already a courier:
  `EMAIL_TAKEN`) → 201 and the invite code is emailed; `POST /admin/couriers/:id/disable` → 204 (signed out at
  once, can't log in); `POST /admin/couriers/:id/enable` → 204 (can log in again; `VALIDATION` when already
  active).

### Safety: report and block

**Required by the App Store** (guideline 1.2) for apps where people post listings and chat: users must
be able to report content and block people, and the team must act on reports within 24 hours.

* **`POST /reports` *(Authenticated)*** → Body: `{ "targetType": "listing" | "user", "targetId": "...", "reason": "scam" | "prohibited" | "offensive" | "wrong_info" | "other", "details"?: "max 500 chars" }` → 204
  * The app offers it on every product page ("Report this listing") and in the chat menu (the other person).
  * `NOT_FOUND` (404) for an unknown target, `VALIDATION` (422) for an unknown reason.
  * Store with the reporter's id and time and show them in the admin tool. Hide a listing quickly when several people report it (the server: 3 different reporters hide it from browsing until an admin looks). Only reports no admin has handled count: a listing an admin kept needs 3 new reporters to be hidden again (Admin dashboard → Review queues).
* **`POST /me/blocked` *(Authenticated)*** → Body: `{ "userId": "..." }` → 204 (blocking twice is fine; yourself is `VALIDATION`)
* **`GET /me/blocked` *(Authenticated)*** → `{ "id": string, "name": string }[]` (Profile → Blocked users)
* **`DELETE /me/blocked/:userId` *(Authenticated)*** → 204
* **What a block does, both ways:** hide each other's listings (`GET /listings`) and chats (`GET /chats`); refuse messages, offers and orders between them (`FORBIDDEN` / `ITEM_UNAVAILABLE`). Orders already paid continue.

### Certified Refurbished import (admin dashboard & brand systems)

Refurbished stock never comes from the app. Each brand has an official **store account** (its
`id` is the listings' `sellerId`, e.g. `store-apple`; its name is their `seller`, e.g. "Apple
Certified"). Its stock arrives in one of two ways, both through the same endpoint:

1. **Admin dashboard → Excel.** An admin uploads the store's sheet (columns =
   `docs/refurbished-import-template.csv`; in Excel save it as "CSV UTF-8"). The dashboard sends it
   to `POST /admin/refurbished/stores/:id/import` (Admin dashboard → Certified Refurbished stores)
   with `dryRun: true` to show the problems per row, then again without `dryRun` to publish.
2. **Brand's system → API.** The brand calls the endpoint itself with its store API key, e.g.
   nightly or whenever stock or prices change.

The app's reference copy of the row rules is `validateImportRow()` / `importRowToItem()` in
`src/lib/refurbishedImport.ts` (the mock store is imported through it).

* **`POST /admin/refurbished/import`** *(Authenticated: an admin, or the store's API key)*
  * **Request (JSON):**
    ```ts
    {
      storeId: string;              // "store-apple"; a store API key may only import its own store
      mode?: 'upsert' | 'replace';  // default upsert. replace = the sheet is the store's whole stock:
                                    // its listings missing from `items` are withdrawn
      dryRun?: boolean;             // check every row, save nothing (the dashboard's preview)
      items: {                      // up to 1000 per request
        sku: string;                // the store's own id (≤ 64); same sku again = update that listing
        titleEn: string;            // ≤ 120
        titleAr: string;            // ≤ 120
        category: string;           // category id (GET /categories)
        type: string;               // item type id of that category (GET /categories/filters)
        brand: string;              // ≤ 60
        model?: string;             // ≤ 60
        grade: 'like_new' | 'excellent' | 'good'; // → condition refurbished_<grade>
        warrantyMonths: number;     // whole months 0–36; 0 = brand-inspected, no warranty
        priceJod: number;           // JOD, up to 3 decimals (Excel-friendly) → priceFils
        imageUrls: string[];        // 1–5 public https URLs, cover first; Excel: one cell, "|" between URLs
        locationId: string;         // area id (GET /cities), where the store ships from
        description: string;        // at least 10 words, ≤ 2000 characters (same rule as POST /listings)
      }[];                          // always fixed price: rows with auctionEndsAt / auctionIncrementJod
                                    // (the old template) are refused with a row error
    }
    ```
  * **Response (200):**
    ```ts
    {
      dryRun: boolean;
      created: number;   // new listings
      updated: number;   // existing skus whose fields changed
      withdrawn: number; // replace mode: the store's listings not in this import
      errors: {          // rows with errors are skipped; the others are still imported
        row: number;     // 1-based position in `items` (Excel row = row + 1, after the header)
        sku?: string;
        field: string;   // e.g. "priceJod"
        message: string; // e.g. "Above 0, at most 3 decimals"
      }[];
    }
    ```
  * **Each imported row becomes an `Item`:** `id` = server-generated (stable per `storeId` + `sku`),
    `condition: "refurbished_<grade>"`, `refurbished: { warrantyMonths }`, `seller` / `sellerId` = the
    store, `verified: true`, `status: "active"`, `saleType: "fixed"` (never an auction).
  * **Updating** a sku changes its listing in place (price, photos, warranty, …), so Saved items and
    links keep working. A sku with an open order (paid, not delivered) is not changed; the row gets
    an error. A sold sku isn't reused either (error): restocked items need a new sku. Copy the photos to Madmoon Deals' CDN instead of linking the brand's URLs.
  * **Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403) for another store's id, `NOT_FOUND` (404) for
    an unknown `storeId`, `VALIDATION` (422) for a malformed body or more than 1000 items. Row
    problems are not errors: they come back in `errors` with status 200.
* **`DELETE /admin/refurbished/:storeId/:sku`** *(same auth)* → 204. Withdraws one listing (sold
  out elsewhere). Withdrawn listings leave browsing, `GET /listings/:id` answers `NOT_FOUND`, and
  `ids=` skips them, unless an order is open, in which case they stay until it completes.

### Admin dashboard *(backend: BACKEND_PLAN B8.1; the dashboard web app is `admin/`)*

The dashboard is a separate website on this same API. Every endpoint marked *(admin)* needs a
**dashboard token**: the app's log-in token never opens `/v1/admin/*` (it gets `FORBIDDEN` 403, so the
app doesn't sign out over it), and a dashboard token opens nothing else (`UNAUTHORIZED` 401 on app
endpoints). Admin accounts are made with `npm run staff -- admin "<name>" <email>` (staff email domain);
the invite code sets the password through the app's reset screens.

**Log-in: two steps**
* **`POST /admin/auth/login`** → Body: `{ "email": "...", "password": "..." }` →
  `{ challenge: string, setup?: { secret: string, otpauthUrl: string } }`.
  * `challenge` is a ticket for the second step, valid 5 minutes.
  * `setup` is there until the admin's authenticator app is set up (the first log-in, or after
    `npm run staff -- reset-2fa <email>`): show `otpauthUrl` as a QR code (and `secret` to type in). It
    stays the same until a code from it is accepted.
  * **Errors:** `INVALID_CREDENTIALS` (401), `FORBIDDEN` (403) for a right password on a non-admin or
    suspended account, `RATE_LIMITED` (429) after 10 tries in 15 minutes per IP + email.
* **`POST /admin/auth/verify`** → Body: `{ "challenge": "...", "code": "123456" }` (the 6 digits from
  the authenticator app, any of Google Authenticator, Microsoft Authenticator, 1Password…) →
  `{ token: string, expiresInHours: 12, admin: Admin }`. Send `Authorization: Bearer <token>`.
  * Each code works once. A code from 30 seconds before or after is accepted (phone clocks drift).
  * **Errors:** `INVALID_CODE` (422) for a wrong or already used code, `UNAUTHORIZED` (401) for an
    expired ticket (log in again), `RATE_LIMITED` (429) after 10 tries in 15 minutes per admin.
* **`GET /admin/me`** *(admin)* → `Admin` = `{ id, name, email, adminRole, permissions }` (B15.7).
* **`POST /admin/auth/logout`** *(admin)* → 204.

**Development only, `ADMIN_2FA=off`:** `POST /admin/auth/login` answers the second step's response right away
(`{ token, expiresInHours, admin }`, no `challenge`), so email + password are enough. The server refuses to
start with it in production.

The token lasts 12 hours, with no refresh: the dashboard logs in again. Demoting or suspending an admin
takes effect on their next request.

**Admin types (B15.7).** `adminRole`: `owner` (everything; the only one who manages admins), `operations`
(orders, drivers, retrying delivery problems, stores, category pictures), `support` (support chat, reports,
suspicious accounts, certificates, suspending, retrying delivery problems), `finance` (refunds, payouts,
analytics). Every admin sees the overview, orders and users. `permissions` lists what the type opens:
`orders`, `dispatch`, `refund`, `payouts`, `analytics`, `reports`, `risk`, `certificates`, `suspend`, `stores`,
`categories`, `couriers`, `support`, `admins` (the server's table: `backend/src/modules/admin/permissions.ts`).
An endpoint the type doesn't open is `FORBIDDEN` (403); an admin without a type opens nothing.
`POST /admin/orders/:id/resolve-problem` needs `dispatch` to retry and `refund` to refund.
* **`GET /admin/admins`** *(owner)* → `{ id, name, email, adminRole, permissions, active, twoFactor, createdAt }[]`.
* **`POST /admin/admins`** *(owner)* → Body: `{ name, email, adminRole }` → 201. Staff domain only; the invite code
  is emailed (they set a password, then the authenticator on the first log-in). Already an admin: `EMAIL_TAKEN`.
* **`POST /admin/admins/:id/role`** `{ adminRole }`, **`/disable`** (signs them out at once), **`/enable`** *(owner)*.
  Not on yourself (`VALIDATION`); the last active owner can't lose the type. All in the audit log.
  From the terminal: `npm run staff -- admin "Name" name@sahla.jo [owner|operations|support|finance]` (default owner).

**Overview.** **`GET /admin/stats`** *(admin)* → business numbers for the dashboard's first page (technical
health is in the error tracker and the host's metrics, not here):
```ts
type Stats = {
  users: { total: number; newThisWeek: number };          // customers (not staff)
  listings: { active: number; newThisWeek: number };      // on sale and not hidden by reports
  orders: {
    awaitingPayment: number;
    escrowHeld: { count: number; totalFils: number };     // paid, money held until delivery
    toAssign: number;                                     // paid, no courier yet
    completedLast30Days: { count: number; totalFils: number };
  };
  payouts: { pending: { count: number; amountFils: number } }; // to send to sellers
  queues: {
    hiddenByReports: number;  // listings 3 people reported
    reportedListings: number; // listings with reports no admin handled yet (hidden or not)
    reportedUsers: number;    // accounts with reports no admin handled yet
    riskFlags: number;        // open suspicious-account flags
    certificates: number;     // passed on the text, stamp not checked, listing on sale
  };
  couriers: { active: number };
};
```

**Analytics.** **`GET /admin/analytics`** *(admin)* → Query `days` = `7` | `30` (default) | `90`, else `VALIDATION`.
Days are Jordan days (`Asia/Amman`), the last one is today.
```ts
type Totals = { signups: number; listings: number; paidOrders: number; salesFils: number; reports: number };
type Analytics = {
  days: 7 | 30 | 90; from: string; to: string; timeZone: 'Asia/Amman'; // "2026-11-01"
  totals: Totals;                     // the period
  previous: Totals;                   // the same number of days right before it
  daily: ({ day: string } & Totals)[];// one row per day, oldest first, days with nothing included
  ordersByStatus: Record<'awaiting_payment' | 'escrow_held' | 'completed' | 'refunded', number>; // orders started in the period
  customersBySignIn: Record<'email' | 'google' | 'apple', number>; // all customers, now
  listingsByCategory: { category: string; count: number }[];       // on sale now, largest first
  listingsByArea: { areaId: string; count: number }[];             // on sale now, largest first
};
```
`signups` = customers (not staff); `listings` = people's listings (a store's sheet would swamp the trend);
`paidOrders` / `salesFils` = orders by the day they were paid, at their total, later refunds included;
`reports` = reports about listings and accounts.

**Orders (support).** Lists are newest first, at most `limit` (1–100, default 50); `before` = the last row's
`createdAt` for the next page.
* **`GET /admin/orders`** *(admin)* → `AdminOrderSummary[]`. Query: `q` (an order number `SA-123456`, or part
  of the buyer's / seller's email or name), `status` (`awaiting_payment` | `escrow_held` | `completed` |
  `refunded`), `unassigned=true` (paid, no courier yet).
  `AdminOrderSummary = { id, status, courierStatus, item: { id, title, imageUrl }, totalFils, buyer: Person | null,
  seller: Person | null, courier: { id, name } | null, createdAt }`, `Person = { id, name, email }` (a brand
  store as seller has `email: ""`; `null` = a deleted account).
* **`GET /admin/orders/:id`** *(admin)* → the summary plus the price breakdown, `offerId`, `pinAttempts`,
  `pinLocked`, the full `delivery` and `pickup` addresses (phone included: support may call), every step's
  time (`paidAt`, `assignedAt`, `pickedUpAt`, `deliveredAt`, `refundedAt`), `payments[]` (`{ id, provider,
  status, amountFils, createdAt }`) and `payout`. **Never the delivery PIN.** `NOT_FOUND` (404).
* Refund, unlock PIN and assign: see Phase 6 (Checkout, Orders & Escrow) and Couriers above.

**Payouts.** The seller's money after delivery. Until the payment provider pays sellers itself (D2), an
admin sends a bank transfer and records it.
* **`GET /admin/payouts`** *(admin)* → `{ id, orderId, itemTitle, seller: Person | null, amountFils, status,
  createdAt, paidAt }[]`. `status` = `pending` (default, oldest first: pay in that order) | `paid` | `failed`.
* **`POST /admin/payouts/:id/paid`** *(admin)* → Body: `{ "reference": "<the bank transfer's number>" }` → the
  payout, `paid`. The reference goes to the audit log (on the order). `VALIDATION` (422) when it's already paid
  or the reference is missing; `NOT_FOUND` (404).

**Users.**
* **`GET /admin/users`** *(admin)* → `{ id, name, email, method, role, verified, suspended, cityId, createdAt }[]`.
  Query: `q` (part of the email or name, or a user id), `suspended=true|false`.
* **`GET /admin/users/:id`** *(admin)* → the same plus `listings` (count per status), `counts: { orders, sales,
  reportsAboutUser, reportsAboutListings, blockedBy }` (orders and sales that were paid), `riskFlags` (latest 5),
  `recentOrders`, `recentSales` (latest 5: `{ id, status, totalFils, createdAt }`).
* **`POST /admin/users/:id/suspend`** and **`/unsuspend`** *(admin)* → Body: `{ "reason": "..." }` (3–500
  characters, kept in the audit log) → the user. Suspending signs them out on every phone (their pushes stop),
  log-in answers `FORBIDDEN`, and **their listings come off sale**: gone from `GET /listings`, and orders, offers
  and bids on them answer `ITEM_UNAVAILABLE` (409). Paid orders carry on (refund them if needed). Unsuspending
  puts everything back. `VALIDATION` (422) for yourself, a staff account (couriers: the courier endpoints;
  admins: `npm run staff`), or no change.

**Review queues** *(BACKEND_PLAN B8.3)*. Every decision needs `{ "reason": "..." }` (3–500 characters, kept in
the audit log) unless said otherwise. Queues return at most 100 entries.
* **`GET /admin/reports/listings`** *(admin)* → listings with open reports, hidden ones first, then the most
  reports: `{ listing: { id, title, imageUrl, priceFils, status, reportHidden, createdAt }, seller: (Person &
  { suspended }) | null, reasons: { [reason]: count }, reports: Report[] }[]`, `Report = { id, reporter: { id, name },
  reason, details, createdAt }` (newest first). A brand store as seller has `email: ""`.
* **`POST /admin/listings/:id/keep`** *(admin)* → 204. Nothing wrong: back in browsing if it was hidden; its open
  reports are closed (`resolution: kept`), so they no longer count towards hiding it.
* **`POST /admin/listings/:id/remove`** *(admin)* → 204. Breaks the rules: `withdrawn` for good, reports closed
  (`removed`), and the seller gets a push (`data.type: "sale"`). `OPEN_ORDERS` (409) when paid for and waiting for
  delivery (refund first), `ITEM_UNAVAILABLE` (409) when sold, `VALIDATION` (422) when already off sale.
* **`GET /admin/reports/users`** *(admin)* → accounts with open reports about them, the most reports first:
  `{ user: Person & { suspended, createdAt }, reasons, reports: Report[] }[]`.
* **`POST /admin/reports/users/:id/dismiss`** *(admin)* → 204 (`VALIDATION` when there are no open reports).
  Suspending the account (`POST /admin/users/:id/suspend`) also closes its open reports (`suspended`) and marks
  its open risk flags `actioned`.
* **`GET /admin/risk-flags`** *(admin)* → Query `status` = `open` (default; the highest score first) | `dismissed`
  | `actioned` (the latest review first). `{ id, user: Person & { suspended, createdAt }, score, signals: { kind,
  points, details }[], aiSummary, status, reviewedBy: { id, name } | null, reviewNote, createdAt, reviewedAt }[]`.
* **`POST /admin/risk-flags/:id/review`** *(admin)* → Body: `{ "status": "dismissed" | "actioned", "note": "..." }`
  → 204. Once only (`VALIDATION` after). The checker can flag the account again later if its score is still high.
* **`GET /admin/certificates`** *(admin)* → test certificates that passed on the text but whose stamp nobody has
  checked, on a listing that is on sale or paid for, the oldest first: `{ id, listing: { id, title, imageUrl,
  priceFils, status } | null, seller: Person, device: { category, type, brand, model }, read: { shopName,
  shopPhone, testedAt, device, specs }, blurredUrl, createdAt }[]`.
* **`GET /admin/certificates/:id/photo`** *(admin)* → the original photo (IMEI readable), `Cache-Control: private,
  no-store`. The dashboard loads it with its token; it is never a public URL.
* **`POST /admin/certificates/:id/approve`** *(admin)* → 204, no body. The stamp is fine.
* **`POST /admin/certificates/:id/reject`** *(admin)* → 204. The certificate fails, the listing comes off sale and
  the seller gets a push. The same photo or IMEI / serial can't pass on a new listing (`already_used`).
  `OPEN_ORDERS` (409) when paid for. Both: `VALIDATION` (422) when already reviewed.

**Certified Refurbished stores** *(BACKEND_PLAN B8.4; the same as `npm run store`)*. Under
`/admin/refurbished/`, so request bodies may be up to 5 MB.
* **`GET /admin/refurbished/stores`** *(admin)* → `{ id, nameEn, nameAr, onSale, lastImportAt, keys: StoreKey[],
  createdAt }[]`, `StoreKey = { id, label, createdAt, lastUsedAt, revokedAt }` (never the key itself).
* **`POST /admin/refurbished/stores`** *(admin)* → Body: `{ id: "store-<brand>", nameEn, nameAr }` → 201, the store.
  `VALIDATION` for another id format or an id that exists.
* **`POST /admin/refurbished/stores/:id/pickup`** *(admin)* → Body: `{ phone, cityId, address }` → the same,
  normalized. Where couriers collect this store's orders: copied onto each new order (orders already placed
  keep theirs). `GET /admin/refurbished/stores` returns it as `pickup` (`null` until set).
* **`POST /admin/refurbished/stores/:id/keys`** *(admin)* → Body: `{ "label": "Apple stock system" }` → 201,
  `StoreKey & { key }`: the only time `key` (`sahla_sk_…`) is shown; only its hash is kept.
* **`POST /admin/refurbished/stores/:id/keys/:keyId/revoke`** *(admin)* → the key, revoked (it gets 401 at once).
* **`GET /admin/refurbished/stores/:id/imports`** *(admin)* → the latest 50 imports: `{ id, source ("Admin: Sara",
  "Key: Apple stock system", "Command line"), mode, created, updated, withdrawn, errors, createdAt }[]`. Previews
  (`dryRun`) aren't kept.
* **`POST /admin/refurbished/stores/:id/import`** *(admin)* → Body: `{ csv: string, mode?: "upsert" | "replace",
  dryRun?: boolean }` → the import response above plus `rows` (how many rows the sheet had). `csv` is the
  store's sheet (the template's columns) saved from Excel as "CSV UTF-8": the server reads it like `npm run store
  -- import`. The dashboard sends `dryRun: true` first (the preview), then the same without it to publish.
  `VALIDATION` for a file that isn't CSV, a header that isn't the template's, no rows, or more than 1000 rows.

**Audit log.** Every change an admin makes is recorded (who, what, when, from which IP, and the
details): log-ins, refunds, PIN unlocks, courier assignments, payouts sent, suspensions, courier accounts,
category pictures, review decisions, stores, keys and imports.
* **`GET /admin/actions`** *(admin)* → `AdminAction[]`, newest first. Query: `targetType` and `targetId`
  (e.g. `order` + `SA-123456`: the history of one order), `before` (an ISO time: the last row's
  `createdAt`, for the next page), `limit` (1–100, default 50).
  ```ts
  type AdminAction = {
    id: string;
    admin: { id: string; name: string; email: string } | null; // null once that account is deleted
    action: string;          // "admin.login", "admin.2fa_setup", "order.refund", "order.unlock_pin",
                             // "order.assign", "payout.paid", "user.suspend", "user.unsuspend",
                             // "courier.create", "courier.disable", "courier.enable", "category.image",
                             // "listing.keep", "listing.remove", "user.reports_dismiss",
                             // "risk_flag.dismissed", "risk_flag.actioned", "certificate.approve",
                             // "certificate.reject", "store.create", "store.key_create",
                             // "store.key_revoke", "store.import"
    target?: { type: string; id: string }; // "order", "user", "category", "listing", "certificate", "store"
    details?: unknown;       // e.g. { before, after } for an assignment or a picture
    createdAt: string;
  };
  ```

---

## Live Updates & Notifications

### The notification inbox (2026-11-10, BACKEND_REVIEW M2)

Every push is also kept, in Arabic and English, so nothing is missed with notifications off, on a new phone or when a push is lost. Chat messages and support replies are not copied: those screens have their own unread counts. Kept 90 days.

* `GET /me/notifications?lang=ar|en` (signed in, customers and drivers): `{ unreadCount, items: [{ id, type, refId, title, body, read, createdAt }] }`, newest first, at most 100. `type` and `refId` are the push's `data.type` and `data.id`: a tap opens the same screen.
* `POST /me/notifications/read` → 204: everything in the inbox is read (the app calls it when the inbox opens).
* `GET /v1/me/live` also sends `{ "type": "notifications" }` when one arrives or is read on another phone: fetch the inbox again.

**Today (works with any REST backend):** screens that change while open ask again on a timer, only
while they're on screen and the app is in the foreground (`config.pollMs`):

| Screen | Requests | Every |
|---|---|---|
| Auction bidding | `GET /listings/:id`, `GET /listings/:id/bids` | 15 s with the live connection below, 3 s without it |
| Chats / open conversation, support | `GET /chats`, `GET /chats/:id/messages`, `GET /support` | 30 s with the live connection below, 5 s without it |
| The unread number on the Chats tab | `GET /chats` | 30 s |
| Order tracking | `GET /me/orders` | 15 s |

These endpoints must therefore be cheap. Optional: support `ETag` / `If-None-Match` → `304`.

**Live auctions: `GET /v1/listings/:id/live` (WebSocket; `wss://` in production).** Each new bid arrives as it's saved. No
log-in: it carries only what the public `GET /listings/:id/bids` shows. It goes one way: anything sent to the server closes the
connection (1008).

```jsonc
{ "type": "bid", "bid": { /* one entry of GET /listings/:id/bids */ }, "auctionEndsAt": "..." } // the price is now bid.amountFils; a late bid moves the end
{ "type": "alive" }                                                      // every 25 s: no message for 60 s means the connection is dead
```

* **Refused with:** 404 (not a live auction's address, a withdrawn listing, a fixed-price listing), 403 (a browser page from another
  website), 429 (600 connections a minute from one address), 503 (1 000 open from one address, `LIVE_MAX_CONNECTIONS` on the server, 2 000 by default, or the server
  isn't hearing the database right now).
* **Closed with:** 1013 (the server lost the database: reconnect), 1001 (the server is restarting: reconnect), 1008 / 1009 (the client sent something).
* **The app** keeps polling behind it, and after every (re)connection fetches both `GET`s once: bids can be missed while disconnected.

**Chats and support: `GET /v1/me/live` (WebSocket).** One per signed-in phone while the app is in front. The token goes in the `Authorization: Bearer` header, never the address. It only says what changed, never the content; the app then fetches it through the normal endpoints:

```jsonc
{ "type": "chat", "chatId": "..." } // a new message, an offer step, or this person read it on another phone
{ "type": "support" }               // a reply, or this person wrote from another phone
{ "type": "alive" }                 // every 25 s, as above
```

* **Refused with:** 401 (no valid token), 403 (suspended), and 403 / 429 / 503 as above.
* **Closed with:** 4401 (the session ended: log-out, password reset, deletion, suspension; noticed within 25 seconds), 4408 (more than 5 connections for one person: the oldest goes), and 1013 / 1001 / 1008 / 1009 as above.

**Push notifications** (Firebase Cloud Messaging; backend B9.2–B9.3, `backend/docs/PUSH.md`). Android
now; iPhones once an Apple push key is added to Firebase.

* **`POST /me/devices` *(Authenticated)*** → Body: `{ "token": "<FCM token>", "platform": "android" | "ios", "language": "ar" | "en" }` → 204.
  Sent after sign-in, at every launch and whenever the token changes. `language` (default `en`) is the
  app's language on that phone: the pushes are written in it.
* **`DELETE /me/devices/:token` *(Authenticated)*** → 204. Sent on log-out.
* **Server:** a token belongs to the account last signed in on that phone (registering it again
  moves it) and to that sign-in: log-out, password reset, account deletion or an expired session stop
  its pushes. Deleting someone else's token or an unknown one is still 204. Uninstalled apps are
  forgotten when Firebase reports them. `VALIDATION` for a token under 20 characters, another
  `platform` or `language`. Couriers can register too.
* **Pushes:** title = the listing's title, text in the phone's language (never a chat message's text).
  `data` says what a tap opens:

  | Event | To | `data` |
  |---|---|---|
  | New chat message (a burst → one push) | the other person | `{ "type": "chat", "id": chatId }` |
  | New offer, counter-offer, accepted, declined | the other side | `{ "type": "offer", "id": chatId }` |
  | Outbid | the bidder who was on top | `{ "type": "outbid", "id": listingId }` |
  | Auction won | the winner | `{ "type": "auction_won", "id": listingId }` |
  | Paid ("Sold!", B15.1) | the seller | `{ "type": "sale", "id": orderId }` |
  | Assigned to a driver (B15.5) | the driver | `{ "type": "delivery", "id": orderId }` |
  | Picked up, on the way (B15.5) | the buyer | `{ "type": "order", "id": orderId }` |
  | Delivered | the buyer | `{ "type": "order", "id": orderId }` |
  | Delivered | the seller | `{ "type": "sale", "id": orderId }` |

  The app treats an unknown `type` as "open the app".

Later, a WebSocket (or Server-Sent Events) channel can replace the timers for chat and live
bidding; the screens won't change.

### Support (BACKEND_PLAN B15.6)

Madmoon Deals' support team: an email address and one chat per person (customers **and** drivers), answered from the
dashboard by admins with the `support` permission. No phone number for now.

```ts
type SupportMessage = {
  id: string;
  fromSupport: boolean; // true = Madmoon Deals support (the app never shows which admin)
  text: string;         // 1–2000 characters
  orderId?: string;     // "SA-123456" when the person wrote about an order
  createdAt: string;    // ISO-8601
};
```

* **`GET /support`** *(Authenticated, customers and couriers)* → `{ "email": "support@sahla.jo", "messages": SupportMessage[] }`
  (oldest first, the latest 200). Opening it marks support's answers read. `email` is the server's `SUPPORT_EMAIL`.
* **`POST /support/messages`** *(Authenticated)* → Body: `{ "text": "...", "orderId"?: "SA-123456" }` → 201 `SupportMessage`.
  `orderId` must be one of the person's orders (as buyer, seller or driver), else `VALIDATION`. Writing reopens a
  closed conversation. 30 messages per 10 minutes per person: `RATE_LIMITED` (429).
* An answer from support is pushed: `{ "type": "support", "id": userId }` ("The support team answered you", never the text).
* **Dashboard** *(admin, `support` permission)*: `GET /admin/support?open=true|false` → `{ userId, user, open, lastMessage,
  waiting, lastMessageAt }[]` (open first, newest first; `waiting` = they wrote since support last looked);
  `GET /admin/support/:userId` → `{ user, open, messages }` (messages carry `senderName` for admins);
  `POST /admin/support/:userId/messages` `{ text }`; `POST /admin/support/:userId/close` → 204 (logged).
  The overview counts conversations waiting for an answer (`queues.supportWaiting`).

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


