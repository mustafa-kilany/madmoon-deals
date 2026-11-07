import type { Request } from 'express';
import type { User } from '../../generated/prisma/client';
import { publicUrl } from '../../lib/publicUrl';

// The same default picture as the contract server: the app shows avatarUrl as
// is, and an empty one would be a blank circle.
const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1539533113208-f6df8cc8b543?w=150&h=150&fit=crop';

/** docs/API.md `User`: no password data, no empty optional fields, no admin role. */
export function toApiUser(user: User, req: Request) {
  return {
    id: user.id,
    name: user.name,
    ...(user.email && { email: user.email }),
    method: user.method,
    verified: user.verified,
    cityId: user.cityId,
    avatarUrl: !user.avatarUrl
      ? DEFAULT_AVATAR
      : user.avatarUrl.startsWith('/') // a file on this server
        ? publicUrl(req, user.avatarUrl)
        : user.avatarUrl,
    ...(user.cardBrand &&
      user.cardLast4 && { card: { brand: user.cardBrand, last4: user.cardLast4 } }),
    ...(user.role === 'courier' && { role: 'courier' as const }),
    // B15.8: the app asks again when it differs from the current LEGAL_VERSION.
    ...(user.termsVersion && { termsVersion: user.termsVersion }),
  };
}
