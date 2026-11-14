# Madmoon Deals

A marketplace for Jordan: buy, sell, offers, auctions, delivery by couriers. Three projects in one repo, each with its own `package.json`:

| Folder | What | Stack |
|---|---|---|
| `frontend/` | The phone app (Android now, iOS later) | React Native 0.88 (New Architecture, no Expo), TanStack Query, NativeWind, zustand |
| `backend/` | The API | Express 5, TypeScript run by `tsx`, Prisma 7, PostgreSQL 18, `ws` |
| `admin/` | The staff dashboard website | Vite + React |

## The owner

New to React Native and Android tooling. Works in the VS Code terminal, which is PowerShell. Wants step-by-step instructions in plain words, and commands that paste into PowerShell.

## Where the plans are

* `docs/NEXT_STEPS.md`: the working order. Tick items there as they finish.
* `docs/BACKEND_PLAN.md` (features, decisions D1–D9), `docs/SECURITY_PLAN.md` (log each security item in its Log section), `docs/INTERNAL_READINESS_PLAN.md` (test gates and results), `docs/LOAD_BALANCER_TEST_PLAN.md`, `docs/BACKEND_REVIEW.md` (design problems found by reading the code, the payment path above all: read it before touching payments).
* `backend/docs/`: one file per outside service (DEPLOY, STORAGE, EMAIL, PUSH, PAYMENTS, BACKUPS).
* `docs/API.md`: the contract between app and API.

## Commands

Run each in its project's folder.

| Folder | Command | What |
|---|---|---|
| `backend` | `npm run dev` | The API on port 4000 |
| `backend` | `npm run typecheck`, `npm test` | Types, unit tests |
| `backend` | `npm run test:api` (`-- orders` for one area) | End-to-end tests on their own `madmoon_test` database |
| `backend` | `npm run check:attack`, `check:mutations`, `check:secrets`, `load-test`, `db:restore-test` | The gates in `INTERNAL_READINESS_PLAN.md` |
| `backend` | `npm run db:migrate`, `db:seed` | Development database |
| `frontend` | `npm start`, `npm run android` | Metro, then the debug app on the emulator |
| `frontend` | `npm run typecheck`, `npm run lint`, `npm test` | Types, lint, Jest |
| `frontend` | `npm run e2e:backend` | Every Maestro flow against a fresh backend (see the `phone-tests` skill) |
| `frontend` | `npm run check:apk` | Inspects the release APK |
| `admin` | `npm run dev`, `npm run build`, `npm run check:pages` | Dashboard |

## Rules

* **A fix isn't done until a test fails without it.** New rules get an end-to-end test (`*.e2e.ts` beside the code) on a real database.
* One fix, one commit. Commit only when asked; push only when asked.
* Never commit a change to `apiBaseUrl` in `frontend/src/config.ts`: `appSecurity.test.ts` pins it.
* Secrets live in `backend/.env` (not in git). Run `npm run check:secrets` in `backend` before any push.
* Text people see goes in `frontend/src/i18n/en.json` and `ar.json`, both.
* Money is in fils (integers), never decimals.

## This PC

* No Python, no Docker. Use Node for scripts.
* Files use CRLF line endings: keep them.
* A bash heredoc with an apostrophe in it breaks: write the file with the Write tool, or a `.cjs` script.
* In Git Bash, an argument like `/c` turns into `C:/`. Run Windows commands that need `/c` in PowerShell.
* The emulator (`Medium_Phone_API_37.0`) takes about 4 GB. With it running, the system kills other heavy processes: ask before starting a second backend or a long test run.
* The debug app loads its JavaScript from Metro on port 8081. A stuck Metro shows as a white screen.
* A game or other heavy program running halves load-test results.
* A program installed while VS Code is open (`gh` was) is "not recognized" in its terminals until every VS Code window is closed and reopened. Until then use the full path, e.g. `& "C:\Program Files\GitHub CLI\gh.exe"`.
