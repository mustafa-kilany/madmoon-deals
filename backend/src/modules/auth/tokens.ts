import { createHash, randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import { prisma } from '../../db';
import { env } from '../../env';

// Log-in tokens are JWTs (HS256) carrying the user id (`sub`) and a session id
// (`sid`). Every request also checks that the session still exists, because
// docs/API.md needs tokens that can be revoked: log-out, password reset and
// account deletion end sessions, which a JWT alone can't do.

const key = new TextEncoder().encode(env.JWT_SECRET);
const ISSUER = 'sahla-api';
const AUDIENCE = 'sahla-app';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** Signs a new token and records its session. */
export async function issueToken(userId: string, req: Request) {
  const sid = randomUUID();
  const expiresAt = new Date(Date.now() + env.SESSION_DAYS * 86_400_000);
  const token = await new SignJWT({ sid })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(key);
  await prisma.session.create({
    data: {
      id: sid,
      userId,
      tokenHash: sha256(token),
      expiresAt,
      deviceId: req.get('x-device-id')?.slice(0, 128),
      ip: req.ip,
    },
  });
  return token;
}

/** The session a token belongs to, or undefined when it's invalid, expired or revoked. */
export async function sessionForToken(token: string) {
  let userId: string | undefined;
  let sid: unknown;
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: ISSUER,
      audience: AUDIENCE,
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
    session.tokenHash !== sha256(token) ||
    session.expiresAt.getTime() <= Date.now()
  )
    return undefined;
  return session;
}
