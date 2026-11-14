# Madmoon Deals Internal Readiness Plan

Everything that can be finished **without a third-party account or API**, and how each part is proven.
Written 2026-11-08 from a re-audit of `501800b`. Detail and evidence for security items stay in
[`SECURITY_PLAN.md`](SECURITY_PLAN.md) (its Log), the feature plan in [`BACKEND_PLAN.md`](BACKEND_PLAN.md).

**Status:** ✅ done and tested · 🔨 in progress · ⬜ to do · ⏸ needs an outside account (not in this plan's scope)

## The test gates ("multiple testing")

No item is ✅ until its own test exists. Each phase must then pass gates 1–3; the final run must pass all of them.

| Gate | What runs | Proves |
|---|---|---|
| G1 | `typecheck` + lint in backend, frontend, admin; admin build | The code is consistent |
| G2 | Backend unit tests + end-to-end tests on a real PostgreSQL; app Jest tests | Each rule works; old behaviour didn't break |
| G3 | Each new fix has a test that **fails without the fix** | The test really catches the problem |
| G4 | Attack script against a server in **production mode** (`npm run check:attack`) | Headers, forged tokens, injection, fuzzing, from the outside |
| G5 | Maestro flows on the emulator against the real backend, plus auctions, offers and chat | The phone app works end to end |
| G6 | Dashboard in headless Chrome under the production security headers, every page by admin type | The website works with the strict policy |
| G7 | Load test, backup + restore into a fresh database, release APK inspection | Production behaviour |
| G8 | Everything in G1–G2 **three times in a row** | Nothing passes by luck (flaky tests) |

## Phase 1 — Money and orders

| # | Item | Status |
|---|---|---|
| M1 | **Found:** the delivery PIN is in three admin API answers (assign, unlock PIN, retry) | ✅ |
| M2 | **Found:** two refunds at once can both reach the bank; a refund can race a delivery (money back *and* a payout). One row lock around the provider call (S3.4) | ✅ |
| M3 | **Found:** a PIN could confirm a delivery that was never picked up | ✅ |
| M4 | Double calls in parallel: pay, refund, cancel, confirm, payout (S3.4) | ✅ |
| M5 | Bad amounts on every money field: `-1`, `0`, `1e15`, `1.5`, strings (S3.5) | ✅ |
| M6 | PIN random, unlogged, buyer only (S3.6) | ✅ |
| M7 | A card number can never be sent to our server (S3.2) | ✅ |
| M8 | **Found:** sellers have nowhere to give a bank account. Payout account: encrypted IBAN, re-authentication to change, payouts held 24 h after a change, seller pushed + emailed, finance sees it (S3.7) | ✅ |
| M9 | Daily money check: our own records must add up (`npm run money:check`, S3.8). Comparing with the provider's report waits for D2 | ✅ |
| M10 | **Found:** an auction whose winner never pays is stuck forever: the seller can withdraw it 48 hours after it ends | ✅ |

## Phase 2 — Accounts, privacy and who-sees-what

| # | Item | Status |
|---|---|---|
| A1 | No account enumeration at sign-up or reset (S1.3) | ✅ |
| A2 | Reset signs out everywhere; limits per IP and per email, not only the pair (S1.5) | ✅ |
| A3 | Production secrets: not the example value, ID hash key required and different (S1.1) | ✅ |
| A4 | **Account deletion really removes personal data**, files included; refused while money is owed, in live auctions, or for staff (S1.9) | ✅ |
| A5 | Two-user test for every endpoint with an id (S2.1) | ✅ |
| A6 | Buyer's address: seller never, courier only while assigned (S2.3) | ✅ |
| A7 | Store keys only touch their own store (S2.5) | ✅ |
| A8 | No secret field in any answer, checked by a walker over real responses (S2.6) | ✅ |
| A9 | Data retention rules + clean-up job (S8.3), matching the privacy policy | ✅ |
| A10 | Download my data: `GET /me/export`, a button in the app (S8.4) | ✅ |
| A11 | Sanad consent enforced (S8.2), breach plan (S8.5), secrets register (S7.3) | ✅ |

## Phase 3 — Server and files

| # | Item | Status |
|---|---|---|
| F1 | S3-compatible storage (R2 / S3) with public + private buckets, tested with an independent signature check; `npm run check:storage` for the real bucket (S0.5) | ✅ |
| F2 | Photo headers (S4.4), CSV formula injection (S4.5) | ✅ |
| F3 | Overall limit per IP; null bytes and broken URLs are 4xx, never 500 (fuzz) | ✅ |
| F4 | Errors: no stack or SQL to clients, no personal data in logs (S7.6, S7.8); outgoing calls have timeouts (S7.5) | ✅ |
| F5 | Error reporter with scrubbing, tested on a local fake Sentry; it stays off until there is a DSN (S0.10) | ✅ |
| F6 | Clean shutdown, health check, Dockerfile, `migrate deploy` on release (B12.2) | ✅ |
| F7 | Backup + restore scripts, restore really tested (B12.3, S7.7) | ✅ |
| F8 | Dashboard security headers, tested in Chrome (S5.3, S5.2, S5.7) | ✅ |
| F9 | CI: secret scan, `npm audit`, CodeQL, Docker build (S7.9, S7.10) | ✅ |

## Phase 4 — The app

| # | Item | Status |
|---|---|---|
| P1 | Release builds strip `console.*`; no test address, mock flag or secret in the bundle (S6.2–S6.4) | ✅ |
| P2 | PIN and card screens hidden from screenshots and the app switcher (S6.5) | ✅ |
| P3 | Push texts carry no PIN or address (S6.6); a push can't open someone else's order (S6.7) | ✅ |
| P4 | Only needed permissions in the merged release manifest (S6.9) | ✅ |
| P5 | Arabic app name (in the APK), splash screen (seen), screen-reader labels on main actions | ✅ |
| P6 | Payout account + download-my-data screens | ✅ |

## Phase 5 — Prove it

| # | Item | Status |
|---|---|---|
| T1 | Attack script (G4) | ✅ |
| T2 | Offers, chat, auction + won-auction checkout, live chat and unread as Maestro flows (G5): 01–09 pass | ✅ |
| T3 | Dashboard check of every page by admin type (G6): 38 pages clean | ✅ |
| T4 | Load test, restore test, release APK inspection (G7) | ✅ |
| T5 | Three full runs in a row (G8) of everything without the emulator; record results here and in `SECURITY_PLAN.md` | ✅ |

## Not in this plan (needs an outside account)

Domain `sahla.jo` · Postmark · payment provider (D2) · hosting (D4) · R2 bucket · Google Vision · Sentry project ·
MoDEE / Sanad · Play Console · Apple Developer · regenerating the Maps key and restricting the Firebase key.
**The owner still has to:** create the upload key, give the real support email, and have a lawyer read the legal text.

## Results (2026-11-10): two servers behind a balancer (`npm run balancer-test`)

Stage 1 of `LOAD_BALANCER_TEST_PLAN.md`, on this PC: two servers (4201, 4202, `TRUST_PROXY=1`, real limits) on `madmoon_load_test`, the small Node balancer from `scripts/balancer.ts` (nginx for Windows couldn't be downloaded here), virtual phones from separate local addresses. **Run three times; the last two back to back, 12 of 12 each.** The first run had 1 failed request out of 2 495 in check 8 (not recorded which; the script now prints it) and never came back. Numbers below are the last run's.

| # | Check | Result |
|---|---|---|
| 1 | A bid reaches phones on the other server | 200 phones (100 per server), 50 bids to A then 50 to B: none missed, none out of order, average 14 ms, worst 84 ms |
| 2 | Chat signals cross servers | 100 pairs, sent on A, heard on B: 100 of 100, nobody heard another's, average 53 ms, worst 94 ms |
| 3 | Quiet for 3 minutes behind a 60-second idle cut | 0 of 200 dropped |
| 4 | Server B killed mid-auction | All 100 of B's phones back on A, average 1.0 s, worst 1.5 s; no phone missing a bid |
| 5 | B comes back | 50 of 100 new phones land on it; 20 bids to both: 300 of 300 phones got all |
| 6 | Limits see the real person | 1 300 phones from one address: 1 200 let in (600 a minute **per server**); 50 others all let in. With `TRUST_PROXY=0` the 50 others are all refused: everyone looks like the balancer |
| 7 | 200 → 1 000 → 2 000 → 4 000 phones | All connected and got every bid. Worst delay 27, 52, 84, 153 ms. Servers' memory (Windows working set) 180 to 240 MB each at 2 000 connections, so the 220 KB per connection measured before is a high estimate |
| 8 | 500 past the limit (4 500) | Exactly 500 refused with 503; they asked every 3 s: 2 493 requests, 0 errors, all saw the last bid; the 4 000 connected missed nothing |
| 9 | Live connections down for everyone, 1 000 asking every 3 s | 661 requests a second for 60 s: 0 errors, p50 8 ms, p95 30 ms, worst 533 ms; both servers up |

**Found:** the live connection limits (1 000 open and 600 new a minute per address) count per server, so two servers let one address in twice over. Left as it is: they protect each server's memory (`DEPLOY.md`). **Fixed with it (LOAD_BALANCER_TEST_PLAN L1 to L3):** daily jobs claim their day in `JobRun` so one server runs them (`jobs.e2e.ts`); every rate-limit budget is counted in the `RateLimit` table (`sharedLimits.e2e.ts`: 5 card tries split across two servers, the 6th refused); only a hash of each key is stored, after `privacy.e2e.ts` S1.9 caught emails and user ids left in it; `DEPLOY.md` has the connection sum. The run above had both fixes in. `npm run load-test` with the shared counts: 540 requests a second, 0 errors (was 510 to 520): no slower. Backend 36 unit + 263 end-to-end (1 skipped, Linux only).

## Results (2026-11-09): live bids and chat, and the runs that were missing

| Gate | Result |
|---|---|
| **A bid on another person's screen** (emulator, debug build, no graphics card; 15 each, from sending to the screen updating) | Bid: average **396 ms**, slowest 531 ms (was 1 550 and 3 050). Message: average **248 ms**, slowest 309 ms (was about 2 500 and 5 000 by calculation). |
| Same, without a phone, by the number of people | Bids to 1 000 watchers: average 84 ms, slowest 180. Chat among 250 pairs: average 54 ms, slowest 550. Simulated slow mobile network: slowest 638 ms. Live connection down: bids within 3 s, messages within 5 s. |
| G5, Maestro on the real backend | **9 of 9 flows.** 06 failed on its first run because of the flow itself, fixed. |
| G6, dashboard in Chrome under its real headers | 38 pages clean by admin type, each sees only their own, injected scripts blocked, QR code shows. |
| G3, `check:mutations` | 70 protections on the server, 43 in the app (a one-off script for the app's side): all caught, after closing the gaps that found. |
| G7, load | About 510 requests a second with live connections on. **On/off comparison: no difference**, measured while another program had halved the PC's speed. |
| G1 + G2, three runs in a row | Backend 36 unit + 245 end-to-end (1 skipped, Linux only), app 262, types clean, lint 0 errors |
| G4 and G7 | `check:attack` 17 615 checks, 0 problems (Express routes only: the WebSockets have their own tests). Release APK, secrets, backup drill, audits: clean. |

**Auctions extend:** a bid in the last 45 seconds adds 45 seconds, up to 5 minutes after the end the seller set. Maestro 10 and 11 show it on a watching person's screen, and that Place Bid stays in reach without scrolling (the first version of the explanatory note pushed it off the screen; only the phone run caught that).

**Found on the way, not fixed:** the error toast on the auction screen sits over the Quick Add row until it goes, so tapping +25 then dismisses the toast instead.

## Results (2026-11-08)

### Passed

| Gate | Result |
|---|---|
| G1 + G2, **three runs in a row** (G8) | Each time: backend 36 unit + 204 end-to-end (1 skipped: the SIGTERM test needs Linux), app 215, types clean, lint 0 errors, dashboard builds |
| G3, tests that fail without the fix | The new bug tests were run on the old code first. `npm run check:mutations`: **39 protections broken on purpose, all caught.** The first pass missed 2, both real gaps in the tests, both fixed. |
| G4, attack on a production-mode server | 17 615 checks, 8 460 junk requests across 119 routes, 109 reached past their guards: **0 problems** |
| G7, load | 60 people on 2 000 listings: 520 requests a second, every p95 under 400 ms, 0 errors |
| G7, backup drill | Encrypted, wrong key refused, 28 tables and 247 rows identical |
| G7, release APK (`npm run check:apk`) | No keys, test addresses or demo code; not debuggable; no plain http; no unused dangerous permissions |
| `check:secrets`, `npm audit` | 105 commits, no keys. Backend and dashboard 0 vulnerabilities; the app's are as in S7.9 |
| Emulator | Flows 01, 02, 03 passed on the real backend. Screenshot protection confirmed (a black capture). |

### Not finished: what hasn't been shown to work yet

| What | Why | To finish |
|---|---|---|
| Linux-only and CI: the SIGTERM test, gitleaks, CodeQL, Docker image build | Need the branch on GitHub; Docker isn't on this PC | Push the branch |
| Real S3 bucket | Downloading MinIO was refused by this PC's permissions; a real bucket is an outside account anyway | `npm run check:storage` when R2 exists |

