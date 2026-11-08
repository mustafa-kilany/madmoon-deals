# Deploying the API (BACKEND_PLAN B12.2)

Written so it is one setting away once the host is chosen (decision D4). Everything below works on Railway, Render, DigitalOcean App Platform, Fly or a plain server with Docker.

## Before the first deploy

1. A managed PostgreSQL 18 in the same region, **not reachable from the internet** (S7.2), with daily backups on.
2. Storage: `docs/STORAGE.md`. Email: `docs/EMAIL.md`. Push: `docs/PUSH.md`.
3. Make the two secrets once and keep a copy of `ID_HASH_SECRET` offline (it never changes):
   ```
   npm run secret   # JWT_SECRET
   npm run secret   # ID_HASH_SECRET, a different one
   npm run secret   # BACKUP_KEY, for docs/BACKUPS.md
   ```
4. Settings in the host's **secret settings**, never in git. The server refuses to start if a required one is missing or unsafe, and says which:

   | Setting | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | From the database. A user that isn't a superuser. |
   | `JWT_SECRET`, `ID_HASH_SECRET` | From step 3 |
   | `PUBLIC_URL` | `https://api.sahla.jo` |
   | `ADMIN_ORIGIN` | `https://admin.sahla.jo` |
   | `TRUST_PROXY` | `1` behind the host's load balancer (rate limits use the real address) |
   | `STORAGE` + `S3_*` + `FILES_PUBLIC_URL` | `docs/STORAGE.md` |
   | `MAIL_MODE=postmark`, `POSTMARK_SERVER_TOKEN`, `MAIL_FROM` | `docs/EMAIL.md` |
   | `SUPPORT_EMAIL`, `STAFF_EMAIL_DOMAIN` | The real ones |
   | `PUSH_MODE=fcm`, `FIREBASE_SERVICE_ACCOUNT` | The JSON itself (no files on most hosts) |
   | `GEOCODER=google`, `GOOGLE_MAPS_API_KEY`, `GOOGLE_VISION_API_KEY`, `GOOGLE_CLIENT_IDS` | Restricted keys |
   | `SENTRY_DSN` | When there is a Sentry project |
   | `RELEASE` | The commit, if the host can set it: error reports then name the version |

   `PAYMENT_MODE` stays unset (`off`) until the real provider (B7.9): paying answers 503.

## Each release

1. **Build:** `docker build -f backend/Dockerfile -t sahla-api .` from the repo's root (CI builds it on every pull request).
2. **Migrate first:** run `npx prisma migrate deploy` once, in the image, as the host's "release" or "pre-deploy" command. Never `migrate dev` in production.
3. **Start:** the image's default command. The host sends `SIGTERM` on the next deploy: requests in progress finish (20 seconds at most).
4. **Health check:** `GET /v1/health`: 200 only when the database answers. The image has a `HEALTHCHECK`; point the host's check there too, and an uptime monitor (B12.4).
5. **Then:** `npm run money:check` in the image, and sign in once on the app and the dashboard.

## The first admin

```
npm run staff -- admin "Your Name" you@sahla.jo owner
```
Set the password with the emailed code, then the dashboard's first log-in shows the QR code. `npm run db:seed` refuses to run in production.

## One server for now

Rate limits and background jobs live in the server's memory (`lib/rateLimit.ts`, `lib/jobs.ts`). Run **one instance**. Before running more: a shared store for the limits (S0.9) and a job queue (`lib/jobs.ts` says how). The jobs tolerate a restart.
