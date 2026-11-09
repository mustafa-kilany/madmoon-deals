# End-to-end tests (Maestro)

Maestro drives the real app on the emulator like a person would: it taps,
types and checks what's on screen. Three journeys are covered:

| Flow | What it checks |
| --- | --- |
| `01-browse-as-guest.yaml` | Search by model, open a listing (brand · model shown), category filters |
| `02-buy-and-deliver.yaml` | Ahmad skips the location prompt, types the address, pays into escrow → gets order number + PIN → courier signs in and confirms delivery |
| `03-sell-an-item.yaml` | Photo from the gallery, brand + model pickers (model fills the title), 10-word description, shop test certificate, publish, shows in My Listings |

`subflows/` holds shared steps (fresh launch, sign in, sign out, pick a photo).

## Run them (VS Code terminal, PowerShell)

Open four terminals in the app folder (`frontend/`):

1. Emulator: start **Medium_Phone_API_37.0** from Android Studio → Device Manager.
2. `npm start` (Metro, leave it running)
3. `npm run contract-server` (sign-in server, leave it running)
4. `npm run android` once to install the debug app, then:

```
npm run e2e                                        # all flows (~5 min)
maestro test .maestro/02-buy-and-deliver.yaml      # one flow
maestro studio                                     # point-and-click flow builder in the browser
```

**The app gets its JavaScript from Metro on this PC's port 8081, whatever `adb reverse` says:** a Metro that has stopped answering shows as a blank white screen and every flow failing at "Welcome to Sahla". Restart it.

**Against the real backend, all of it in one go:** `npm run e2e:backend` (stop any other backend on port 4000 first; it uses its own `sahla_e2e_test` database). 05–09 cover offers and chat, an auction from bid to win, and the bank account. On a PC short of memory, close other programs: the emulator alone takes about 4 GB.

The auction takes two parts with one step between them (an auction can't end sooner than an hour by itself):

```
maestro test -e API=http://localhost:4000 .maestro/06-auction-bid.yaml
npx tsx scripts/e2e-end-auction.ts auction-fashion     # in backend/, with a *_test database
maestro test -e API=http://localhost:4000 .maestro/07-auction-win-pay.yaml
```

Each failure leaves screenshots and the screen layout in `%USERPROFILE%\.maestro\tests\<date>`.

## Notes

- Maestro is installed in `%USERPROFILE%\maestro` (needs Java 17+). If `maestro`
  isn't found, open a new terminal (PATH was updated) or reinstall from
  https://github.com/mobile-dev-inc/maestro/releases.
- Flows run in **English** (the emulator's language) and start from a wiped app
  (`clearState`), so they don't depend on what you did by hand before.
- Demo accounts (contract server): `ahmad@sahla.jo` and `courier@sahla.jo`, password `sahla1234`.
- If the first launch times out on "Loading from 10.0.2.2:8081", Metro is still
  building or stuck: restart `npm start` and run again.
- Selectors are the visible English texts and screen-reader labels. If you
  rename a button in `src/i18n/en.json`, update the flow that taps it. Values
  the tests read (order number, PIN) use `testID`s instead.
