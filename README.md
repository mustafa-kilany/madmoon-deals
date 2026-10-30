# Sahla

Sahla (سهلة) is a buy-and-sell marketplace app for Jordan: fixed-price listings,
offers, live auctions, and escrow payments released when the courier confirms
delivery. React Native 0.88 (Android + iOS), English and Arabic (RTL), with its
own API (Express + PostgreSQL).

## Folders

| Folder | What's in it |
|---|---|
| [`frontend/`](frontend) | The mobile app (React Native): `src/`, `android/`, `ios/`, tests, the contract server |
| [`backend/`](backend) | The API the app talks to (Express + PostgreSQL), see [`backend/README.md`](backend/README.md) |
| [`docs/`](docs) | Shared by both: the API contract and the backend plan |
| `.github/` | CI: checks both the app and the backend on every pull request |

## Where things are

| Document | What's in it |
|---|---|
| [`HOW_TO_RUN.txt`](HOW_TO_RUN.txt) | Run the app and the backend from zero on Windows + the Android emulator |
| [`DEVELOPMENT_GUIDE.md`](DEVELOPMENT_GUIDE.md) | Rules, architecture, design system, roadmap and phase status |
| [`docs/API.md`](docs/API.md) | The API contract both sides are built against |
| [`docs/BACKEND_PLAN.md`](docs/BACKEND_PLAN.md) | The backend, phase by phase |
| [`frontend/.maestro/README.md`](frontend/.maestro/README.md) | End-to-end tests and demo accounts |

## Quick start

```sh
# the backend (needs PostgreSQL, see backend/README.md)
cd backend
npm install
npm run dev               # API on port 4000

# the app (a second terminal)
cd frontend
npm install
npm start                 # Metro, keep it running
npm run android           # build and open on the emulator (third terminal)
```

Checks: in `frontend/`: `npm run typecheck`, `npm run lint`, `npm test`, `npm run e2e`;
in `backend/`: `npm run typecheck`, `npm test`, `npm run test:api`.

## Branches

- `main` always holds working code. Nobody pushes to it directly.
- New work goes on a branch from `main`: `feat/<name>`, `fix/<name>`,
  `chore/<name>` or `docs/<name>`.
- Open a pull request into `main`. CI (type check, lint, tests for both folders) must pass, then merge.
- Finished roadmap phases are tagged `phase-1` … `phase-7`, backend phases `backend-b1` …

Details are in `DEVELOPMENT_GUIDE.md` §3.6.
