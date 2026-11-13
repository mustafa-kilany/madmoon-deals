# Next steps

Written 2026-11-10. The order to work in from here, down to the small things. Sources: `INTERNAL_READINESS_PLAN.md` (everything internal is ✅), `LAUNCH_READINESS.md` §6 (outside accounts), `LOAD_BALANCER_TEST_PLAN.md` (the review and the test).

**Status:** ⬜ to do · 🔨 started · ✅ done · ⏸ waiting on someone else. Tick each one here as it's finished.
**Who:** 👤 the owner · 🤖 Claude · 👥 together.

## Where things stand

* Everything that needs no outside account is built and tested: backend, app, dashboard, security plan, live bids and chat, auction extension.
* The branch `feat/backend-b8-admin` is on GitHub (pushed 2026-11-10). Nothing is merged into `main` since B1, and the GitHub checks have never run on this work: they only run on a pull request.
* Not shown to work yet: a real phone, the GitHub-only checks (Linux shutdown test, secret scan, CodeQL, Docker build). The update screen and the notification inbox (A6.2, A6.4) are tested in Jest but not yet seen on the emulator.
* No outside account exists except Google Maps and Firebase.
* **Two servers behind a balancer work** (2026-11-10): `npm run balancer-test`, 12 of 12 checks twice in a row on this PC, with L1 to L3 done (shared rate limits, one server per daily job, the connection sum in `DEPLOY.md`).
* The backend's approach is sound, but the payment code has nine design problems that matter the day real money moves (`BACKEND_REVIEW.md`, Part E below). Of the things before real users, H3, M1, M2, M3 and L7 are fixed (2026-11-10, A6); M4 waits for the pull request's checks and M5 for the owner.

## What to do next (checked 2026-11-11)

Read from this file, `BACKEND_REVIEW.md`, git and `gh` on 2026-11-11. Nothing was changed or run for this list: it is the order only. The step numbers point at the tables below, where each one is ticked.

**First: loose ends from 2026-11-10** (about an hour, 🤖 unless marked)

| # | Step | Who | Status |
|---|---|---|---|
| N1 | Put back two lines in `backend/src/modules/privacy/retention.ts`: the ones that empty `deliveryPhone` and `deliveryAddress` on old orders are removed in the working folder, not committed. It looks like a deliberate break left from a "does the test catch it" run, and `retention.e2e.ts` fails with it. `git restore backend/src/modules/privacy/retention.ts`, then `npm run test:api -- privacy`. | 🤖 | ✅ 2026-11-11: `-- retention` failed 1 of 6 with the break, 6 of 6 after the restore (`-- privacy` doesn't include that file) |
| N2 | Commit the two documents that record yesterday's work: this file and `BACKEND_REVIEW.md`. | 🤖 when asked | ✅ 2026-11-12 (0068f69) |
| N3 | Finish A3.4: S0.9 is already marked and logged in `SECURITY_PLAN.md`. What's left is rerunning `check:mutations` and the three-runs gate after yesterday's five commits; no rerun is written down. Emulator off first. | 🤖 | ✅ 2026-11-12: `check:mutations` 85 of 86 caught, the 86th a stale entry (the auction extension changed the code it breaks), fixed and caught; 2 new cases caught. Three runs in a row: the third caught a flaky jobs test (the first of five same-moment inserts doesn't always win), fixed; then three clean runs: backend 36 unit + 283 end-to-end (1 skipped), app 278, types, lint 0 errors, dashboard |
| N4 | See the update screen and the notification inbox on the emulator (A6.2, A6.4): so far they are tested in Jest only. A Maestro flow for each. | 🤖 | 🔨 flows 12 (inbox) and 13 (update screen) written, the runner restarts the backend for 13; not run on the emulator yet |
| N5 | `npm run check:secrets`, then push: 10 commits are on this PC and not on GitHub. | 🤖 when asked | ✅ 2026-11-12: the scan first stopped on balancer-test.ts's deliberately unreachable database address; let through by address only |

**Then: into `main`**

| # | Step | Who | Status |
|---|---|---|---|
| N6 | A1.3: `gh auth login`. Still not signed in on 2026-11-11. Or skip it and open the pull request by the link in A1.4. | 👤 | ✅ 2026-11-12 |
| N7 | A1.4 to A1.7: the pull request (106 commits ahead of `main`), its checks, a fix per failure, merge, the tag. The checks also answer A6.1 (M4: does the stop signal reach the server in the container). | 🤖, 👤 presses Merge | ✅ 2026-11-13: pull request #1 merged (f3fa538) with every check green after five runs; tagged `v0.9.0-internal`. Fixed from its checks: the image crashed as a test copy (logger), M4 (the stop signal never reached the server through npx), the leak scan's permission, the shutdown test's port and its hang. CodeQL paused by the owner (private repository, paid add-on) |
| N8 | A5.6: Maestro 01 to 11 once on the merged `main`. | 🤖 | ⬜ |
| N9 | A4: two real phones, all of A4.1 to A4.9. Needs the phones and a cable from the owner. | 👥 | ⬜ |

**The owner, alongside, starting now** 👤

* B1 to B4, slowest first: the payment provider (with the seven questions in Part E), the MoDEE packet, `sahla.jo`, the Google Play account. None is started and everything after Part A waits for them.
* A5.2 the upload key and its two copies; A5.5 a copy of `backend/.env` off this PC.
* Three decisions: A5.1 (the toast over the Quick Add row), A6.5 (M5, a `shared/` folder), and the ones under Part E (the hold after delivery, who pays the delivery fee on a cancel, who holds the money).

**Waiting, nothing to do yet**

* Part C waits for the host (B5). Part E (H1, H2, H4 to H9, M7 to M9) waits for the provider's test keys (B1). Part D waits for both.
* From the review, 20 of 26 findings are open: those eleven, M4 (N7), M5 (the owner), and L1 to L6 and L8, which are read again before the production copy (A6.7).

## Part A: now, no account needed

### A1. Get the work onto GitHub and into `main`

| # | Step | Who | Status |
|---|---|---|---|
| A1.1 | `npm run check:secrets` in `backend`: 110 commits, 616 files, no secrets | 🤖 | ✅ 2026-11-10 |
| A1.2 | Push `feat/backend-b8-admin` | 🤖 | ✅ 2026-11-10 |
| A1.3 | Sign the new GitHub tool in, once: `gh auth login` → GitHub.com → HTTPS → "Login with a web browser" → paste the code it shows. **"gh is not recognized"** (seen 2026-11-10): VS Code was open when `gh` was installed, and a new terminal inside it isn't enough. Close every VS Code window and open it again, or run `& "C:\Program Files\GitHub CLI\gh.exe" auth login`. | 👤 | ✅ 2026-11-12 |
| A1.4 | Open the pull request `feat/backend-b8-admin` → `main`. Without A1.3: open `https://github.com/mustafa-kilany/Sahla/pull/new/feat/backend-b8-admin` and press "Create pull request". | 🤖 after A1.3, or 👤 by the link | ✅ 2026-11-12: #1 |
| A1.5 | Wait for the checks (15 minutes at most each): app, backend, dashboard, secret scan, CodeQL, Docker build. First run ever, so expect something to fail. | 🤖 | ✅ 2026-11-12 |
| A1.6 | Fix each failure, one commit each, push, repeat until green. Likely places: the Linux-only shutdown test (never run), the Docker build (Docker isn't on this PC), line endings. | 🤖 | ✅ 2026-11-12: five runs, every failure fixed with its own commit |
| A1.7 | Merge into `main`. Tag it `v0.9.0-internal`. | 👤 presses Merge, 🤖 tags | ✅ 2026-11-13: merged (f3fa538), tagged `v0.9.0-internal` |
| A1.8 | From then on: a new branch per piece of work, a pull request each, never 43 commits waiting again. | 👥 | ⬜ |

### A2. The offline balancer test (Stage 1)

Detail and pass marks: `LOAD_BALANCER_TEST_PLAN.md`.

| # | Step | Who | Status |
|---|---|---|---|
| A2.1 | Close games and Android Studio first: a heavy program halves the results. The emulator isn't needed and should be off. | 👤 | ✅ 2026-11-10 |
| A2.2 | Try to download nginx for Windows (a zip, no installer). If this PC refuses, as it did MinIO, skip to A2.4. | 🤖 | ✅ 2026-11-10: refused here, as MinIO was; skipped to A2.4 |
| A2.3 | Write `backend/scripts/balancer-test.ts` and `npm run balancer-test`: own database `sahla_load_test`, two servers on ports 4201 and 4202 with `TRUST_PROXY=1`, the balancer on 4200, virtual phones from addresses 127.0.0.2 upward. | 🤖 | ✅ 2026-11-10 |
| A2.4 | The small Node balancer inside the script, for the large numbers and as the fallback. | 🤖 | ✅ 2026-11-10 |
| A2.5 | Run checks 1 to 6 at 200 phones through nginx. | 🤖 | ✅ 2026-11-10 |
| A2.6 | Run checks 7 to 9 (up to 4 500 phones) through the Node balancer. Note each server's memory at every step. | 🤖 | ✅ 2026-11-10 |
| A2.7 | Run everything a second time: a result that only happens once doesn't count. | 🤖 | ✅ 2026-11-10 |
| A2.8 | Write the results table into `INTERNAL_READINESS_PLAN.md` and tick `LOAD_BALANCER_TEST_PLAN.md`. Commit. | 🤖 | ✅ 2026-11-10 |

### A3. Make two servers safe (only needed before a second server)

Skip until the numbers ask for a second server, or do it now while the test from A2 is fresh. About half a day.

| # | Step | Who | Status |
|---|---|---|---|
| A3.1 | **L2:** `daily()` in `backend/src/lib/jobs.ts` takes a database lock named after the job; a server that doesn't get it skips. Test: two servers, the job runs once. | 🤖 | ✅ 2026-11-10 |
| A3.2 | **L1:** a PostgreSQL store for every `rateLimit(...)` (`lib/rateLimit.ts`, `app.ts`, `auth/routes.ts`, `admin/auth.ts`, `geocode/routes.ts`). Check the package is maintained before adding it; otherwise a small table and 40 lines. Test: 5 card tries split across two servers, the 6th refused. Measure that it doesn't slow requests. | 🤖 | ✅ 2026-11-10 |
| A3.3 | **L3:** `DEPLOY.md` gets the rule "servers × (`DB_POOL_SIZE` + 1) must be under the database's connection limit", with the sum for one and two servers. | 🤖 | ✅ 2026-11-10 |
| A3.4 | Mark S0.9 done in `SECURITY_PLAN.md` with its log line. Rerun `check:mutations` and the three-runs gate. | 🤖 | ✅ 2026-11-12 (see N3) |

### A4. A real phone

The emulator has no real radio, camera, GPS or notification tray. Nothing has ever run on a real phone.

| # | Step | Who | Status |
|---|---|---|---|
| A4.1 | Two Android phones, a USB cable. On each: Settings → About phone → tap "Build number" 7 times → Developer options → turn on "USB debugging". | 👤 | ⬜ |
| A4.2 | Work out how the debug build reaches this PC from a phone: it calls `10.0.2.2`, which only the emulator understands. Probably `adb reverse` for ports 4000 and 8081 plus a debug-only address; to be found and written into `HOW_TO_RUN.txt`. | 🤖 | ⬜ |
| A4.3 | Plug in, accept the "Allow USB debugging?" box on the phone, `adb devices` shows it. `npm run android`. | 👥 | ⬜ |
| A4.4 | By hand on phone 1 and phone 2: sign up, list an item with a **camera** photo, buy it from the other phone, an offer and a counter-offer, a chat with unread counts, an auction with a bid from each, a late bid extending it. | 👤 | ⬜ |
| A4.5 | Push notifications arrive with the app closed (`PUSH_MODE=fcm`): outbid, sold, message. Tapping one opens the right screen. | 👤 | ⬜ |
| A4.6 | One full driver run (C5): assign in the dashboard, driver signs in, picks up, delivers with the PIN; then one failed delivery with a reason. | 👤 | ⬜ |
| A4.7 | Arabic: switch the phone's language, walk the main screens, look for cut-off text and left/right mistakes. TalkBack on for the buy flow. | 👤 | ⬜ |
| A4.8 | Turn Wi-Fi off and on mid-auction: the "Reconnecting" banner shows and goes, the bid list catches up. | 👤 | ⬜ |
| A4.9 | Every problem found goes in a list here; fix, add a test, rerun the Maestro flow that covers it. | 🤖 | ⬜ |

### A5. Small things

| # | Step | Who | Status |
|---|---|---|---|
| A5.1 | Decide: the error toast on the auction screen covers the Quick Add row until it goes. Move the toast above the row, or leave it. | 👤 decides, 🤖 builds | ⬜ |
| A5.2 | Create the upload key by `RELEASE_SIGNING.md`. Copy the key file and its passwords to two places that aren't this PC (a USB stick and a password manager). Losing it means never updating the app on Google Play. | 👤 | ⬜ |
| A5.3 | The real support email (now the default `support@sahla.jo`) and the staff email domain (D9). Both wait for the domain, B3. | 👤 | ⬜ |
| A5.4 | `LAUNCH_READINESS.md` §4: its boxes still say ⬜ for work finished since. Bring it up to date or point it here. | 🤖 | ✅ 2026-11-10 |
| A5.5 | A copy of `backend/.env` somewhere safe that isn't this PC: it isn't in git, and `ID_HASH_SECRET` can never change once real IDs are stored. | 👤 | ⬜ |
| A5.6 | Rerun Maestro 01 to 11 once on the merged `main` (02 to 05, 08 and 09 last ran before the auction extension). | 🤖 | ⬜ |

### A6. From the backend review, no account needed

Each row is a finding in `BACKEND_REVIEW.md`. Done 2026-11-10 when the owner asked to execute this file: each with a test that fails without it.

| # | Step | Finding | When | Status |
|---|---|---|---|---|
| A6.1 | See whether the server's careful shutdown really runs in the container: the Linux shutdown test and the Docker build in the pull request's checks. If the stop signal doesn't get through `npx`, start the server with `node` directly. | M4 | With A1.5 | ✅ 2026-11-12: through npx, `docker stop` made npm exit 1 at once and the careful shutdown never ran. The image now starts with node; CI stops it like a host and needs exit 0 |
| A6.2 | A minimum app version: the app sends its version on every request, the server has a `MIN_APP_VERSION` setting and answers "update needed", the app shows an update screen. | M3 | **Before any build reaches a tester**: it can't be added to an installed app | ✅ 2026-11-10 |
| A6.3 | Background work that survives a restart and retries: pushes and risk checks through a queue in PostgreSQL (`pg-boss`), behind the same `runSoon` and `daily`. Also closes L2. | M1, L7 | Before the closed test | ✅ 2026-11-10: a `Job` table of our own instead of pg-boss (same idea, inside Prisma's migrations, tests can flush it); daily jobs also catch up (L7) |
| A6.4 | A notification inbox: a `Notification` row for every push, `GET /me/notifications`, a screen and an unread dot in the app. | M2 | Before the closed test, with A6.3 | ✅ 2026-11-10 |
| A6.5 | Shared rules out of `frontend/src` into a `shared/` folder both sides import. | M5 | Any quiet day; before the team grows | ⬜ owner decides: touches Metro, Babel, Jest, both tsconfigs and the Dockerfile; Metro needs an emulator run, the Docker build only runs in the pull request |
| A6.6 | Payment and payout records never delete with an order (`onDelete: Restrict`), and the two clean-ups keep any order that has a payment row. A migration and two tests. | H3 | Before any real payment; safe to do now | ✅ 2026-11-10 |
| A6.7 | The low notes (L1 to L8): nothing to do now. Read them again before the production copy (Part D). | L1–L8 | Part D | ⬜ |

## Part B: outside accounts, slowest first

Start B1 to B4 this week: they take days or weeks and nothing in Part A waits for them. Each ends with a check that proves it works.

| # | Account | Steps | Blocks | Wait |
|---|---|---|---|---|
| B1 | **Payment provider** (D2) 👤 | 1. Ask two or three (a Jordanian bank's gateway, HyperPay, PayTabs) for: JOD, cards with 3-D Secure, **holding money until delivery then paying the seller**, fees, the papers they need. Also the questions in Part E, above all whether **they** hold the money and pay sellers (a "marketplace" or "split payment" product). 2. Choose (D2). 3. Company papers, contract. 4. Test keys → 🤖 builds B7.9 against their test mode. 5. Live keys. | Real money | Longest |
| B2 | **MoDEE / Sanad** 👤 | Send the packet written 2026-11-04. Then 🤖 builds B11 against their test system. | Identity verification | Long |
| B3 | **`sahla.jo`** 👤 | Register at dns.jo (available on 2026-11-04; the report has the papers and prices). Then 🤖 lists the DNS records as each service needs them. | Email, staff domain, final addresses | Days |
| B4 | **Google Play Console** 👤 | Account, the one-time fee, identity check. Then: app entry, Play App Signing, its SHA-1 into Firebase (Google sign-in breaks in release without it), store text and screenshots in Arabic and English, data-safety form, privacy policy address. | Releasing | Days |
| B5 | **Host + database** (D4) 👥 | 1. Check on the pricing page: price, PostgreSQL 18, WebSockets, a region near Jordan, the database's connection limit. 2. One small server, one small database, **test copy**. 3. Settings by `DEPLOY.md`. 4. `/v1/health` answers. | Part C | 2–4 hours |
| B6 | **Cloudflare R2** (D1) 👥 | Public and private buckets, keys, `npm run check:storage`. | Photos in production | 20 min |
| B7 | **Postmark** 👥 | After B3. Account, the domain's DNS records, approval, `MAIL_MODE=postmark`, a real code to a real inbox. | Real email | 1–2 days |
| B8 | **Sentry** 👥 | Project, `SENTRY_DSN`, throw a test error, see it arrive with no personal data in it. Then the app and dashboard sides (S0.10). | Seeing production errors | 15 min + 🤖 half a day |
| B9 | **Keys** 👤 | Make a new Maps key and delete the old one (it was pasted into a chat on 2026-11-02). Restrict it to the app's package and SHA-1. Restrict the Firebase key the same way (S0.6, S0.7). | A safe release | 20 min |
| B10 | **Google Vision** 👥 | Key restricted to the Vision API, `GOOGLE_VISION_API_KEY`, one real certificate photo read. | Real OCR | 15 min |
| B11 | **Apple Developer + a Mac** 👤 | Yearly fee. iOS build, Apple sign-in on both platforms, iPhone push key. Not possible from this PC. | iPhone, and the Apple button on Android | Account: days |
| B12 | **Lawyer** 👤 | Reads the privacy policy and terms in the app. Answers: may customer data be stored outside Jordan (decides the region in B5), is the escrow model allowed without a licence, what the consumer law requires for returns. | Launch | Their time |

## Part C: once the host exists (B5)

| # | Step | Who | Status |
|---|---|---|---|
| C1 | Build the image, migrate, start, first admin, by `DEPLOY.md`. `PAYMENT_MODE` unset: paying answers 503 until B1. | 👥 | ⬜ |
| C2 | `TRUST_PROXY`: sign in from Wi-Fi and from mobile data, read the two addresses in the server's log. They must differ and be the phones' own (L4). | 👥 | ⬜ |
| C3 | Stage 2 of the balancer test against the free address: 200 phones, then 1 000. | 🤖 | ⬜ |
| C4 | A release build pointing at the free address (not committed), on two phones on **mobile data**: bid on one, time the other. | 👥 | ⬜ |
| C5 | Daily backups on, then a real restore into an empty database there (`BACKUPS.md`). A backup nobody restored isn't one. | 🤖 | ⬜ |
| C6 | An uptime monitor on `/v1/health` (a free one is enough) that emails the owner. | 👥 | ⬜ |
| C7 | The dashboard deployed with `VITE_API_URL`, `ADMIN_ORIGIN` set to its address; sign in with the authenticator code. | 👥 | ⬜ |
| C8 | `check:attack` against the test copy from outside. | 🤖 | ⬜ |
| C9 | When B3, B7, B1 are in: `api.sahla.jo` and `admin.sahla.jo`, real email, one real payment in the provider's test mode from pay to payout. | 👥 | ⬜ |

## Part E: real payments (B7.9), designed from the review

Starts when B1 gives test keys. The findings are the design: build them in, don't patch them on.

**Questions for every provider in B1** 👤

1. Do you hold the buyer's money and pay the seller yourselves (marketplace / split payments / payouts to IBANs)? If yes, how long can money be held before release? (H8)
2. Do you send a server-to-server notification (webhook) for paid, failed, refunded and chargeback? How is it signed? (H2, H7)
3. Do charges and refunds accept an idempotency key? (H6)
4. Partial refunds? Fees on a refund? (H9, M7)
5. Can a card be authorised now and charged later, and for how many days? (M7, H7)
6. A daily settlement report by file or API? (M9)
7. Chargebacks: how are we told, how long to answer, what evidence counts (the delivery PIN, the courier's record)? (H7)

**Build order** 🤖, each with a test that fails without it:

| # | Step | Finding | Status |
|---|---|---|---|
| E1 | The provider interface grows: idempotency key, webhook parsing, partial refund, and payouts if they offer them | H6, H9, H8 | ⬜ |
| E2 | A `pending` payment row is written before the card is charged | H1 | ⬜ |
| E3 | `POST /payments/webhook` with the signature checked, and a job that re-asks about every payment `pending` for more than a few minutes | H2 | ⬜ |
| E4 | A `Refund` table with an amount and its own states (`pending`, `done`, `failed`); a job retries; the bank is never called inside a database transaction | H4, H5, H9 | ⬜ |
| E5 | A dashboard queue: refunds that failed, payments charged with no order, for the finance admin | H4, M8 | ⬜ |
| E6 | A hold after delivery before the payout is owed (the owner decides: 24, 48 or 72 hours), a "problem after delivery" report for the buyer, a dispute state an admin resolves | H7 | ⬜ |
| E7 | Chargebacks recorded against the order, the payout stopped if not yet paid | H7 | ⬜ |
| E8 | The daily money check compares with the provider's report | M9 | ⬜ |
| E9 | The item is held for a few minutes while one buyer is paying | M7 | ⬜ |
| E10 | The same gates as before on the provider's test mode: double calls, bad amounts, the attack script, deliberate breaks, then one real card for 1 JOD, refunded | all | ⬜ |

**Decisions for the owner before E starts** 👤: the hold after delivery (E6); who pays the delivery fee when a buyer cancels after the driver set out, and when a delivery fails (H9); whether Sahla or the provider holds the money (H8, with the lawyer, B12).

## Part D: launch

1. ⬜ A closed test on Google Play with 10 to 20 real people for two weeks. A list of what they hit.
2. ⬜ The production copy: a standby database, the server size from C3's numbers, real keys everywhere, `RATE_LIMIT_MULTIPLIER` unset.
3. ⬜ The breach plan's contacts filled in (S8.5). Who answers support, and when.
4. ⬜ Open testing, then release.

## Tools for Claude on this PC

Set up 2026-11-10.

| Tool | What it gives | Status |
|---|---|---|
| `CLAUDE.md` in the repo | Every session starts knowing the layout, commands, rules and this PC's quirks | ✅ |
| Skill `phone-tests` (`.claude/skills/`) | The checks before, the command, and what to do when a Maestro flow fails | ✅ |
| MCP `mobile` (mobile-mcp) | Claude taps, types and takes screenshots on the emulator or a plugged-in phone | ✅ connected, all projects |
| MCP `maestro` | Claude runs and writes flows through Maestro itself | ✅ connected, all projects |
| MCP `context7` | Current documentation for React Native, Prisma, TanStack Query | ✅ connected, all projects |
| `gh` (GitHub's command) | Pull requests and check results from the terminal | ✅ installed, ⬜ `gh auth login` (A1.3) |
| Firebase MCP, Sentry MCP | For push problems and production errors | ⬜ later, with B8 |

The three MCP servers start working in the **next** Claude session, not the one that added them.
