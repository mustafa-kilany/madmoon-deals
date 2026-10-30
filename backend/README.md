# Sahla backend

The API the app talks to, built to [`docs/API.md`](../docs/API.md).
Express 5 + TypeScript, PostgreSQL through Prisma.

## First-time setup (Windows)

1. **Install PostgreSQL 18** from https://www.postgresql.org/download/windows/ (the EDB installer).
   Keep *PostgreSQL Server*, *pgAdmin 4* and *Command Line Tools*; untick *Stack Builder*.
   Write down the password you choose for the `postgres` user. Keep port `5432`.
2. **Settings:** copy `.env.example` to `.env` and put that password in `DATABASE_URL`.
   If the password has symbols like `@ # / : %`, URL-encode them (`@` → `%40`, `#` → `%23`).
3. **Packages:** `npm install` (in this folder).
4. **Database tables:** `npm run db:migrate -- --name init`
   (creates the `sahla` database if it doesn't exist, then the tables).
5. **Run:** `npm run dev`, then open http://localhost:4000/v1/health. It should show
   `{"ok":true,"database":"connected"}`.

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the server; restarts when you save a file |
| `npm run db:migrate -- --name <change>` | After editing `prisma/schema.prisma`: update the database |
| `npm run db:studio` | Browse and edit the data in your browser |
| `npm run typecheck` | Check the TypeScript |
| `npm test` | Run the backend tests (`src/**/*.test.ts`) |
| `npm run store -- <command>` | Refurbished stores: `create`, `key`, `revoke`, `list`, `import` ([docs/REFURBISHED.md](docs/REFURBISHED.md)) |

The server uses port 4000, the same as `npm run contract-server` in the app folder, so the app's
debug `apiBaseUrl` reaches it unchanged. Run one or the other, not both.

## Layout

```
src/
  server.ts, app.ts       start-up, routes under /v1
  env.ts, db.ts           settings (.env), database client
  reference.ts            categories / types / brands / areas, shared with the app (../src)
  lib/errors.ts           { error: { code, message } } responses (docs/API.md error codes)
  modules/
    refurbished/          POST /admin/refurbished/import, store API keys, CSV import
    certificates/         shop test certificate OCR + checks
    identity/             ID verification (Sanad, manual review until then)
    risk/                 suspicious-account checker (flags only)
scripts/store.ts          store setup from the terminal
prisma/schema.prisma      the database tables
```

The backend reuses the app's rules and reference data (`../src/lib`, `../src/services/mock/filters.ts`,
`places.ts`) instead of copying them, so the app and the server can't disagree.

## Guides

- [Certificate OCR: providers and plan](docs/OCR.md)
- [Suspicious-account checker](docs/ACCOUNT-RISK.md)
- [ID verification with Sanad](docs/ID-VERIFICATION.md)
- [Certified Refurbished: collecting stock](docs/REFURBISHED.md)
