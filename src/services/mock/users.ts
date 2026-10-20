// Seed accounts for the mock backend. Sign in with the demo account to see a
// filled-in profile: ahmad@sahla.jo / sahla1234. Courier: courier@sahla.jo.

import type { User } from '@/lib/types';

/** Profile photos the prototype cycles through (Profile → camera button). */
export const avatarOptions = [
  'https://images.unsplash.com/photo-1539533113208-f6df8cc8b543?w=150&h=150&fit=crop',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop',
];

/** Mock-only: the server would store a password hash, never the password. */
export type MockAccount = User & { password?: string };

export const demoAccount: MockAccount = {
  id: 'user-demo',
  name: 'Ahmad',
  email: 'ahmad@sahla.jo',
  password: 'sahla1234',
  method: 'email',
  verified: false,
  cityId: 'amman',
  avatarUrl: avatarOptions[0],
  card: { brand: 'visa', last4: '4242' },
};

/** Demo courier: courier@sahla.jo / sahla1234. Sees "Confirm a delivery". */
export const courierAccount: MockAccount = {
  id: 'user-courier',
  name: 'Khaled',
  email: 'courier@sahla.jo',
  password: 'sahla1234',
  method: 'email',
  verified: true,
  cityId: 'amman',
  avatarUrl: avatarOptions[3],
  role: 'courier',
};
