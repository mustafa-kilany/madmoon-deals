import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { prisma } from '../../db';
import { env } from '../../env';
import { ApiError } from '../../lib/errors';
import { isStaffEmail } from '../staff/service';
import { LEGAL_VERSION } from '@/legal';

// POST /auth/google and /auth/apple (docs/API.md, BACKEND_PLAN B10). The app signs
// in with Google's / Apple's own SDK and sends us the ID token it gets. We check
// the token's signature with the provider's public keys, that it was made for
// OUR app (audience), by the provider (issuer) and hasn't expired, and only then
// trust the account id and email inside it, never anything else in the request.

type Provider = 'google' | 'apple';

const PROVIDERS = {
  google: {
    keys: createRemoteJWKSet(new URL(env.GOOGLE_JWKS_URL)),
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    clientIds: env.GOOGLE_CLIENT_IDS,
    label: 'Google',
  },
  apple: {
    keys: createRemoteJWKSet(new URL(env.APPLE_JWKS_URL)),
    issuer: ['https://appleid.apple.com'],
    clientIds: env.APPLE_CLIENT_IDS,
    label: 'Apple',
  },
} as const;

export type SocialIdentity = {
  provider: Provider;
  id: string; // the provider's stable account id ("sub")
  email?: string; // only when the provider says it's verified
  name?: string;
  picture?: string;
};

const truthy = (value: unknown) => value === true || value === 'true'; // Apple sends "true"

export async function verifyIdToken(provider: Provider, idToken: string): Promise<SocialIdentity> {
  const config = PROVIDERS[provider];
  const audience = config.clientIds?.split(',').map(id => id.trim()).filter(Boolean) ?? [];
  if (audience.length === 0)
    throw new ApiError(503, 'INTERNAL', `${config.label} sign-in isn't set up on this server yet`);

  let claims: JWTPayload & Record<string, unknown>;
  try {
    ({ payload: claims } = await jwtVerify(idToken, config.keys, {
      issuer: [...config.issuer],
      audience,
      algorithms: ['RS256', 'ES256'],
    }));
  } catch {
    throw new ApiError(401, 'INVALID_CREDENTIALS', `${config.label} sign-in failed, please try again`);
  }
  if (!claims.sub)
    throw new ApiError(401, 'INVALID_CREDENTIALS', `${config.label} sign-in failed, please try again`);

  const email =
    typeof claims.email === 'string' && truthy(claims.email_verified)
      ? claims.email.trim().toLowerCase()
      : undefined;
  return {
    provider,
    id: claims.sub,
    email,
    name: typeof claims.name === 'string' ? claims.name : undefined,
    picture: typeof claims.picture === 'string' ? claims.picture : undefined,
  };
}

/**
 * The account for a verified identity: the one already linked to it, else the one
 * with the same verified email (linked now), else a new one. Staff accounts sign
 * in with their password only.
 */
export async function accountFor(identity: SocialIdentity, nameFromApp?: string, acceptedTerms = false) {
  const idField = identity.provider === 'google' ? 'googleId' : 'appleId';
  const linked = await prisma.user.findUnique({ where: { [idField]: identity.id } as never });
  if (linked) return linked;

  const byEmail = identity.email
    ? await prisma.user.findUnique({ where: { email: identity.email } })
    : null;
  if (byEmail) {
    if (byEmail.role) throw new ApiError(403, 'FORBIDDEN', 'Staff accounts sign in with their password');
    return prisma.user.update({ where: { id: byEmail.id }, data: { [idField]: identity.id } });
  }

  if (identity.email && isStaffEmail(identity.email))
    throw new ApiError(422, 'VALIDATION', 'This email is for Sahla staff: ask an admin for an account');
  // B15.8: a new account only with the terms accepted (the app shows them with the buttons).
  if (!acceptedTerms) throw new ApiError(422, 'VALIDATION', 'acceptTerms: agree to the Terms and the Privacy Policy');
  // Apple shares the name only with the app, once, so the app may send it.
  const name =
    [identity.name, nameFromApp?.trim()].find(n => n && n.length >= 2)?.slice(0, 60) ??
    identity.email?.split('@')[0]?.slice(0, 60) ??
    `${PROVIDERS[identity.provider].label} user`;
  return prisma.user.create({
    data: {
      name,
      email: identity.email ?? null,
      method: identity.provider,
      [idField]: identity.id,
      termsVersion: LEGAL_VERSION,
      termsAcceptedAt: new Date(),
      ...(identity.picture && { avatarUrl: identity.picture }),
    },
  });
}
