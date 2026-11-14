# Madmoon Deals Launch Readiness

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
| Backend end-to-end tests (real PostgreSQL, `madmoon_test`) | ✅ 121 / 121 |
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
| C3 | **No Madmoon Deals support number in the app**, but two driver messages say "Call Madmoon Deals support". | Driver is stuck at the door. | Before launch |
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

**Brought up to date 2026-11-10. This list is finished except where marked: the working order from here
is [`NEXT_STEPS.md`](NEXT_STEPS.md).** Sections 1 to 3 above are the 2026-11-07 audit as it was, kept for the record.

### Step 1 — Put the app on the real backend (the big one)
1. ✅ `mock.catalog`, `mock.negotiation`, `mock.orders` are `false` (B15.10).
2. ✅ Backend with `PAYMENT_MODE=fake` and seed data; the phone tests start it themselves (`npm run e2e:backend`).
3. ✅ Every customer journey on the emulator against the backend: Maestro 01 to 11 (browse, buy and deliver, sell,
   cancel and problems, offer and counter, auction bid, auction win and pay, bank account, live chat, late bids).
4. ✅ The Maestro flows run against the real backend and seed (`frontend/.maestro/`, the `phone-tests` skill).
5. ✅ Demo-only paths out of release builds: `check:apk` found and removed the demo hint, accounts and mock services.

### Step 2 — Close the customer gaps (§3)
1. ✅ **My sales** (B15.9).
2. ✅ **Push to the seller when an item is paid** (B15.1, `pushSold`).
3. ✅ **Edit / withdraw listing** (B15.2).
4. ⏸ The Apple button stays (owner, 2026-11-07); Apple sign-in waits for the Apple account (`NEXT_STEPS.md` B11, S0.11).
5. ✅ Won-auction checkout end to end (Maestro 07).

### Step 3 — Close the driver gaps (§2)
1. ✅ C1 push to the driver on assignment (B15.5, `pushAssigned`).
2. ✅ C4 push to the buyer on "picked up" (B15.5, `pushPickedUp`).
3. ✅ C3 support: an email setting and an in-app support chat, no phone (owner's answer Q3, B15.6).
4. ✅ C2 "Delivery failed" with a reason, a buyer's "problem with the item", a dashboard queue (B15.4).
5. ⬜ C5 full driver run on a real phone: `NEXT_STEPS.md` A4.6.

### Step 4 — Security fixes that need no external account
✅ S0.1, S0.2, S0.4, S0.8, S0.9 (2026-11-10) and the S2.1 two-user test: `SECURITY_PLAN.md` and its Log.
S0.11 waits with Step 2.4.

### Step 5 — Legal and trust screens
1. ✅ Privacy policy and terms in the app and on the API, accepted at sign-up with the version (B15.8).
2. ✅ The Sanad consent screen (`IdVerificationScreen.tsx`); the service itself waits for MoDEE (`NEXT_STEPS.md` B2).
3. ✅ Retention rules and the clean-up job (`privacy/retention.ts`, S8.3).

### Step 6 — Production code that doesn't need the account yet
1. ✅ S3/R2 storage behind `lib/storage.ts` (S0.5); the bucket waits for `NEXT_STEPS.md` B6.
2. ✅ Sentry on the API with scrubbing (S0.10); the account, app and dashboard sides wait for B8.
3. 🔨 Release signing script and `RELEASE_SIGNING.md` ✅; the key itself is the owner's step (`NEXT_STEPS.md` A5.2).
4. ✅ Splash screen and the Arabic app name; ⬜ the TalkBack pass on a real phone (`NEXT_STEPS.md` A4.7).
5. ✅ Dockerfile, `prisma migrate deploy` on release, health check (`backend/docs/DEPLOY.md`); first build in the pull request's checks.
6. ✅ Load test (B12.5), and the two-server balancer test (`npm run balancer-test`, 2026-11-10).

### Step 7 — Merge
⬜ The pull request `feat/backend-b8-admin` → `main`: `NEXT_STEPS.md` A1.

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
- 2026-11-10: §4 brought up to date: every internal step done except C5 and the TalkBack pass (real phone),
  the release key (owner) and the merge. From here the order is `NEXT_STEPS.md`.
- 2026-11-07: first audit. All tests green; the app's catalog/negotiation/orders still on mock data; driver app
  usable with gaps C1–C5; seller has no "My sales" or edit/withdraw screens.
