# Sahla

Sahla (سهلة) is a buy-and-sell marketplace app for Jordan: fixed-price listings,
offers, live auctions, and escrow payments released when the courier confirms
delivery. React Native 0.88 (Android + iOS), English and Arabic (RTL).

## Where things are

| Document | What's in it |
|---|---|
| [`HOW_TO_RUN.txt`](HOW_TO_RUN.txt) | Run the app from zero on Windows + the Android emulator |
| [`DEVELOPMENT_GUIDE.md`](DEVELOPMENT_GUIDE.md) | Rules, architecture, design system, roadmap and phase status |
| [`docs/API.md`](docs/API.md) | The backend API contract the app is built against |
| [`.maestro/README.md`](.maestro/README.md) | End-to-end tests and demo accounts |

## Quick start

```sh
npm install
npm start                 # Metro, keep it running
npm run contract-server   # fake backend on port 4000 (second terminal)
npm run android           # build and open on the emulator (third terminal)
```

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run e2e`.

## Branches

- `main` always holds working code. Nobody pushes to it directly.
- New work goes on a branch from `main`: `feat/<name>`, `fix/<name>`,
  `chore/<name>` or `docs/<name>`.
- Open a pull request into `main`. CI (type check, lint, tests) must pass, then merge.
- Finished roadmap phases are tagged `phase-1` … `phase-7`.

Details are in `DEVELOPMENT_GUIDE.md` §3.6.
