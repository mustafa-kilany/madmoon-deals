# Sahla Backend Plan

The road from today to a launched API, phase by phase. **Edit this file freely**: reorder tasks, cross
things out, add notes under a task. It's the to-do list; [`API.md`](API.md) stays the contract (what each
endpoint does), [`DATABASE.md`](DATABASE.md) the database design and [`backend/README.md`](../backend/README.md) says how to run things.

**Status:** ✅ done · 🔨 in progress · ⬜ to do · ⏸ blocked (waiting for an account, a key or a decision)

**How we work**
- **One task = one commit**, message `feat(backend): <what>` (or `fix(…)`, `test(…)`, `docs(…)`), so each
  task can be reviewed and undone on its own. The task's id goes in the message, e.g. `feat(backend): B2.3 GET /listings`.
- **Every endpoint ships with an end-to-end test** (`src/**/*.e2e.ts`, `npm run test:api`) and its
  contract section in `docs/API.md` stays true. A task is done when `npm run typecheck`, `npm test`
  and `npm run test:api` pass.
- **The app switches to the real backend one service at a time** in `frontend/src/config.ts` → `mock`
  (`auth`, `catalog`, `negotiation`, `orders`) when that phase is done.
- **One branch per phase** (`feat/backend-b2-catalog`, …), a pull request into `main` when the phase is
  done, tag `backend-b2` after merging (DEVELOPMENT_GUIDE §3.6).

---

## Decisions to make (edit the answers)

| # | Question | Options | Needed by | Answer |
|---|---|---|---|---|
| D1 | Where photos are stored in production | Cloudflare R2 (cheap, no download fees) · AWS S3 · DigitalOcean Spaces | B3 | _R2 recommended_ |
| D2 | Payment provider (JOD, cards, 3-D Secure, holding money until delivery) | MEPS (Jordanian banks) · a bank's payment gateway · HyperPay · PayTabs · Checkout.com | B7 | |
| D3 | Email service for codes | Amazon SES (cheapest) · Resend (easiest) · Postmark | B9 (sooner for real users) | |
| D4 | Hosting for the API + database | Railway / Render (easiest) · DigitalOcean App Platform + Managed Postgres · AWS | B12 | |
| D5 | Admin dashboard | Own web app in this repo (`admin/`, React + Vite) calling the same API · AdminJS (generated, less flexible) | B8 | _Own web app on the same API recommended (see B8)_ |
| D6 | Reverse geocoding (street from GPS) | Google Geocoding · HERE · Mapbox · self-hosted Nominatim (free) | B7 | |
| D7 | Search engine | Postgres only (enough to launch) · Meilisearch later for typo tolerance | B2 | _Postgres first_ |
| D9 | Staff email domain (couriers, admins) | e.g. `@sahla.jo` (the domain Sahla owns) | B14 | |
| D8 | Where refurbished stock comes from (`REFURBISHED_SOURCING.md`) | 1 Jordanian vendors · 2 Sahla imports graded stock (EU / US / UAE) and sells it · 3 order on demand | B13 | _1 now, 2 next; 3 later_ |

---

## B0 — Foundation ✅ (commit `950df81`)
- ✅ Express 5 + TypeScript (tsx), Prisma 7 + PostgreSQL 18, `/v1/health`, error format of `docs/API.md`.
- ✅ Shares the app's rules and reference data (`../src/lib`, `filters.ts`, `places.ts`).
- ✅ Database schema + first migration (users … risk queue).
- ✅ Certified Refurbished import (API + `npm run store`), certificate OCR checks, risk rules (flag only),
  Sanad slot. Guides in `backend/docs/`.

## B1 — Accounts (email) 🔨
- ✅ **B1.1** Email sign-up with code, log-in, log-out, password reset, `GET/PATCH/DELETE /me`.
  JWT (HS256, 60 days) + a database session per token (revocable). scrypt passwords, HMAC codes,
  rate limit per IP + email. `npm run db:seed` demo accounts. End-to-end tests on `sahla_test`.
- ✅ **B1.2** Backend CI: GitHub Actions job with a PostgreSQL service running typecheck, unit and
  end-to-end tests on every pull request. _(First real run when the branch is pushed.)_
- ✅ **B1.3** App: send `X-Device-Id` (random id stored once in MMKV) on every request; document it in
  `API.md` (feeds the "many accounts on one phone" risk signal).
- ✅ **B1.4** App: a message for `RATE_LIMITED` ("Too many tries, wait a few minutes").
- **Switch the app:** `mock.auth = false` (already false). ✅

## B2 — Catalog (browsing) ✅ backend done; the app switches after B4 (branch `feat/backend-b2-catalog`)
- ✅ **B2.1** `GET /categories`, `GET /categories/filters`, `GET /cities` from the shared reference data;
  category images served by the backend (`/static/categories/*.jpg`).
- ✅ **B2.2** Development seed listings: the app's mock catalog (40 listings incl. 8 auctions, 12 refurbished
  from 7 stores, 10 certificates) into the database (`npm run db:seed`), same ids as mock mode, 6 demo sellers.
- ✅ **B2.3** `GET /listings`: filters (`category`, `format`, `refurbished`, `types`, `brands`, `conditions`,
  `cities`, price range, `verifiedOnly`, `endingSoon`), sorts (6), keyset cursor, `limit` ≤ 50, `ids=`
  mode, `total`, `counts`, `refurbishedCounts`, `facets`. Only `active`, never ended auctions.
- ✅ **B2.4** Search `q`: every word must match title (ar/en), brand, model or type name; Arabic folding
  (أ/إ/آ→ا, ة→ه, ى→ي, no tashkeel) with the app's own `foldText()` (`Listing.searchText`). Its `pg_trgm` index is in B2.6.
- ✅ **B2.5** `GET /listings/:id`, `POST /listings/:id/views` (each viewer once a day: user, else device id,
  else IP; `ListingView` table), `GET /me/listings`.
- ✅ **B2.6** Indexes (`pg_trgm` on `searchText`, live/auction, recommended, price, area) + `npm run load-check`:
  10 000 listings, every query 16–19 ms including counts and facets.
- **Switch the app:** `mock.catalog`, `mock.negotiation` and `mock.orders` **together, after B7**: the app's demo
  offers, bids and checkout look listings and offers up in the demo data, so a real listing or offer couldn't
  be bought through the demo checkout. To try browsing and selling against the backend before that,
  set `catalog: false` in `frontend/src/config.ts` locally (don't commit it).
- ✅ Blocks and reported listings filter these lists (B5.1–B5.2).

## B3 — Photo uploads ✅ (branch `feat/backend-b3-uploads`) (needs D1 for production; local disk in development)
Two kinds (decided 2026-10-30): **users' listing photos** and **admins changing the category pictures**.
- ✅ **B3.1** Storage module: local folder in development, R2/S3 in production, one interface.
- ✅ **B3.2** Image pipeline (`sharp`): check the real file type from its bytes, strip EXIF (GPS!),
  resize to 1600 px + a 400 px thumbnail, WebP/JPEG.
- ✅ **B3.3** `POST /uploads/listing-photo` (issued URLs remembered, so `POST /listings` accepts only ours).
- ✅ **B3.4** `POST /me/avatar`.
- ✅ **B3.5** ID verification is **Sanad only** (decided 2026-10-30: no ID photos, no manual review):
  `POST /me/id-verification/sanad` → `{ redirectUrl }`, Sanad's answer at `GET /id-verification/sanad/callback`
  → `User.verified` (and the badge on their listings); national number only as a keyed hash (one ID, one
  account). `503 SANAD_UNAVAILABLE` until MoDEE gives access; `SANAD_MODE=fake` for development and tests.
  The real Sanad calls go in `src/modules/identity/provider.ts` (B11). App: "Verify with Sanad".
- ✅ **B3.6** Clean-up job: delete uploads no listing uses after 24 h.
- ✅ **B3.7** Category pictures from the database: a `Category` table (`id`, `imageUrl`, `updatedById`,
  `updatedAt`); `GET /categories` uses it, falling back to the bundled tiles.
- ✅ **B3.8** `PUT /admin/categories/:id/image` (admin only, same image pipeline, logged); the dashboard button
  comes in B8.

## B4 — Selling + test certificates 🟡 (branch `feat/backend-b4-selling`) (needs a Google Vision key for real OCR)
- ✅ **B4.1** `POST /listings`: every rule in `API.md` (description ≥ 10 words with the app's own rule,
  seller grades only, the caller's own unused uploads only, auctions 1 h – 14 days, area, brand/model);
  the photos are marked used so the clean-up keeps them.
- ✅ **B4.2** `PATCH /listings/:id` (price, condition), `DELETE /listings/:id` (withdraw; not once paid for,
  not an auction with bids).
- ✅ **B4.3** `POST /test-certificates`: photo (upright, no EXIF) → OCR → stamp (none yet: `stampChecked`
  false, admin review in B8) → text checks → `already_used` (same photo fingerprint, or same IMEI / serial
  hash, on a listing that isn't withdrawn) → saved. The original is private (`uploads-private`).
- ✅ **B4.4** Blurred copy for buyers: the OCR boxes of the IMEI / serial (also spaced out) are blurred;
  the shop's phone and the date stay readable.
- ✅ **B4.5** `POST /listings` requires a passed, unused certificate for `requiresTestCertificate` types
  (the seller's, same type, brand, model); `Item.testCertificate` in listing responses, always the blurred copy.
- ✅ **B4.6** Fake reader for development without a Google Vision key (a passing report for the chosen
  device, today's date, an IMEI from the photo); tests script any page of text. Production without a key: 503.

## B5 — Safety 🟡 (B5.1–B5.2 built with B6: the app's negotiation service includes them)
- ✅ **B5.1** `POST /reports`; 3 different reporters on one listing hide it from browsing
  (`Listing.reportHidden`) until an admin looks (B8).
- ✅ **B5.2** `POST/GET/DELETE /me/blocked`; blocked users vanish from each other's `GET /listings` (both
  ways); chats, offers and bids in B6.
- ✅ **B5.3** Risk checker runs after sign-up and log-in, new listing, report and block, plus nightly at 03:00
  (Jordan). Jobs run inside the server (`src/lib/jobs.ts`): nothing must survive a restart, the nightly run
  catches a lost check. With several servers (B12), move them to `pg-boss` on the same PostgreSQL.
- ⬜ **B5.4** (optional) AI summaries for flags (Claude, Message Batches at night).

## B6 — Negotiation, chat, auctions ✅ (branch `feat/backend-b6-negotiation`)
- ✅ **B6.1** Chats: `GET /chats`, `GET /chats/:id/messages` (paging with `before`), `POST /chats/:id/messages`;
  hidden both ways after a block, no messages either way.
- ✅ **B6.2** Offers: `POST /listings/:id/offers`, `POST /offers/:id/respond` (turn rules), `GET /offers/:id`;
  each step posts a chat message carrying the offer. One open offer per buyer and listing; no offers on
  brand-store listings (fixed price).
- ✅ **B6.3** Bids: `POST /listings/:id/bids` (minimum = price + increment, not your own, not ended),
  `GET /listings/:id/bids` (highest first, public); the listing row is locked, so two bids can't both win.
- ✅ **B6.4** Auction closing job (every minute): at `auctionEndsAt` set `winnerId` (highest bid) and
  `auctionClosedAt`; no bids → ended unsold.
- ✅ **B6.5** Polled endpoints are cheap: indexes, and Express's `ETag` / `304 Not Modified` on every GET.
- **Switch the app:** after B7, with `mock.catalog` and `mock.orders` (see B2).

## B7 — Orders, payments, escrow, delivery 🔨 (branch `feat/backend-b7-orders`; needs D2 and a merchant account, fake provider until then)
- ✅ **B7.1** `GET /geocode/reverse` (D6), no coordinates stored or logged, 20/hour per user. `GEOCODER=nominatim`
  (OpenStreetMap, free) works now; streets are often Arabic-only there even for `lang=en`. For launch: self-host
  Nominatim or add Google (one more `Geocoder` in `src/modules/geocode/geocoder.ts`).
- ✅ **B7.2** `POST /orders`: server prices it (3% buyer protection, min 1 JOD; 2 JOD delivery), checks the
  listing / offer / auction winner / blocks; readable ids `SA-123456`.
- ✅ **B7.3** Payment provider module with a **fake provider** (development and tests): `PAYMENT_MODE=fake`,
  test cards in `backend/docs/PAYMENTS.md`.
- ✅ **B7.4** `POST /orders/:id/pay`: `escrow_held` + 4-digit PIN + listing `reserved`, in one transaction
  (first payment wins); 3-D Secure `paymentUrl` + the bank's callback.
- ✅ **B7.5** `GET /me/orders`, `GET /me/sales`, `GET /orders/:id`.
- ✅ **B7.6** `POST /courier/confirm-delivery`: PIN check, lock after 5 wrong PINs, `completed`, listing
  `sold`, seller payout recorded.
- ✅ **B7.7** Refunds (admin only), `DELETE /me` refuses with open orders (`OPEN_ORDERS`). Also
  `POST /admin/orders/:id/unlock-pin` after 5 wrong PINs.
- ✅ **B7.8** `POST/DELETE /me/payment-card` with the provider's tokens (`User.cardToken`); `cardToken: "saved"` pays with it.
- ⬜ **B7.9** The real provider (D2).
- **Switch the app:** `mock.orders = false`.

## B8 — Admin dashboard 🔨 (D5 = own web app; branch `feat/backend-b8-admin`)

**Architecture (common practice):** one backend, many clients. The dashboard is a **separate
website that calls this same API**. It has no database access and no business rules of its own:

```
Mobile app ──┐
             ├──► backend/ (Express) ──► PostgreSQL
Dashboard  ──┘    /v1/*        app endpoints
(admin.sahla.jo)  /v1/admin/*  admin-only endpoints (role: admin)
```

- Every rule (refunds, suspending, approving a certificate) is written **once**, in the backend, and is
  tested and secured once. A dashboard with its own database access or copied rules would mean two
  places to keep correct and secure.
- **Admin security:** a separate admin log-in, shorter sessions (e.g. 12 h), **two-factor
  authentication**, an **audit log** of every admin action (who, what, when, before/after), and
  optionally only from the office IP or a VPN.
- **Monitoring is split in two:** *business* numbers (sign-ups, listings, orders, money held in escrow,
  open reports) come from `/v1/admin/stats` and show in the dashboard. *Technical* health (errors, slow
  requests, server down) goes to tools built for it: Sentry, an uptime check, the host's metrics
  (B12). The dashboard can link to them.

Tasks:
- ✅ **B8.1** Admin log-in: password → a 5-minute ticket → a code from an authenticator app (TOTP, set up
  on the first log-in with a QR code; the secret is stored encrypted; each code works once) → a
  dashboard token (session scope `admin`, 12 hours). App tokens never open `/v1/admin/*` and dashboard
  tokens open nothing else. `AdminAction` audit log for every admin change, `GET /admin/actions`.
  Lost phone: `npm run staff -- reset-2fa <email>`. _(Office IP / VPN only: decide at B12.)_
- ✅ **B8.2** The dashboard web app (`admin/`, React + Vite + TypeScript, shares the app's `src/lib`):
  two-step log-in with the QR code set-up, layout, overview page from `GET /v1/admin/stats` (needs
  attention, money, marketplace; refreshed every minute). `npm run dev` → http://localhost:5174 (5173 is the
  Figma prototype); `/v1` is proxied to the backend. Demo admin in the seed: `admin@sahla.jo`. CI builds it.
- ✅ **B8.3** Review queues: **reports** (listings: keep = back on sale, remove = withdrawn + push to the seller;
  accounts: dismiss, or suspend from the user page), **suspicious accounts** (risk flags: dismissed / actioned with
  a note), **test certificates** (the stamp check: the original photo for admins only, approve, or reject = the
  listing off sale + push, and that paper can't be used again). Reports get `resolvedAt` / `resolution`: only open
  reports hide a listing. Suspending an account closes its reports and flags. _(ID photos: none, ID checks are
  Sanad only since B3.5.)_
- ✅ **B8.4** Certified Refurbished: stores (create), API keys (shown once, revoke), the store's sheet as
  **CSV UTF-8** with a preview (dry run) then publish, import history (who: admin, key or command line). The server
  reads the CSV with the same code as `npm run store -- import`. _(`.xlsx` directly: later, if admins need it.)_
  Also the **Couriers** page (B14.1): add, disable, enable again.
- ✅ **B8.5** Orders: search (number, email, name, status, "need a courier"), the whole order (never the PIN),
  refund, unlock PIN, assign a courier; payouts: list, mark sent with the bank reference; users: look up, details
  (activity, reports, risk flags), suspend / unsuspend with a reason. Suspending signs them out and takes their
  listings off sale (no orders, offers or bids). Every action in the audit log, shown on the order / user page.
- ✅ **B8.8** Analytics page: `GET /admin/analytics?days=7|30|90` (Jordan days). The period's numbers against the
  period before (customers, listings, paid orders, sales value, reports), charts per day, orders by status,
  customers by sign-in, listings on sale by category and by area. Charts in plain SVG (`admin/src/charts.tsx`),
  colors checked with the data-viz palette validator, a table view on every chart.
- ⬜ **B8.7** Vendor connectors for refurbished stock: read a vendor's own online shop with a read-only key they
  give us (WooCommerce, Shopify) or their product feed file (Google Merchant XML/CSV), map it to the import
  rows and run the same import on a schedule. Vendors without a shop keep using the Excel sheet.
- ⬜ **B8.6** Deploy the dashboard at `admin.sahla.jo` (static hosting); the API allows that origin (CORS).
  **Turn the authenticator code back on:** remove `ADMIN_2FA=off` from `.env` (it is off in local development
  since 2026-11-01, at the owner's request; production refuses to start with it off), then each admin scans
  their QR code on the next log-in.

## B9 — Emails and push notifications 🔨 (D3 for emails; Firebase project `sahla-project-75cb2`)
- ⬜ **B9.1** Real email sending (codes) behind `mailer.ts`; Arabic + English templates.
- ✅ **B9.2** `POST /me/devices`, `DELETE /me/devices/:token` (`Device` table, with the phone's language and
  the sign-in it belongs to). ✅ App: sends the token and language after sign-in and at launch, removes it on
  log-out (`frontend/src/services/push`).
- ✅ **B9.3** Push (FCM HTTP v1, `PUSH_MODE=fcm`) for: new message, new offer / offer answered, outbid,
  auction won, order delivered (buyer and seller); in the phone's language; uninstalled apps are
  forgotten. `backend/docs/PUSH.md`; `npm run push:test -- <email>`. ✅ App: asks permission (Android 13+),
  a tap opens the chat / auction / order; while open, a toast. Android only until the iPhone key.
  ⬜ iPhone: APNs key (Apple Developer account).

## B10 — Google and Apple sign-in: backend ✅, Google on Android ✅, Apple waits for an Apple Developer account
- ✅ **B10.1** `POST /auth/google`: verify the ID token with Google's keys (audience = our client ids); link by
  verified email, else a new account; staff refused. `GOOGLE_CLIENT_IDS` in `.env` turns it on.
- ✅ **B10.2** `POST /auth/apple`: same with Apple's keys; hidden relay emails and no email are fine; the app may
  send the name (Apple gives it to the app once). `APPLE_CLIENT_IDS` turns it on.
- ✅ **B10.3** App, Google on Android: `@react-native-google-signin/google-signin` 16.1.5 picks the account and
  sends its ID token (`src/services/auth/google.ts`); the token is made for the WEB client id
  (`config.googleWebClientId` = `GOOGLE_CLIENT_IDS`); Firebase holds the debug SHA-1/256. Tested on the emulator
  with a real Gmail. Still open: Play App Signing SHA-1 in Firebase before release; iPhone (iOS client id +
  URL scheme); Apple sign-in in the app (Apple Developer account).

## B11 — Sanad ID verification ⏸ (MoDEE agreement, see `backend/docs/ID-VERIFICATION.md`)
- ⬜ **B11.1** Apply to MoDEE (company registration, privacy policy).
- ⬜ **B11.2** The real Sanad provider in `src/modules/identity/provider.ts` from MoDEE's documents (the endpoints,
  app screen and database are ready since B3.5); register the callback URL with MoDEE; set `ID_HASH_SECRET`.

## B12 — Production and launch ⬜ (D4)
- 🔨 **B12.1** Production settings: ✅ `TRUST_PROXY`, security headers (`helmet`), request size limits,
  structured logs (`pino`: method, path, status, time; never query strings, headers or bodies, so no
  tokens, passwords or coordinates); ⬜ error tracking (Sentry, needs an account).
- ⬜ **B12.2** Deploy: API + managed PostgreSQL, `prisma migrate deploy` on release, `api.sahla.jo` over HTTPS.
- ⬜ **B12.3** Daily database backups + a tested restore.
- ⬜ **B12.4** Monitoring: uptime check on `/v1/health`, alerts on errors and slow requests.
- ⬜ **B12.5** Load test (search, auction polling) before launch.
- ⬜ **B12.6** Privacy policy + data deletion rules (ID photos, coordinates, deleted accounts).
- ⬜ **B12.7** App release builds use `https://api.sahla.jo/v1`; contract server kept for app tests only.

## B13 — Imported refurbished stock (Sahla as the seller) ⬜ (D8; see `REFURBISHED_SOURCING.md`)
- ⬜ **B13.1** Sahla's own store account (`store-sahla`) and its terms (grading, warranty, returns).
- ⬜ **B13.2** `Listing.quantity` for store listings: several identical units under one listing; an order
  reserves one unit; the listing sells out at 0. Import column `quantity` (default 1).
- ⬜ **B13.3** Landed-cost calculator in the dashboard: buy price, shipping, customs, tax, approval,
  warranty, margin → JOD price, saved with each import.
- ⬜ **B13.4** (only if D8 = 3) order on demand: "ships from abroad" listings, delivery estimate, order steps
  for ordering, transit and customs.
- **Not code:** a customs broker, TRC type approval per phone model, a freight forwarder, the first sample
  order from one supplier.

## B14 — Courier (driver) app 🔨 (orders from B7)

Couriers are **staff**, not customers: nobody can sign up as one. An admin creates the account with a
**company email** (`@sahla.jo`, D9); the courier sets a password with the emailed code (the normal reset
screen) and then logs in like anyone else, but sees **only the driver screens**: no browsing, selling,
buying, chats or offers.

- 🔨 **B14.1** Staff accounts: ✅ `npm run staff -- courier "Name" name@sahla.jo` (and `disable`, `list`),
  ✅ sign-up refuses the staff domain (`STAFF_EMAIL_DOMAIN`, default `sahla.jo`); ✅ `POST /admin/couriers` (+ list,
  disable, enable) and ✅ the dashboard's Couriers page (B8.4); only the staff domain; an invite code is emailed. Public sign-up refuses the staff
  domain, so nobody can make a look-alike account.
- 🔨 **B14.2** (✅ uploads; the rest with each endpoint) Couriers can only call courier endpoints: everything for customers (listing, offers, chats,
  orders, saving) answers `FORBIDDEN` for them.
- ✅ **B14.3** `GET /courier/deliveries`: the orders assigned to me: order number, item, **pickup** (seller's
  name, phone, area, address) and **drop-off** (buyer's delivery details), status.
- ✅ **B14.4** `POST /courier/deliveries/:orderId/picked-up`, then the existing
  `POST /courier/confirm-delivery` with the buyer's 4-digit **PIN** (locks after 5 wrong tries).
- ✅ **B14.5** Pickup address: the seller gives it when the order is paid (B7), shown only to the courier
  (`POST /orders/:id/pickup`). ⬜ App: a pickup form on the seller's sale.
- ✅ **B14.6** Assigning: an admin assigns each paid order to a courier in the dashboard (later: by area).
  ✅ `POST /admin/orders/:id/assign`; ✅ on the dashboard's order page (B8.5), "Paid orders without a courier" on the
  overview.
- ✅ **B14.7** App: courier mode (`frontend/src/features/courier`, `services/courier`, `config.mock.courier`
  false = the real API). A courier account gets only these screens: **Deliveries** (assigned ones oldest
  first, then today's delivered; refreshes every 30 s) → a delivery: order number, pickup and drop-off with
  **Call** and **Open in Maps**, **Picked up**, then the **PIN** → **Confirm delivery**. Five wrong PINs:
  "call Sahla support". The menu has only language and log out. Replaces the old "Confirm a delivery" screen.

---

## Log
Short notes on what changed, newest first.
- 2026-11-01: B8.8 done: the dashboard's Analytics page (trends and breakdowns, 7 / 30 / 90 days).
- 2026-11-01: `ADMIN_2FA=off` lets the dashboard log in with email + password only, for local development until
  the dashboard is hosted (B8.6). Production refuses it; the tests always run with it on.
- 2026-11-01: B8.3–B8.4 done: review queues (reports, suspicious accounts, certificate stamps), Certified
  Refurbished stores / keys / sheet upload with preview / history, and the Couriers page. A certificate an admin
  rejects can't be reused on a new listing. B14.6's dashboard screen was already on the order page (B8.5).
- 2026-11-01: B10.3 Google sign-in on Android done and tested with a real Gmail.
- 2026-10-31: B14.7 done: courier mode in the app (deliveries list, call / maps, picked up, PIN), on the
  real API. Still open for couriers: the seller's pickup-address form (B14.5) and a courier page in the dashboard.
- 2026-10-31: B8.5 done: orders, payouts and users pages in the dashboard; suspending takes listings off sale.
  The audit log keeps the admin's IP (kept: it shows where a stolen admin account was used).
- 2026-10-31: B8.2 done: the dashboard website (log-in with 2FA, overview).
- 2026-10-31: B9.2–B9.3 push notifications done on Android (backend + app).
- 2026-10-31: B8.1 done: two-step admin log-in, dashboard-only tokens, audit log.
- 2026-10-30: courier (driver) app planned as B14: staff accounts made by admins with the company email,
  courier-only screens (deliveries, pickup / drop-off, PIN).
- 2026-10-30: refurbished = vendor-refurbished customer returns, sold only by vendors (or Sahla); sourcing
  options in `REFURBISHED_SOURCING.md`, phase B13; B3 also covers admin category pictures.
- 2026-10-30: certified refurbished listings are fixed price only (vendors set the price): no auction
  columns in the import or template, app store screen without format tabs (API.md change log).
- 2026-10-30: database design with pictures (`docs/DATABASE.md`, `docs/database/*.png`).
- 2026-10-30: the app moved into `frontend/` (backend shares `../frontend/src`).
- 2026-10-30: B2.1–B2.4 done (catalog reference data, seed, GET /listings + search); admin dashboard
  architecture added to B8.
- 2026-10-30: plan written; B0 committed (`950df81`); B1.1 done.
