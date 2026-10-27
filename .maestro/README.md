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

Open four terminals in the project folder:

1. Emulator: start **Medium_Phone_API_37.0** from Android Studio → Device Manager.
2. `npm start` (Metro, leave it running)
3. `npm run contract-server` (sign-in server, leave it running)
4. `npm run android` once to install the debug app, then:

```
npm run e2e                                        # all flows (~5 min)
maestro test .maestro/02-buy-and-deliver.yaml      # one flow
maestro studio                                     # point-and-click flow builder in the browser
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
