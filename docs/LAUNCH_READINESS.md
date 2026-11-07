# Sahla Launch Readiness

What is ready, what isn't, and the order to finish it. Audited 2026-11-07 on `feat/backend-b8-admin`
(`5a8e2d3`). **External APIs and accounts are listed only at the end**: everything above them can be done
now, without waiting for anyone. Security has its own plan: [`SECURITY_PLAN.md`](SECURITY_PLAN.md).

**Status:** ✅ ready and checked · 🟡 built but not checked end to end · ❌ missing · ⏸ waits for an external account

---

## 1. What was checked (2026-11-07)

| Check | Result |
|---|---|
| Backend `typecheck` | ✅ passes |
| Backend unit tests | ✅ 32 / 32 |
| Backend end-to-end tests (real PostgreSQL, `sahla_test`) | ✅ 121 / 121 |
| App `typecheck` | ✅ passes |
| App tests (Jest) | ✅ 191 / 191 in 21 suites |
| Dashboard build | ✅ builds |
| Every endpoint the app calls exists in the backend | ✅ all found; the backend also has endpoints the app **never calls** (see §3) |
| `npm audit` | backend 0 · dashboard 0 · app 13 (build tools and Firebase's web SDK; details in `SECURITY_PLAN.md` S7.9) |

**The single most important finding:** in `frontend/src/config.ts` the app still has
`mock.catalog = true`, `mock.negotiation = true`, `mock.orders = true`. So **browsing, selling, offers, chats,
auctions, checkout and order tracking in the app still run on the in-app demo data**, not on the backend. The
backend side of all of them is built and tested (121 e2e tests), but the app has never been run end to end
against it. Only sign-in (`auth`) and the driver screens (`courier`) use the real backend today. The plan said
to switch the three together after B7, and B7 is done (with the fake payment provider), so this is now step 1.

---

## 2. The driver (courier) app

**Verdict: built and works against the real backend; usable for a pilot with a few drivers once the gaps
below marked "before launch" are closed.**

| Requirement | Status | Where |
|---|---|---|
| Only admins create drivers (company email), public sign-up refuses the staff domain | ✅ | dashboard Couriers page, `npm run staff`, B14.1 |
| Driver sets a password from an emailed invite code | 🟡 works; the email is printed in the server terminal until Postmark is live (⏸ domain) | B14.1, B9.1 |
| Driver sees only driver screens (no buying, selling, chats) — app and server | ✅ | B14.2 `staffOnly.e2e.ts`, B14.7 |
| Deliveries list (assigned, oldest first; today's delivered), refresh every 30 s | ✅ | `features/courier/DeliveriesScreen.tsx` |
| Delivery page: pickup + drop-off, Call, Open in Maps | ✅ | `DeliveryScreen.tsx` |
| Pickup address comes with the listing, copied onto the order | ✅ | B14.5 |
| Admin assigns a driver from the Orders list / order page | ✅ | B14.6 |
| "Picked up" → buyer's PIN → "Confirm delivery" → escrow released, seller payout recorded | 🟡 backend tested; in the app only the list was checked on the emulator against the real backend (2026-10-31), the picked-up + PIN steps were not | B14.4, B7.6 |
| 5 wrong PINs lock it; admin unlocks | ✅ | B7.7 |
| Push to buyer and seller when delivered | ✅ | B9.3 |

**Missing (internal, no external account needed):**

| # | Gap | Why it matters | When |
|---|---|---|---|
| C1 | **No push to the driver when an order is assigned to them.** They only see it if the app is open (30 s polling). | Drivers miss jobs. | Before launch |
| C2 | **No "problem with this delivery" path**: buyer not home, buyer refuses the item, item not as described, seller didn't hand it over. Order statuses are only `to_pickup → picked_up → delivered`; the only way out is an admin refund. | The first failed delivery will be handled by phone with no record. Needs at least a "Report a problem" button (reason + note) that shows in the dashboard. Product decision first (§5 Q1). | Before launch |
| C3 | **No Sahla support number in the app**, but two driver messages say "Call Sahla support". | Driver is stuck at the door. | Before launch |
| C4 | No push / status to the buyer when the item is picked up ("on the way"). | Buyer may not be home. | Before launch (small) |
| C5 | Run the whole driver flow on a real phone against the real backend: invite → set password → assigned push → picked up → PIN → seller sees payout. | Nobody has done it end to end yet. | Before launch |
| C6 | Driver history older than today; deliveries by area (auto-assign). | Nice to have. | After launch |

---

## 3. Customers (guest, buyer, seller): requirements from DEVELOPMENT_GUIDE §1

| Requirement | Backend | App screen | App on real backend? |
|---|---|---|---|
| Guest: browse categories, search, view items, refurbished store | ✅ B2 | ✅ | ❌ mock (`catalog`) |
| Sign up / log in with email, reset password, delete account | ✅ B1 | ✅ | ✅ |
| Google sign-in (Android) | ✅ B10 | ✅ | ✅ (debug key only: add the release SHA-1, ⏸ Play Console) |
| Apple sign-in | ✅ B10 | ❌ the button sends no token, so it always fails on Android | ❌ → hide on Android now; build on iOS later (⏸ Apple account) |
| Save favourites | local on the phone (by decision) | ✅ | n/a |
| Make offers in chat, seller accept / counter | ✅ B6 | ✅ | ❌ mock (`negotiation`) |
| Chat | ✅ B6 (polling) | ✅ | ❌ mock |
| Bid in auctions; auction closes and the winner pays | ✅ B6.3–B6.4 | ✅ bidding | ❌ mock; **won-auction checkout never run against the backend** |
| Report / block | ✅ B5 | ✅ | partly (block list via `auth`); reports ❌ mock |
| Pay through escrow, delivery PIN, track the order | ✅ B7 (fake provider) | ✅ | ❌ mock (`orders`) |
| Seller: create a listing (photos, category, condition, brand/model, price, fixed or auction, pickup) | ✅ B4 | ✅ | ❌ mock (`catalog`) |
| Seller: test certificate for phones/electronics | ✅ B4 (fake OCR) | ✅ | ❌ mock |
| Seller: **edit price / condition, withdraw a listing** | ✅ `PATCH`/`DELETE /listings/:id` | ❌ **no screen** | ❌ |
| Seller: **"My sales" — know an item was sold and paid, see the order, payout status** | ✅ `GET /me/sales` | ❌ **no screen, and no push when an item is paid for** (only when delivered) | ❌ |
| My listings on Profile | ✅ | ✅ | ❌ mock |
| Verified Seller badge (Sanad) | ✅ ready (B3.5) | ✅ "Verify with Sanad" (coming soon) | ⏸ MoDEE |
| Push notifications (chat, offers, outbid, won, delivered) | ✅ B9 | ✅ Android | ✅ |
| Arabic (RTL) + English everywhere | ✅ | ✅ | — |
| Privacy policy, terms, consent at sign-up; Sanad consent screen | ❌ | ❌ | ❌ |

---

## 4. The plan: internal steps, in order

Each step = one branch or a few commits, same rules as `BACKEND_PLAN.md` (one task = one commit, tests pass).

### Step 1 — Put the app on the real backend (the big one)
1. ⬜ Flip `mock.catalog`, `mock.negotiation`, `mock.orders` to `false` together in `frontend/src/config.ts`.
2. ⬜ Backend with `PAYMENT_MODE=fake`, `GEOCODER=google` (or `fake`), `PUSH_MODE=fcm`, seed data.
3. ⬜ On the emulator, run every customer journey against the backend and fix what breaks:
   guest browse/search/filter → sign up → sell (photos, certificate, pickup) → second account: offer → counter →
   accept → checkout → fake bank → paid → admin assigns driver → driver picks up → PIN → both sides see
   "completed". Then: auction bid → outbid push → auction ends → winner checks out. Then: report, block.
4. ⬜ Point the Maestro flows (`.maestro/`) at the real backend + seed, so this stays tested.
5. ⬜ Remove or quarantine the demo-only paths the app no longer needs in release builds.

### Step 2 — Close the customer gaps (§3)
1. ⬜ **My sales** screen (`GET /me/sales`): sold items, order status, pickup reminder, payout status.
2. ⬜ **Push to the seller when an item is paid** ("Sold! A driver will pick it up").
3. ⬜ **Edit / withdraw listing** on My listings (`PATCH` / `DELETE /listings/:id`; the server already refuses when paid or with bids).
4. ⬜ Hide the Apple button on Android (until B10 on iOS).
5. ⬜ Verify won-auction checkout end to end (part of Step 1.3).

### Step 3 — Close the driver gaps (§2)
1. ⬜ C1 push to the driver on assignment (new `pushAssigned` in `notify.ts`, a tap opens the delivery).
2. ⬜ C4 push / status to the buyer on "picked up".
3. ⬜ C3 Sahla support phone/WhatsApp: one setting (server `GET /config` or app config), a Call button on the
   driver's screens and in the buyer's order tracking.
4. ⬜ C2 "Report a problem" for drivers (after §5 Q1 is answered) + a dashboard queue.
5. ⬜ C5 full driver run on a real phone.

### Step 4 — Security fixes that need no external account
From `SECURITY_PLAN.md` S0: S0.1 card-attempt limits, S0.2 limits on costly/spammy endpoints, S0.4
`PUBLIC_URL` required in production, S0.8 CORS for the dashboard, S0.11 (= Step 2.4), the S2.1
"two-user" authorization test, S1/S3/S4 checks.

### Step 5 — Legal and trust screens
1. ⬜ Privacy policy + terms pages (in the app, on the site), accepted at sign-up and stored with the version.
2. ⬜ Sanad consent screen + consent record (MoDEE's pledge), ready for when B11 starts.
3. ⬜ Data retention rules and the clean-up jobs (`SECURITY_PLAN.md` S8.3).

### Step 6 — Production code that doesn't need the account yet
1. ⬜ R2/S3 storage implementation behind `lib/storage.ts` (test locally with MinIO or R2's free tier) — S0.5.
2. ⬜ Sentry hooks wired (DSN left empty until the account), scrubbing rules — S0.10.
3. ⬜ Release keystore + signed AAB build script — S0.3.
4. ⬜ Splash screen, Arabic app name (`values-ar/strings.xml` "سهلة"), TalkBack accessibility pass (DEVELOPMENT_GUIDE Phase 9 / 8).
5. ⬜ Deployment files ready (Dockerfile or host config, `prisma migrate deploy` on release, health check) so
   B12.2 is one click once D4 is chosen.
6. ⬜ Load test (B12.5) on a local production build.

### Step 7 — Merge
⬜ Open the pull request `feat/backend-b8-admin` → `main` (52+ commits, nothing merged since B1), CI green,
tag. Long-lived unmerged branches are the biggest risk of lost work.

---

## 5. Decisions only the owner can make

Answered 2026-11-07 (built as `BACKEND_PLAN.md` B15):

| # | Question | Answer |
|---|---|---|
| Q1 | Failed delivery | The driver picks a reason from a list; the buyer can report a problem with the item instead of giving the PIN; buyer and seller see the reason; an admin then retries or refunds. |
| Q2 | Buyer cancels after paying | Yes, until the item is picked up. |
| Q3 | Support | No phone for now: a support email + an in-app chat with the support team. |
| Q4 | Sign-in length on the phone | Stays 60 days for now (asked what it meant; explained). |
| Q5 | Admin types | Several types plus an **owner** who sees and manages everything. |
| — | Apple button | Stays; Apple sign-in will be finished before production. |
| — | Going live | Not now: test everything against the backend with the fake (seed) items. |
| D2, D4, D1, D9 | Payment provider, hosting, photo storage, staff domain (`BACKEND_PLAN.md` decisions). | External phase |

---

## 6. External (waiting on accounts) — for completeness

⏸ Domain `sahla.jo` (blocks email, staff domain D9, HTTPS hosts) · ⏸ Postmark approval (B9.1) · ⏸ payment
provider + merchant account (D2, B7.9) · ⏸ hosting + managed PostgreSQL (D4, B12) · ⏸ R2 bucket (D1) · ⏸
Google Vision key (real OCR) · ⏸ Sentry · ⏸ MoDEE / Sanad (B11) · ⏸ Google Play Console (release SHA-1, store
listing) · ⏸ Apple Developer account (iOS build, Apple sign-in, APNs).

## Log
- 2026-11-07: first audit. All tests green; the app's catalog/negotiation/orders still on mock data; driver app
  usable with gaps C1–C5; seller has no "My sales" or edit/withdraw screens.
