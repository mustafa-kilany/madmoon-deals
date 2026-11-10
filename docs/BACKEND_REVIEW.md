# Backend review: how it's built, and what's wrong with the approach

Written 2026-11-10. **A log only: nothing here has been fixed or changed.**

How it was done: by reading the code, not running it. Read in full: the payment, order, delivery, refund, live-connection, job, rate-limit, token and start-up code, the database schema's money models, the Dockerfile. Sampled: notifications, email, catalog search, account deletion, retention. Not read: the admin modules, certificates, identity, refurbished import, uploads. A finding marked **to verify** is a suspicion from reading that needs a test.

## The method in one page

| Part | How it's built | Verdict |
|---|---|---|
| Shape | One Node process: Express 5 API under `/v1`, WebSockets, and timed jobs together. Code grouped by feature (`src/modules/<feature>`), about 9 200 lines | Right for this size. Splitting it up now would only add cost |
| Database | PostgreSQL through Prisma, 25 migrations, raw SQL with row locks where two requests can race | Right |
| Money | Whole fils in integer columns; prices worked out on the server, never taken from the app | Right |
| Sign-in | A signed token plus a session row checked on every request, so log-out and suspension work at once; separate tokens for the dashboard with an authenticator code | Right |
| Input | Every body checked with zod; one error shape; limits per person and per address | Right |
| Live updates | The database's `NOTIFY` to every server, WebSockets to phones, polling as the fallback | Right up to a few thousand people at once |
| Outside services | Each behind a small interface with a fake for tests (payments, push, email, storage, OCR, ID) | Right, and it is why most of this could be tested without accounts |
| Tests | Unit tests, end-to-end tests on a real database, an attack script, deliberate-break checks, a load test | Stronger than most projects this size |

**The overall idea is sound.** The problems are in specific places, and the serious ones are all in the money path, which has only ever run against the pretend bank.

## High: fix before any real payment

These don't matter while `PAYMENT_MODE` is `fake` or off. All of them belong to B7.9 (the real provider) and should be designed in then, not patched after.

| # | Problem | Where | What goes wrong | The usual way |
|---|---|---|---|---|
| H1 | **The card is charged before anything is written down.** `charge()` runs, then the `Payment` row is created | `orders/pay.ts` `payOrder` | The server restarts or the database hiccups between the two: the buyer's money is taken and Sahla has no record it happened. Nothing can find it later | Write a `pending` payment row first, then charge, then update it |
| H2 | **A payment only finishes if the buyer's browser comes back.** After the bank's card check, the result is learned from the redirect to `/payments/callback`. There is no message from the provider to the server, and no job that re-asks about `pending` payments | `payments/routes.ts`, `pay.ts` `finishCardCheck` | The buyer approves in the bank's page, then closes the browser or loses signal: money taken, order stays unpaid, forever | The provider's server-to-server notification (webhook), signature checked, plus a job that re-asks about every payment still `pending` after a few minutes |
| H3 | **Old unpaid orders are deleted together with their payment records.** `Payment` and `Payout` are set to delete when their order is deleted, and two places delete unpaid orders: retention (when no payment is `pending` or `succeeded`) and account deletion (when no `pending` payment is newer than one hour) | `schema.prisma` `Payment`/`Payout` `onDelete: Cascade`; `privacy/retention.ts`; `auth/deleteAccount.ts` | A late payment that was charged and refunded disappears from the records. With H2, a payment still `pending` after an hour, whose money was really taken, is deleted with the account | Money records are never deleted and never cascade. Orders with any payment row are kept |
| H4 | **A refund is written as done before, or without, the money moving.** A late payment is marked `refunded`, then the provider is asked; if that fails there is only a log line saying "an admin must refund this by hand" | `pay.ts` `settle` | The records say refunded, the buyer has no money, and the daily money check sees nothing wrong. With no Sentry yet, nobody sees the log line | A `refund_pending` state, a job that retries, and a dashboard queue of refunds that didn't go through |
| H5 | **The bank is called from inside a database transaction** when an admin refunds or a buyer cancels | `orders/problems.ts` (the refund helper) | Rows stay locked and a database connection is held for as long as the bank takes, up to 30 seconds. If the bank answers after the time limit, the money went back and the order still says paid ("Refund sent but not recorded" in the code) | Record the intent, commit, call the bank with a repeat-safe key, record the result |
| H6 | **No repeat-safe key on charges or refunds.** The provider interface has no place for one, and no API endpoint accepts one | `payments/provider.ts`; all `POST` routes | A timeout followed by a retry can charge twice. Today a second payment is caught and refunded, which costs fees and a worried buyer | An idempotency key per order attempt, passed to the provider |
| H7 | **Nothing after delivery.** The right PIN completes the order and creates the seller's payout at once. There is no window for "it broke when I plugged it in", and no handling of a chargeback (the buyer's bank taking the money back weeks later) | `courier/delivery.ts`; `payments/provider.ts` | A 3% "buyer protection" fee is charged, but protection ends at the door. A chargeback after the seller was paid is Sahla's loss | A short hold after delivery (24 to 72 hours) before the payout is owed; a dispute state; chargeback notifications recorded against the order |
| H8 | **Sahla itself holds the buyers' money.** The design takes the full amount into Sahla's account and pays sellers later by bank transfer, by hand | The whole escrow model | Holding other people's money is usually a licensed activity. This is a legal question before it is a code question (`NEXT_STEPS.md` B12) | Many marketplaces use the provider's own "marketplace" or "split payment" product, where the provider holds and pays out. Ask each provider in B1 whether it offers that: it changes what B7.9 builds |
| H9 | **Refunds are all or nothing.** A refund is a status on the payment, not its own record | `schema.prisma` `PaymentStatus` | Can't keep the delivery fee when the buyer cancels after the driver set out; can't give part back for a small defect | A `Refund` table with an amount, many per payment |

## Medium: fix before real users, or before a second server

| # | Problem | Where | What goes wrong |
|---|---|---|---|
| M1 | **Background work lives in the server's memory.** Pushes and risk checks wait in a `Map` and run 2 seconds later; nothing is retried | `lib/jobs.ts` `runSoon`; `notifications/notify.ts` | A deploy or crash in that moment loses the "Sold!" or "You were outbid" push for good. A failed send is logged and dropped. The file's own comment names the fix: a queue in PostgreSQL such as `pg-boss` |
| M2 | **A push is the only notice.** There is no stored list of notifications | No `Notification` model in the schema | Notifications off, a new phone, or a lost push (M1): the person is never told. Most apps keep an inbox the push merely points at |
| M3 | **No way to make old app versions update.** The app sends no version and the server has no minimum | Nothing in `backend/src` or `frontend/src` | Once the app is on phones, the API can never change in a way old versions can't handle, and a security fix in the app can't be forced. Cheapest to add before the first release |
| M4 | **The image starts with `npx tsx src/server.ts`.** TypeScript is translated at every start, and `npx` sits between the host and the server | `Dockerfile` `CMD` | **To verify:** whether the host's stop signal reaches the server through `npx`. If it doesn't, the careful shutdown never runs and requests in progress (a payment) are cut on every deploy. The test for this needs Linux and has never run, and the image has never been built. The pull request's checks will show both |
| M5 | **The server imports the app's source code** (`@/` points at `../frontend/src`) for shared rules, so the image copies `frontend/src` in | `tsconfig.json`, `Dockerfile` | An app refactor can break the server; a shared file that one day imports something phone-only stops the server from starting. A `shared/` folder both sides import would make the border visible |
| M6 | **Limits, daily jobs and connection counts assume one server** | `LOAD_BALANCER_TEST_PLAN.md` L1 to L3 | Already logged there |
| M7 | **An unpaid order doesn't hold the item.** Several buyers can reach the bank's page for the same item; the first to pay wins and the others are refunded | `orders/pay.ts` (by design) | Correct, but each loser is a real charge and refund: fees, and money missing from their account for days. A hold of a few minutes while paying avoids it |
| M8 | **Errors that need a person go only to the log** until Sentry exists | `reportError` callers | "Refund failed", "money check: records don't add up" reach nobody. Tied to B8 |
| M9 | **The daily money check only compares Sahla's records with themselves** | `orders/moneyCheck.ts` (known: waits for D2) | It can't see H1, H2 or H4. The comparison with the provider's daily report is the check that catches real money problems |

## Low: fine for launch, written down so they aren't a surprise

| # | Note | Where |
|---|---|---|
| L1 | Order numbers are `SA-` plus 6 digits: 900 000 in total, and clashes get common long before that. Fine for the first years | `orders/orders.ts` |
| L2 | The app's sign-in token lasts 60 days and is never swapped for a new one. A stolen token works until it expires or the person logs out. The owner chose 60 days (Q4) | `auth/tokens.ts` |
| L3 | The dashboard's API is on the same public address as the app's. It is guarded by its own tokens, the authenticator code and CORS; an allow-list of office addresses would be one more fence | `app.ts` |
| L4 | Phone numbers are collected for delivery and never verified. Codes go by email only | `orders/delivery.ts` |
| L5 | Lists without paging: 100 orders, 200 chats. Fine for people, not for a store with thousands of sales | `orders/orders.ts`, `negotiation/chats.ts` |
| L6 | Auctions are closed by a timer once a minute: the "you won" push can be up to a minute late. A winner who checks out sooner is handled | `negotiation/bids.ts` |
| L7 | Daily jobs run "at 6 o'clock if the server is up": a server down or restarting at that minute skips the day | `lib/jobs.ts` `daily` |
| L8 | `tsx` and `prisma` are production dependencies, so the image is larger and starts slower than a compiled build would. A cost, not a fault | `package.json` |

## What to do with this

Nothing now. In order:

1. **M4** shows itself in the pull request's first run (`NEXT_STEPS.md` A1).
2. **M3** before the first build goes to any tester: it can't be added to an app that's already installed.
3. **H1 to H9** are the design of B7.9. Take this table to the provider conversations in B1, above all H8: whether they hold and split the money decides how much of the rest Sahla builds.
4. **M1 and M2** together, before the closed test.
5. **M6** when a second server is planned.
