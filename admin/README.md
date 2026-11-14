# Madmoon Deals admin dashboard

A website for Madmoon Deals staff on the same API as the app (`docs/BACKEND_PLAN.md` → B8). It has no database
access and no business rules of its own: everything goes through `/v1/admin/*` (`docs/API.md` → Admin
dashboard).

```
npm install
npm run dev        # http://localhost:5174; the backend must run on port 4000
npm run build      # type check + production build in dist/
```

- Log-in: email + password, then a code from an authenticator app (set up with a QR code the first time).
  Admin accounts: `npm run staff -- admin "<name>" <email>` in `backend/`; demo `admin@sahla.jo` / `sahla1234`.
- The token is kept in `sessionStorage` (closing the tab signs out) and lasts 12 hours.
- Production (B8.6): build with `VITE_API_URL=https://api.sahla.jo/v1`, host `dist/` at `admin.sahla.jo`, and
  let the API accept that origin (CORS).
- Shares the app's code through `@/` (`../frontend/src`), like the backend: money formatting for now.
