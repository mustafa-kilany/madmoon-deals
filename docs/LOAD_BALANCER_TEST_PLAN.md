# Load balancer test plan

Written 2026-11-10 from the 2026-11-09 session. **Stage 1 built and passed on 2026-11-10** (`npm run balancer-test`, results in `INTERNAL_READINESS_PLAN.md`), with the Node balancer: nginx for Windows couldn't be downloaded on this PC. **L1 to L3 done the same day.** Stage 2 waits for the host (`NEXT_STEPS.md` B5, C3); the script refuses `BALANCER_URL` until then, because it can't make test accounts on a hosted copy yet.

## Where things stand

* **There is no load balancer in this repo.** The host supplies it (decision D4, not made yet). What the repo has is the code that must work behind one:
  * `TRUST_PROXY` (`backend/src/app.ts`, `env.ts`): the limits use each person's real address, not the balancer's.
  * Live updates go through the database (`NOTIFY` in `backend/src/modules/negotiation/live.ts`), so a bid saved on one server should reach phones connected to another. **This was designed for and has never been tested with two servers.**
  * The app falls back to asking every 3 seconds (auctions) or 5 seconds (chats) when a live connection is down.
* **Already measured, one server, no balancer** (`docs/INTERNAL_READINESS_PLAN.md`, 2026-11-09): 1 000 virtual phones on one auction, bids arrived in 84 ms on average and 180 ms at worst. About 220 MB of memory per 1 000 connections.
* **Limits in the code today:** 2 000 live connections per server (`LIVE_MAX_CONNECTIONS`), 1 000 open and 600 new a minute per address.

## Is what's built correct? (code review, 2026-11-10)

Read, not run: `live.ts`, `server.ts`, `app.ts`, `lib/rateLimit.ts`, `lib/jobs.ts`, `bids.ts`, the app's `services/negotiation/live.ts`.

**With one server behind the host's balancer: yes, the design is right.** Nothing below needs changing to launch on one server.

| What a balancer needs | In the code | Verdict |
|---|---|---|
| Any server can answer any request (no "sticky" routing) | Sessions, bids, chats are all in the database; live connections only carry copies | ✅ |
| A health check the balancer can call | `GET /v1/health`, 200 only when the database answers; not rate limited; in the Docker image too | ✅ |
| The real person's address | `TRUST_PROXY`, used the same way by the API's limits and the live connections | ✅, but the number must match the host (below) |
| Connections kept open | Something is sent every 25 seconds, under the usual 60-second idle timeout | ✅ |
| A server can be replaced without losing anything | On `SIGTERM`: live connections closed with "restarting", requests in progress finish, 20 seconds at most | ✅ |
| Phones cope with a dropped connection | Reconnect after 1 s growing to 30 s, with a random part so a restart isn't a stampede; refetch on reconnect; polling meanwhile | ✅ |
| A bid reaches every server | `NOTIFY` inside the bid's transaction; every server listens; each checks every 25 s that it still hears | ✅ by design, **never run with two servers** |
| Auctions close once | Guarded update: only one server's close counts | ✅ |

**Before running two or more servers, these need doing.** None is a bug today:

| # | Gap | What happens with 2 servers | Fix |
|---|---|---|---|
| L1 ✅ | Rate limits are counted in each server's memory (`SECURITY_PLAN.md` S0.9) | Every limit is doubled: 10 card tries an hour instead of 5 | A shared store in the same PostgreSQL |
| L2 ✅ | The three daily jobs (money check, retention, risk check) start on every server | Each runs twice at the same moment | One database lock per job, so only one server runs it |
| L3 ✅ | Each server opens `DB_POOL_SIZE` (20) + 1 database connections | Small managed databases allow about 20 to 25 in total: the second server can't connect | Set `DB_POOL_SIZE` so servers × (pool + 1) fits; write it in `DEPLOY.md` |
| L4 | `TRUST_PROXY` is a count of proxies | Some hosts put two in front (their balancer and a CDN). Too low: everyone shares one address and the limits hit everybody. Too high: the address can be faked | Check on the host with two networks; Stage 2 check 6 |
| L5 | 1 000 live connections per address | A mobile carrier can put many people behind one address | Watch the 503 count in production; raise if real people hit it |

L1 to L3 were done on 2026-11-10: the `RateLimit` table (`sharedLimits.e2e.ts`), the `JobRun` claim (`jobs.e2e.ts`), the sum in `backend/docs/DEPLOY.md`.

## Is there something ready to use instead of building?

**The balancer itself: never build it, and it costs nothing extra.**

| Option | Cost | Work | For |
|---|---|---|---|
| **The host's own balancer** (DigitalOcean App Platform, Railway, Render, Fly) | Included in the server's price | None: it's there when you deploy | **Launch. Recommended.** |
| **Caddy** on one rented server, with Docker Compose | The server only, roughly $5 to $12 a month. Check the price on the day | A few lines of settings: HTTPS certificates by itself, WebSockets by default, health checks. But updates, backups and the database become yours to look after | The cheapest possible, if money matters more than time |
| nginx, HAProxy, Traefik | Free | More settings than Caddy for the same result | No reason to prefer them here |
| A cloud balancer bought separately (about $12 a month and up) | Extra | Extra | Not needed until several servers on plain machines |

All four pieces of software are free, open source and used by very large sites. They are tested far more than anything written here could be.

**The cheapest sensible launch: one server.** One server holds 2 000 live connections (tested to 1 000) and about 500 requests a second on this PC. That is far more than a first launch needs, and L1 to L3 don't apply to it. Add the second server when the numbers ask for it.

**For the gaps, ready-made parts on the database already paid for:**

| Gap | Ready-made | Instead of |
|---|---|---|
| L1 | A PostgreSQL store for `express-rate-limit` (an npm package) | Paying for Redis |
| L2 | PostgreSQL's own advisory locks (built in), or `pg-boss` if jobs grow | A separate job service |
| Load testing | `k6` or Artillery, free | A paid load-testing service |

**Not worth buying:** Pusher, Ably, Supabase Realtime and the like sell live connections by the month. Sahla's own are built, tested and free.

## Stage 1: offline, on this PC, free

A balancer on this PC in front of **two copies of the backend** sharing one test database, with virtual phones connecting through it. No account, no domain, no internet.

### What gets built

| Piece | What it is |
|---|---|
| `backend/scripts/balancer-test.ts`, run as `npm run balancer-test` | Starts everything below, runs the checks, prints a pass/fail table, stops everything. Takes `BALANCER_URL=` so Stage 2 reuses it against a real address. |
| Two servers | Ports 4201 and 4202, database `sahla_load_test` (the one `load-test.ts` uses), `TRUST_PROXY=1`, limits at their real values. |
| The balancer | **nginx for Windows** first: real balancer software, round robin, 60-second idle timeout. If this PC refuses the download (it refused MinIO), a small balancer written in Node inside the script. |
| Virtual phones | The `ws` package already in the backend. Each opens the same connection the app does. They connect from different local addresses (127.0.0.2, 127.0.0.3, …) so each looks like a separate person. |

Docker isn't on this PC, so nothing here needs it.

**Expected limit of nginx on Windows:** about 500 phones (it holds about 1 024 connections, two per phone). To be confirmed on the day. So nginx runs the behaviour checks at 200 phones, and the Node balancer runs the big numbers.

### The checks

| # | Check | How | Passes when |
|---|---|---|---|
| 1 | A bid reaches phones on the other server | 200 phones on one auction, split across both servers; 50 bids sent to server A only, then to B only | Every phone gets every bid, in order, worst delay under 1 second |
| 2 | Chat and unread signals cross servers | 100 signed-in pairs, sender on A and receiver on B | Every message signal arrives, worst delay under 1 second |
| 3 | Connections survive quiet periods | 200 phones idle for 3 minutes behind the 60-second timeout | 0 dropped (the server sends something every 25 seconds) |
| 4 | One server dies | Kill server B mid-auction, keep bidding | B's phones reconnect to A; no phone ends with a bid missing; time to recover is recorded |
| 5 | The server comes back | Restart B | New phones land on it again, both servers deliver |
| 6 | Limits see the real person | 1 100 phones from one address; then the same through a server with `TRUST_PROXY=0` | First: exactly 1 000 accepted, others unaffected. Second: shows the failure the setting prevents |
| 7 | Growing numbers | 200 → 1 000 → 2 000 → 4 000 phones (the two servers' limit together) | Delay, drops and each server's memory recorded per step; under 1 second up to 2 000 |
| 8 | Past the limit | 4 500 phones | The extra 500 are refused cleanly and fall back to the 3-second check; nobody connected is disturbed |
| 9 | Live connections down for everyone | Stop the database's live channel with 1 000 phones on, all asking every 3 seconds | Servers stay up, requests answered, 0 errors. Last session's rough estimate was that one server is comfortable to about 780 viewers this way: this measures it |

### What Stage 1 can't prove

The host's own balancer settings, `wss://` with a real certificate, how many connections the real server size holds, and delay over the internet. Those are Stage 2.

## Stage 2: the real host, a test copy, no domain needed

Every host in `backend/docs/DEPLOY.md` gives a free address with HTTPS that already goes through its balancer. Deploy a **test copy** there, never the one real people use.

1. `GET /v1/health` answers 200 through the free address.
2. `BALANCER_URL=https://<free-address> npm run balancer-test` from this PC: checks 1 to 3 at 200 phones, then growing to 1 000. One PC can't go further: the server allows 1 000 connections and 600 new a minute from one address.
3. Beyond 1 000: 2 to 4 rented machines for about an hour, each running the same script (or k6, which does the same across machines), one collecting results. This is the "workers" idea.
4. Checks 4 and 5 by restarting one server from the host's dashboard, if the test copy runs two.
5. Two real phones on mobile data: same auction, bid on one, watch the other. Needs a build pointing at the free address (`frontend/src/config.ts`, not committed: `appSecurity.test.ts` pins that line).

### Stage 2, step by step (written 2026-11-11, nothing here is started)

**Status:** ⬜ to do · ✅ done. **Who:** 👤 the owner · 🤖 Claude · 👥 together.

**What stands in the way** (found by reading the code on 2026-11-11):

| # | Gap | Fix | Who | Status |
|---|---|---|---|---|
| G1 | The code isn't on GitHub: the host builds from there, and 10 commits plus the work of 2026-11-11 are only on this PC | Commit, `npm run check:secrets`, push (`NEXT_STEPS.md` N2, N5) | 🤖 | ⬜ |
| G2 | The image has never been built anywhere (no Docker on this PC) | The pull request's checks build it for free: do that before paying for a host (`NEXT_STEPS.md` A1.3 to A1.6) | 👤 `gh auth login`, then 🤖 | ⬜ |
| G3 | `npm run balancer-test` refuses `BALANCER_URL`: it makes its test accounts straight in a local database, and a hosted database isn't reachable from here | The script makes its accounts and listings through the hosted copy itself. Tried first on this PC against the two local servers | 🤖 | ⬜ |
| G4 | **The image can't start as a test copy.** In production mode `env.ts` refuses to start without `STORAGE=s3` (a bucket, B6) and without real email (`MAIL_MODE=console` is refused; Postmark needs the domain, B3 and B7), and refuses `DEV_EMAIL_CODE` and `RATE_LIMIT_MULTIPLIER`. In development mode the logger asks for `pino-pretty`, which the image leaves out (`npm ci --omit=dev`), so it crashes. `NEXT_STEPS.md` C1 didn't know this | A small code change so the image starts with test settings and no outside account, with a test. The exact settings list for step 7 below comes out of it | 🤖 | ⬜ |

**The owner now (10 minutes, free)** 👤

1. Close every VS Code window and open it again, so `gh` is recognized.
2. `gh auth login` → GitHub.com → HTTPS → "Login with a web browser" → paste the code it shows.
3. Tell Claude. Claude then does G1 to G4.

**Renting the test copy (30 to 45 minutes, after G1 to G4)** 👤, with 🤖 beside

Railway is the suggestion **for the test copy only**: on 2026-11-11 it was the one host where PostgreSQL 18 could be confirmed (its template uses the official image), and its cheapest plan allows more than one server, which checks 4 and 5 need. Render and DigitalOcean: PostgreSQL 18 not confirmed that day. This is not decision D4: the test copy holds made-up data only, and can be deleted afterwards. Railway's button names may differ a little from the ones below.

| # | Step | Status |
|---|---|---|
| 1 | `railway.com`, sign in **with GitHub** | ⬜ |
| 2 | The **Hobby** plan, a bank card. About $5 a month at last report; the price lists found disagree, so read `railway.com/pricing` on the day | ⬜ |
| 3 | **New Project → Deploy from GitHub repo.** Give Railway access to the Sahla repo only | ⬜ |
| 4 | In the project: **New → Database → PostgreSQL.** It must say version 18 (otherwise the "PostgreSQL 18" template) | ⬜ |
| 5 | The server's **Settings**: region, the Europe one; Dockerfile path `backend/Dockerfile`; pre-deploy command `npx prisma migrate deploy`; healthcheck path `/v1/health` | ⬜ |
| 6 | **Networking → Generate Domain**: the free `https://….up.railway.app` address | ⬜ |
| 7 | **Variables**: the list from G4. Two are secrets: `npm run secret` twice in `backend` (`JWT_SECRET`, `ID_HASH_SECRET`). `DATABASE_URL` points at the database from step 4, `PUBLIC_URL` is the address from step 6, `TRUST_PROXY=1` | ⬜ |
| 8 | **Deploy**, then `https://<address>/v1/health` in a browser answers | ⬜ |
| 9 | Give Claude the address | ⬜ |

**The tests** (the numbered list above, in this order)

| # | Step | Who | Status |
|---|---|---|---|
| T1 | `$env:BALANCER_URL="https://<address>"; npm run balancer-test` from this PC: checks 1 to 3 at 200 phones, then growing to 1 000. Games and the emulator closed | 🤖 | ⬜ |
| T2 | Two servers: set the count to 2 in Railway. Check `SHOW max_connections;` against the sum in `DEPLOY.md` first. Then checks 4 and 5: restart one mid-auction, if the dashboard can restart one alone | 👥 | ⬜ |
| T3 | The real address (L4, `NEXT_STEPS.md` C2): sign in once from Wi-Fi and once from mobile data; the two addresses in the server's log must differ and be the phones' own | 👥 | ⬜ |
| T4 | Two real phones on mobile data, a build pointing at the free address (not committed): bid on one, time the other | 👥 | ⬜ |
| T5 | Results into `INTERNAL_READINESS_PLAN.md`, ticks here and in `NEXT_STEPS.md` C3. Then delete the Railway project, or keep it as the test copy for Part C | 🤖, 👤 deletes | ⬜ |
| T6 | Optional, not needed to launch: beyond 1 000 phones, 2 to 4 rented machines for an hour | 👥 | ⬜ |

## Order

1. Build and run Stage 1. Rough estimate: 1 to 2 hours.
2. Fix whatever it finds, add the results to `docs/INTERNAL_READINESS_PLAN.md`.
3. Choose the host (D4), deploy the test copy, run Stage 2.
4. Later, `api.sahla.jo` is a settings change only (`PUBLIC_URL`, the DNS record), then step 1 and 5 of Stage 2 again.
