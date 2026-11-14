import { createHash, randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { decodeJwt, jwtVerify, SignJWT } from 'jose';
import { prisma } from '../../db';
import { env } from '../../env';
import type { SessionScope } from '../../generated/prisma/client';

// Log-in tokens are JWTs (HS256) carrying the user id (`sub`) and a session id
// (`sid`). Every request also checks that the session still exists, because
// docs/API.md needs tokens that can be revoked: log-out, password reset and
// account deletion end sessions, which a JWT alone can't do.
//
// The admin dashboard gets its own tokens (scope `admin`, BACKEND_PLAN B8.1): a
// different audience and 12 hours, so an app token never opens /v1/admin/*.

const key = new TextEncoder().encode(env.JWT_SECRET);
const ISSUER = 'madmoon-api';
const AUDIENCE: Record<SessionScope, string> = { app: 'madmoon-app', admin: 'madmoon-admin' };
export const ADMIN_SESSION_HOURS = 12;
const lifetimeMs = (scope: SessionScope) =>
  scope === 'admin' ? ADMIN_SESSION_HOURS * 3_600_000 : env.SESSION_DAYS * 86_400_000;

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** Signs a new token and records its session. */
export async function issueToken(userId: string, req?: Request, scope: SessionScope = 'app') {
  const sid = randomUUID();
  const expiresAt = new Date(Date.now() + lifetimeMs(scope));
  const token = await new SignJWT({ sid })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE[scope])
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(key);
  await prisma.session.create({
    data: {
      id: sid,
      userId,
      tokenHash: sha256(token),
      scope,
      expiresAt,
      deviceId: req?.get('x-device-id')?.slice(0, 128),
      ip: req?.ip,
    },
  });
  return token;
}

/** The session a token belongs to, or undefined when it's invalid, expired or revoked. */
export async function sessionForToken(token: string, scope: SessionScope = 'app') {
  let userId: string | undefined;
  let sid: unknown;
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: ISSUER,
      audience: AUDIENCE[scope],
      algorithms: ['HS256'],
    });
    userId = payload.sub;
    sid = payload.sid;
  } catch {
    return undefined; // bad signature, expired, wrong issuer…
  }
  if (typeof sid !== 'string') return undefined;
  const session = await prisma.session.findUnique({
    where: { id: sid },
    include: { user: true },
  });
  if (
    !session ||
    session.userId !== userId ||
    session.scope !== scope ||
    session.tokenHash !== sha256(token) ||
    session.expiresAt.getTime() <= Date.now()
  )
    return undefined;
  return session;
}

// The admin log-in's first step (password right) → a 5-minute ticket for the
// second (the authenticator code). It opens nothing else: no session behind it.
const CHALLENGE_AUDIENCE = 'sahla-admin-2fa';

export const signChallenge = (userId: string) =>
  new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(CHALLENGE_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);

/** The user id, or undefined when the ticket is wrong or expired. */
export async function verifyChallenge(challenge: string) {
  try {
    const { payload } = await jwtVerify(challenge, key, { issuer: ISSUER, audience: CHALLENGE_AUDIENCE, algorithms: ['HS256'] });
    return payload.sub;
  } catch {
    return undefined;
  }
}

/** For rate limits only (not checked): whose ticket this claims to be. */
export function challengeSubject(challenge: unknown) {
  try {
    return typeof challenge === 'string' ? decodeJwt(challenge).sub : undefined;
  } catch {
    return undefined;
  }
}
