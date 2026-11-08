# Sahla Internal Readiness Plan

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
| A10 | Download my data: `GET /me/export`, a button in the app (S8.4) | 🔨 |
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
| F8 | Dashboard security headers (built, `dist/_headers`; the Chrome test is T3) (S5.3, S5.2, S5.7) | 🔨 |
| F9 | CI: secret scan, `npm audit`, CodeQL, Docker build (S7.9, S7.10) | ✅ |

## Phase 4 — The app

| # | Item | Status |
|---|---|---|
| P1 | Release builds strip `console.*`; no test address, mock flag or secret in the bundle (S6.2–S6.4) | ✅ |
| P2 | PIN and card screens hidden from screenshots and the app switcher (S6.5) | ✅ |
| P3 | Push texts carry no PIN or address (S6.6); a push can't open someone else's order (S6.7) | ✅ |
| P4 | Only needed permissions in the merged release manifest (S6.9) | ✅ |
| P5 | Arabic app name, splash screen, screen-reader labels on main actions | 🔨 |
| P6 | Payout account + download-my-data screens | 🔨 |

## Phase 5 — Prove it

| # | Item | Status |
|---|---|---|
| T1 | Attack script (G4) | ✅ |
| T2 | Offers, chat, auction + won-auction checkout as Maestro flows (G5): written, 01–03 pass, 04–08 not finished | 🔨 |
| T3 | Dashboard check of every page by admin type (G6): written, not run | 🔨 |
| T4 | Load test, restore test, release APK inspection (G7) | ✅ |
| T5 | Three full runs in a row (G8) of everything without the emulator; record results here and in `SECURITY_PLAN.md` | ✅ |

## Not in this plan (needs an outside account)

Domain `sahla.jo` · Postmark · payment provider (D2) · hosting (D4) · R2 bucket · Google Vision · Sentry project ·
MoDEE / Sanad · Play Console · Apple Developer · regenerating the Maps key and restricting the Firebase key.
**The owner still has to:** create the upload key, give the real support email, and have a lawyer read the legal text.

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
| **Maestro 04–08** (T2): cancel and problems, offers and chat, auction bid and win, bank account | The PC ran out of memory during the run and the system stopped it. 08 got as far as saving the account; 05, 06, 07 have **never run**, so they may still need fixes. | `npm run e2e:backend` |
| **Dashboard check** (T3, F8's proof): every page by admin type, the QR code under the security headers | Needs the same test backend. `check-pages.mjs` is written but **has never run**. | In `admin/`: `npm run build`, `npm run preview`, `npm run check:pages` |
| Splash screen and Arabic app name (P5) | Built and in the APK, not yet looked at on a screen | Look, in the next emulator run |
| Linux-only and CI: the SIGTERM test, gitleaks, CodeQL, Docker image build | Need the branch on GitHub; Docker isn't on this PC | Push the branch |
| Real S3 bucket | Downloading MinIO was refused by this PC's permissions; a real bucket is an outside account anyway | `npm run check:storage` when R2 exists |

