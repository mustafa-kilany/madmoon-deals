import type { RequestHandler } from 'express';
import { env } from '../env';

// BACKEND_REVIEW M3: once the app is on people's phones, the API can only change in ways old builds
// cope with, unless old builds can be told to update. The app sends its build number (Android
// versionCode) as X-App-Build on every request; one below MIN_APP_BUILD gets 426 UPDATE_REQUIRED and
// the app shows its "update Sahla" screen. Nothing else is decided by it: a missing or made-up number
// just means "not the app" (the dashboard, the bank's page), and the server's own checks still apply.

export const requireAppBuild: RequestHandler = (req, res, next) => {
  const sent = req.get('x-app-build');
  const build = sent && /^\d{1,9}$/.test(sent) ? Number(sent) : undefined;
  if (env.MIN_APP_BUILD && build !== undefined && build < env.MIN_APP_BUILD) {
    res.status(426).json({ error: { code: 'UPDATE_REQUIRED', message: 'This version of Sahla is too old: update it from the store' } });
    return;
  }
  next();
};
