---
name: phone-tests
description: Run Madmoon Deals' Maestro phone tests on the Android emulator against the real backend, one flow or all of them. Use when asked to run the phone tests, the e2e flows, Maestro, or to check a change on the emulator.
---

# Running the phone tests

The flows are in `frontend/.maestro/` (`01` to `11`). `frontend/.maestro/README.md` has the full notes.

## Before starting: check, don't assume

1. **Ask before starting anything heavy.** The emulator takes about 4 GB and this PC kills other processes when memory runs out. If the owner has a game or Android Studio builds running, say so and wait.
2. Emulator up: `adb devices` shows one device. If not, ask the owner to start **Medium_Phone_API_37.0** from Android Studio → Device Manager.
3. Metro up: `curl -s http://localhost:8081/status` answers `packager-status:running`. If not, `npm start` in `frontend/` in the background. A Metro that stopped answering shows as a white screen and every flow failing at "Welcome to Madmoon Deals": restart it.
4. The debug app is installed: `adb shell pm list packages | grep -i sahla`. If not, `npm run android` in `frontend/` once.
5. **Port 4000 must be free.** The runner starts its own backend there. `netstat -ano | findstr :4000`: if something is listening, it is probably the owner's own `npm run dev`. Ask before stopping it.

## Run

In `frontend/`:

```
npm run e2e:backend                              # every flow
node .maestro/run-all.cjs 08-bank-account-and-data   # one flow
```

The runner does the rest itself: its own database `madmoon_e2e_test`, migrations, seed, a backend with `RATE_LIMIT_MULTIPLIER=20`, `ADMIN_2FA=off`, `PAYMENT_MODE=fake`, `DEV_EMAIL_CODE=123456`, and the step that ends the auction between flows `06` and `07`. It never touches the development database.

Run it in the background and wait for it to finish. Don't poll the emulator while it runs.

## When a flow fails

1. Screenshots and the screen layout are in `%USERPROFILE%\.maestro\tests\<date>`. Read the screenshot first.
2. White screen, or stuck at "Loading from 10.0.2.2:8081": Metro, not the app. Restart Metro and rerun that flow.
3. A text not found: Maestro matches text without regard to case, and a renamed button in `src/i18n/en.json` needs the flow updated. Prefer `testID`s and `below:` for anything that appears twice.
4. Rerun the one flow before deciding it is a real failure. A flow that fails the same way twice is real.

## Reporting

Say which flows passed, which failed and why, and which were not run. A flow that was not rerun after a code change has not been shown to pass on that code.
