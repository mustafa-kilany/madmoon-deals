import { randomInt } from 'node:crypto';
import { env } from '../../env';

// ID verification (the Verified badge) with Sanad, Jordan's national digital ID
// app. Sahla never sees or stores an ID photo. See backend/docs/ID-VERIFICATION.md.
//
// Flow (to be confirmed with MoDEE's integration documents):
//   app → POST /me/id-verification/sanad → { redirectUrl } → the user approves in Sanad
//   Sanad → GET /v1/id-verification/sanad/callback?code&state (this server)
//   server → exchange(code) with Sanad, server to server → User.verified = true

export type VerifiedIdentity = {
  /** Only ever hashed (ID_HASH_SECRET), never stored. */
  nationalId: string;
  /** Sanad's reference for this check, for audits. */
  providerRef: string;
};

export interface IdVerificationProvider {
  /** Sanad's consent page for this user, carrying our one-time `state`. */
  authorizeUrl(state: string, callbackUrl: string): string;
  /** Sanad's one-time code → the verified identity (server to server). */
  exchange(code: string, callbackUrl: string): Promise<VerifiedIdentity>;
}

/**
 * Development and tests (SANAD_MODE=fake): "approves" straight away by sending the
 * user to our callback with a code that carries a made-up 10-digit national number.
 */
export const fakeSanad: IdVerificationProvider = {
  authorizeUrl(state, callbackUrl) {
    const code = `fake-${randomInt(2_000_000_000, 2_999_999_999)}`;
    return `${callbackUrl}?${new URLSearchParams({ code, state })}`;
  },
  async exchange(code) {
    const nationalId = /^fake-(\d{10})$/.exec(code)?.[1];
    if (!nationalId) throw new Error('Sanad refused the code');
    return { nationalId, providerRef: `fake-${Date.now()}` };
  },
};

/**
 * The provider in use, or null while Sanad is off (503 SANAD_UNAVAILABLE).
 * When MoDEE gives Sahla access: add `sanad` here, built from their documents
 * (client id/secret, authorize and token URLs in .env).
 */
export function idProvider(): IdVerificationProvider | null {
  return env.SANAD_MODE === 'fake' ? fakeSanad : null;
}
