import { issueToken } from '../auth/tokens';

/**
 * Tests only: a dashboard token for an admin without the two-step log-in
 * (admin.e2e.ts tests that log-in itself).
 */
export const adminToken = (userId: string) => issueToken(userId, undefined, 'admin');
