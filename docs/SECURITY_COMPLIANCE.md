# Security and compliance: what is in place, against the standards

Written 2026-11-11 from a draft the owner supplied, **each claim checked against the code** on that day. Where the draft said more than the code does, this file says what is really there. The standards:

* OWASP MASVS (the mobile app)
* OWASP API Security Top 10, 2023
* PCI-DSS, the short self-assessment for merchants who never see a card (SAQ A)
* Jordan's Personal Data Protection Law (No. 24 of 2023); ISO/IEC 27001 as a guide only
* Google Play's security and data-safety rules

**Status:** ✅ built and has a test · 🟡 built, but depends on something not done yet · ⬜ not yet.

**This is not a certificate.** Nothing here has been audited by an outside party. "Compliant" with PCI-DSS or the Jordanian law is for the payment provider's assessment and a lawyer (`NEXT_STEPS.md` B1, B12) to say. Use the words "aligned with" outside the company until then.

The full list of rules, with a log line for each, is `SECURITY_PLAN.md`. The design problems still open in the payment path are in `BACKEND_REVIEW.md`.

## 1. The mobile app (MASVS)

### 1.1 Storage and privacy (MASVS-STORAGE)

| Control | What is there | Proof | Status |
|---|---|---|---|
| Sign-in token | In the Android Keystore through `react-native-keychain`, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Old builds that kept it in MMKV move it on first launch. MMKV holds settings and the device id, never the token | `frontend/src/services/api/tokenStorage.ts` | ✅ |
| Screenshots and the app switcher | `FLAG_SECURE` on checkout (card entry), order tracking (the delivery PIN), the courier's delivery screen, the payout account and the profile (card shown). A capture comes out black | `ScreenSecurityModule.kt`, `lib/secureScreen`; seen on the emulator 2026-11-08 | ✅ |
| Logs | Release builds remove every `console.*` (`transform-remove-console`) | `frontend/babel.config.js`; `npm run check:apk` | ✅ |
| Backups | `android:allowBackup="false"` | `AndroidManifest.xml` | ✅ |

### 1.2 Cryptography (MASVS-CRYPTO)

| Control | What is there | Proof | Status |
|---|---|---|---|
| Passwords | `scrypt` with a random 16-byte salt per password, compared in constant time. Never stored or logged in plain text | `backend/src/modules/auth/password.ts` | ✅ |
| National ID numbers, certificate serials | Kept only as a keyed hash (HMAC-SHA-256 with `ID_HASH_SECRET`), never the number | `lib/hash.ts`; schema `nationalIdHash`, `serialHashes` | ✅ |
| Seller IBANs | **Encrypted, not hashed** (the draft said hashed): Madmoon Deals has to read the IBAN back to pay the seller. Only the last 4 digits are shown | `lib/sealed.ts`; schema `payoutIban` | ✅ |
| `ID_HASH_SECRET` | Must be set and different from `JWT_SECRET` in production; can never change once real IDs are stored. **No copy off this PC yet** | `env.ts`; `NEXT_STEPS.md` A5.5 | 🟡 |

### 1.3 Network (MASVS-NETWORK)

| Control | What is there | Proof | Status |
|---|---|---|---|
| HTTPS only | A release build calls `https://api.sahla.jo/v1`; plain `http` is off in the release manifest. **The domain is not registered yet** (B3), so a release build has nothing to reach until then | `frontend/src/config.ts`; `check:apk` | 🟡 |
| Time limits | 15 seconds a request, 60 seconds an upload | `config.ts` `requestTimeoutMs`, `uploadTimeoutMs` | ✅ |
| TLS version | Set by the host's load balancer, not by the app | Part C of `NEXT_STEPS.md` | ⬜ check on the host |

### 1.4 Resilience (MASVS-RESILIENCE)

| Control | What is there | Proof | Status |
|---|---|---|---|
| Shrinking and obfuscation | R8 on, resources shrunk, in release | `android/app/build.gradle` | ✅ |
| Signing | **Not done.** The upload key isn't created (A5.2) and there is no Play Console account for Play App Signing (B4). The release build is not signed with the debug key; `check:apk` checks that it isn't debuggable | `RELEASE_SIGNING.md` | ⬜ |

## 2. The API (OWASP API Security Top 10, 2023)

| Risk | What is there | Proof | Status |
|---|---|---|---|
| **API1 Object-level authorization** | Every query for a person's things is limited to that person (`getOrder(userId, orderId)` and the rest). A second person asking for the first one's order, chat, offer or listing gets 404 | `lib/authz.e2e.ts`: a two-person check of every endpoint with an id | ✅ |
| **API2 Authentication** | Tokens checked with `HS256` only, plus issuer and audience: `alg: none` and key-confusion tokens are refused. Every token is tied to a `Session` row: logging out, a password reset, a suspension, an admin change and account deletion delete the rows, and the token stops working at once. Sign-in, sign-up, reset and codes are limited per address and per email. Accounts can't be discovered through sign-up or reset | `auth/tokens.ts`; `auth.e2e.ts`, `privacy.e2e.ts` (S1.3, S1.5); `check:attack` forged tokens | ✅ |
| **API3 Property-level authorization** (mass assignment) | The profile edit takes only the name and city; anything else in the body is dropped. The listing edit is `.strict()`: an unknown field is refused. Answers never carry the PIN, role or other secret fields | `auth.e2e.ts` (role, verified, suspended, email, password and payout fields change nothing, added 2026-11-11); `leaks.e2e.ts` | ✅ |
| **API4 Resource consumption** | Every budget is counted in the database (`RateLimit` table), so two servers can't double it. Card and pay attempts: 5 an hour per person, 20 per address. A flood fence per address on each server; body size limits; lists capped | `lib/rateLimit.ts`; `sharedLimits.e2e.ts` | ✅ |
| **API5 Function-level authorization** | `requireUser`, `requireCustomer`, `requireCourier`, `requireAdmin`, and inside the dashboard one permission per admin type. An admin's app token can't open the dashboard. Public sign-up (email and Google) refuses the staff domain | `auth/requireUser.ts`, `admin/permissions.ts`; `authz.e2e.ts`, `admins.e2e.ts` | ✅ |
| **API6 Sensitive business flows** | The delivery needs the buyer's 4-digit PIN; 5 wrong tries lock it until an admin unlocks it. The PIN is random, never logged, shown to the buyer only. Card testing: see API4 | `courier/delivery.ts` (`PIN_TRIES = 5`); `courier.e2e.ts` | ✅ |
| **API7 SSRF** | The server only calls fixed addresses (maps, Vision, Firebase, the payment provider). It never fetches an address a person typed. Uploaded photos are checked by their bytes, not their name | `check:attack` | ✅ |
| **API8 Misconfiguration** | Security headers; no stack or SQL in errors; broken input is a 4xx, never a 500. CORS: only the dashboard's own address (`ADMIN_ORIGIN`) gets CORS headers, never `*`. **`ADMIN_ORIGIN` is not set anywhere yet**: it waits for the dashboard's address (C7) | `app.ts`; `check:attack` (17 615 checks, 0 problems, 2026-11-09) | 🟡 |
| **API9 Inventory** | Every route is in `docs/API.md`; the attack script walks all of them | `check:attack` | ✅ |
| **API10 Unsafe use of other APIs** | Every outgoing call has a time limit. Answers from Google sign-in are checked by signature, issuer and audience | `auth/social.ts` | ✅ |

## 3. Money (PCI-DSS SAQ A, escrow)

| Control | What is there | Proof | Status |
|---|---|---|---|
| No card data on Madmoon Deals' servers | The server refuses anything that looks like a card number, wherever it is sent; it takes only the provider's token | `payments/cardToken.ts`; `check:attack`; the card-number test in `INTERNAL_READINESS_PLAN.md` M7 | ✅ |
| Card entry in the provider's SDK or page | **No provider yet** (B1): today a fake provider stands in, and a release build refuses to pay (503) until there is one. SAQ A applies once the provider's own form takes the card | `NEXT_STEPS.md` B1, Part E | ⬜ |
| Prices on the server | The total is the item price + 3% buyer protection (at least 1 JOD) + 2 JOD delivery, all in fils, worked out by the server; a price the app sends is ignored | `frontend/src/lib/money.ts` (shared with the server); double-call and bad-amount tests (M4, M5) | ✅ |
| Row locks | Paying, refunding, cancelling and paying out lock the order's row (`FOR UPDATE`); two at once can't both go through | `orders/pay.ts`, `orders/problems.ts`; parallel-call tests | ✅ |
| Payout hold | A changed IBAN holds payouts for 24 hours, needs the password again, and the seller is pushed and emailed | `payouts/account.ts` (`PAYOUT_HOLD_MS`) | ✅ |
| Money records kept | Payment and payout rows can never be deleted with an order (the database refuses) | `retention.e2e.ts`, `privacy.e2e.ts` (H3) | ✅ |
| **Not yet safe for real money** | Nine design problems in the payment path: charge before the record (H1), no webhook (H2), refund marked before the money moves (H4), the bank called inside a transaction (H5), no idempotency key (H6), nothing after delivery (H7), Madmoon Deals holding the money (H8, a legal question), all-or-nothing refunds (H9). The row locks above don't cover these | `BACKEND_REVIEW.md`; `NEXT_STEPS.md` Part E | ⬜ before any real payment |

## 4. Personal data (Jordan Law No. 24 of 2023)

| Control | What is there | Proof | Status |
|---|---|---|---|
| National ID | Never stored as the number: a keyed hash only (see 1.2) | schema `nationalIdHash` | ✅ |
| Consent before Sanad | A consent screen; the version and time are recorded before any lookup, and the server refuses without them. **Sanad itself isn't connected** (B2) | `identity/sanad.ts`; S8.2 | 🟡 |
| Private files | Certificate originals and ID papers go to a private bucket (`S3_PRIVATE_BUCKET`), opened only by short-lived signed links. The server refuses to start with one bucket for both. **No real bucket yet** (B6) | `lib/storage.e2e.ts` (independent signature check); `env.ts` | 🟡 |
| Erasure (`DELETE /me`) | Removes name, email, phone, addresses, photos and files; keeps the money records without who or where. Refused while money is owed, in a live auction, or for staff | `privacy.e2e.ts` S1.9 (no personal data left in any table or on disk) | ✅ |
| Retention | Phones and addresses go 90 days after an order ends; abandoned checkouts, old chats, sessions and codes on their own schedules | `retention.e2e.ts` | ✅ |
| A copy of my data | `GET /me/export` and a button in the app, with no secrets in it | `privacy.e2e.ts` S8.4 | ✅ |
| Breach plan | Written; **the contacts aren't filled in** (S8.5) | `SECURITY_PLAN.md` | 🟡 |
| Where the data lives, the legal text | A lawyer has to answer whether data may be stored outside Jordan, and read the privacy policy and terms | `NEXT_STEPS.md` B12 | ⬜ |

## 5. Google Play

| Control | Status |
|---|---|
| Only the permissions the app uses, checked in the merged release manifest (S6.9) | ✅ |
| Data-safety form, privacy policy address | ⬜ with the Play Console account (B4) |
| Play App Signing, upload key | ⬜ A5.2, B4 |
| Restricted Maps and Firebase keys (the Maps key was pasted into a chat on 2026-11-02 and must be replaced) | ⬜ B9 |

## 6. Summary

| Area | Standard | Status |
|---|---|---|
| Token storage | MASVS-STORAGE | ✅ Keystore |
| Screen protection | MASVS-STORAGE | ✅ `FLAG_SECURE` |
| Object-level authorization | API1 | ✅ every query scoped, two-person test of every endpoint |
| Mass assignment | API3 | ✅ fields dropped or refused, tested |
| Rate limits across servers | API4 | ✅ shared in the database |
| Card data | PCI-DSS SAQ A | 🟡 the server refuses card numbers; no provider yet |
| Payment integrity | — | 🟡 row locks ✅; H1, H2, H4 to H9 open |
| National ID | Law No. 24 | ✅ keyed hash; 🟡 private bucket and Sanad not live |
| Release signing | Play | ⬜ |
| Legal review | Law No. 24 | ⬜ |

## What the draft had wrong

The draft this file came from was right on most points. These six are corrected above:

1. **IBANs are encrypted, not hashed.** A hash couldn't be read back to pay the seller.
2. **The profile edit drops extra fields; it doesn't use `.pick` or `.strict()`.** The effect is the same, and a test now shows it. The listing edit is `.strict()`.
3. **CORS allows `ADMIN_ORIGIN`, a setting**, not a fixed `https://admin.sahla.jo`. It isn't set yet.
4. **Release signing and Play App Signing are not done**: no upload key, no Play account.
5. **"Card entry tokenized in the provider's SDK"**: there is no provider yet. What exists today is the server refusing card numbers.
6. **"Compliant" for payments and the law** is more than can be said: the review's payment findings are open, and nobody outside has assessed it.
