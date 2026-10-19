# Sahla API contract

What the mobile app expects from the backend. The app's mock backend
(`src/services/*/mock.ts`) implements exactly this, and the HTTP
implementations (`src/services/*/http.ts`) call these endpoints. Build the
backend to this document and connecting it is a configuration change:

```ts
// src/config.ts
apiBaseUrl: 'https://api.sahla.jo/v1', // your server
useMockApi: false,
```

Keep this file in sync with `src/lib/types.ts` (the shapes below are those types).

## Conventions

| Topic | Rule |
|---|---|
| Format | JSON, UTF-8. Uploads are `multipart/form-data`. |
| Auth | `Authorization: Bearer <token>` on every request once signed in. A rejected or expired token must return **401** (the app then signs out). |
| Money | Integers in **fils** (1 JOD = 1000 fils). Never decimals. Fields end in `Fils`. |
| Text in two languages | Catalog text is `{ "ar": "…", "en": "…" }` (`Localized`). |
| Ids | Strings. Category ids are fixed: `clothing, tech, vehicles, furniture, shoes, gaming, watches, more`. |
| Dates | ISO-8601 strings with timezone, e.g. `"2026-10-19T12:00:00Z"`. |
| Errors | Non-2xx with body `{ "error": { "code": "EMAIL_TAKEN", "message": "…" } }`. |

### Error codes

| Code | HTTP | When |
|---|---|---|
| `VALIDATION` | 400 / 422 | Bad or missing fields |
| `UNAUTHORIZED` | 401 | No / invalid / expired token |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password on log-in |
| `NOT_FOUND` | 404 | Unknown id |
| `EMAIL_TAKEN` | 409 | Sign-up with a registered email |

Anything else is shown as a generic error. Messages shown to users come from
the app's translations, keyed by `code`, so `message` is for logs only.

## Catalog

### `GET /categories` → `Category[]`
```json
[{ "id": "tech", "name": { "ar": "تكنولوجيا", "en": "Tech" },
   "icon": "Laptop", "imageUrl": "https://cdn…/tech.jpg" }]
```
`icon` is a fallback line-icon name from the app's icon set (`Shirt, Laptop, Car, Sofa, Sneaker, Gamepad, Watch, Grid`).

### `GET /categories/filters` → `{ [categoryId]: CategoryFilters }`
```json
{ "tech": { "types": [{ "id": "phones", "name": { "ar": "هواتف", "en": "Phones" } }],
            "brands": ["Apple", "Samsung"] } }
```

### `GET /cities` → `Place[]`
```json
[{ "id": "amman", "name": { "ar": "عمّان", "en": "Amman" } }]
```

### `GET /listings` → `Item[]` · `GET /listings/:id` → `Item`
```json
{
  "id": "tech-0",
  "category": "tech",
  "title": { "ar": "آيفون 14 برو", "en": "iPhone 14 Pro" },
  "priceFils": 520000,
  "imageUrl": "https://cdn…/iphone.jpg",
  "condition": "excellent",
  "seller": { "ar": "عمر", "en": "Omar" },
  "brand": "Apple",
  "type": "phones",
  "verified": true,
  "location": { "id": "irbid", "name": { "ar": "إربد", "en": "Irbid" } },
  "saleType": "fixed"
}
```
- `condition`: `new | excellent | good | loved`.
- `type`: an item-type id from `/categories/filters`.
- `verified`: the seller passed ID verification.
- Auctions have `"saleType": "auction"` and
  `"auction": { "endsAt": "<ISO date>", "bidCount": 18, "incrementFils": 10000 }`;
  `priceFils` is then the current bid.
- Filtering, sorting and search currently run in the app over the full list. When
  the catalog grows, add query parameters (`category, q, format, sort, page`)
  and move that logic server-side; the app's `lib/browsing.ts` documents the rules.

### `GET /me/listings` → `Item[]` (auth)
The signed-in user's listings (Phase 4).

## Accounts

`Session` = `{ "token": "…", "user": User }`

`User`:
```json
{
  "id": "user-42",
  "name": "Ahmad",
  "email": "ahmad@sahla.jo",
  "method": "email",
  "verified": false,
  "cityId": "amman",
  "avatarUrl": "https://cdn…/avatar.jpg",
  "card": { "brand": "visa", "last4": "4242" }
}
```
`method`: `email | id`. `card` is absent when no card is saved.

| Endpoint | Body | Returns | Errors |
|---|---|---|---|
| `POST /auth/signup` | `{ name, email, password }` | `Session` (unverified user) | `EMAIL_TAKEN`, `VALIDATION` |
| `POST /auth/login` | `{ email, password }` | `Session` | `INVALID_CREDENTIALS` |
| `POST /auth/signup/id` | multipart `idPhoto` (JPEG) | `Session` (verified user) | `VALIDATION` (unreadable ID) |
| `POST /auth/logout` (auth) | — | 204 | — |
| `GET /me` (auth) | — | `User` | `UNAUTHORIZED` |
| `PATCH /me` (auth) | `{ name?, cityId? }` | `User` | `VALIDATION` |
| `POST /me/avatar` (auth) | multipart `avatar` | `User` | `VALIDATION` |
| `POST /me/id-verification` (auth) | multipart `idPhoto` | `User` (`verified: true`) | `VALIDATION` |
| `POST /me/payment-card` (auth) | `{ cardToken }` | `User` with `card` | `VALIDATION` |
| `DELETE /me/payment-card` (auth) | — | `User` without `card` | — |

Notes:
- Store password hashes, never passwords. Email is case-insensitive.
- ID photos are sensitive personal data: encrypt at rest, restrict access,
  delete after the KYC decision (DEVELOPMENT_GUIDE §9 privacy policy).
- `cardToken` comes from the payment provider's SDK on the phone; the card
  number never reaches the Sahla API. The provider is still to be chosen
  (DEVELOPMENT_GUIDE §8 #4).
- ID verification may become asynchronous with a real KYC provider. If so,
  return the user with a pending state and the app will add a "pending" status.

## Coming in later phases

Listings create/edit (Phase 4), offers and chat, bids (Phase 5), orders,
checkout and escrow, courier PIN (Phase 6). Add them here as they're designed.
