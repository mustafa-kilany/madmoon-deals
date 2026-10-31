import { readFileSync } from 'node:fs';
import { importPKCS8, SignJWT } from 'jose';
import { env } from '../../env';
import { logger } from '../../lib/logger';

// Sending one push to one phone (BACKEND_PLAN B9.3, backend/docs/PUSH.md).
// Firebase Cloud Messaging (HTTP v1) delivers to Android and, once an Apple key
// is uploaded to Firebase, to iPhones too. PUSH_MODE picks the sender.

export type PushMessage = {
  title: string;
  body: string;
  /** For the app: which screen a tap opens (docs/API.md → Live Updates & Notifications). */
  data: { type: string; id: string };
};

/** `gone` = the app was uninstalled or the token replaced: forget this phone. */
export type PushResult = 'sent' | 'gone' | 'failed';

export interface PushSender {
  send(token: string, message: PushMessage): Promise<PushResult>;
}

type ServiceAccount = { project_id: string; client_email: string; private_key: string; token_uri?: string };

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

/** FIREBASE_SERVICE_ACCOUNT is a path to the key file or the JSON itself. */
function readServiceAccount(value: string): ServiceAccount {
  const json = value.trim().startsWith('{') ? value : readFileSync(value, 'utf8');
  const account = JSON.parse(json) as ServiceAccount;
  if (!account.project_id || !account.client_email || !account.private_key)
    throw new Error('FIREBASE_SERVICE_ACCOUNT: not a Firebase service account key');
  return account;
}

export function fcmSender(account: ServiceAccount, fetchImpl: typeof fetch = fetch): PushSender & { accessToken(): Promise<string> } {
  const tokenUri = account.token_uri ?? 'https://oauth2.googleapis.com/token';
  let cached: { token: string; until: number } | undefined;

  // Google's OAuth: a JWT signed with the service account's key → an access token for an hour.
  async function accessToken() {
    if (cached && cached.until > Date.now()) return cached.token;
    const assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(account.client_email)
      .setAudience(tokenUri)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(await importPKCS8(account.private_key, 'RS256'));
    const response = await fetchImpl(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Firebase sign-in ${response.status}: ${await response.text()}`);
    const { access_token, expires_in } = (await response.json()) as { access_token: string; expires_in: number };
    cached = { token: access_token, until: Date.now() + (expires_in - 300) * 1000 };
    return access_token;
  }

  return {
    accessToken,
    async send(token, message) {
      const response = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: message.title, body: message.body },
            data: message.data,
            android: { priority: 'high' },
            apns: { payload: { aps: { sound: 'default' } } },
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) return 'sent';
      const error = (await response.json().catch(() => ({}))) as {
        error?: { status?: string; message?: string; details?: { errorCode?: string }[] };
      };
      const code = error.error?.details?.find(d => d.errorCode)?.errorCode ?? error.error?.status;
      // UNREGISTERED: uninstalled / token expired. INVALID_ARGUMENT on a token: never valid.
      if (code === 'UNREGISTERED' || (code === 'INVALID_ARGUMENT' && /token/i.test(error.error?.message ?? ''))) return 'gone';
      logger.warn({ status: response.status, code }, 'Push not sent');
      return 'failed';
    },
  };
}

/** PUSH_MODE=fake: kept in memory for tests (fakePushes.sent). */
export const fakePushes = {
  sent: [] as { token: string; message: PushMessage }[],
  /** Tokens that answer `gone`, like an uninstalled app. */
  gone: new Set<string>(),
  sender: {
    async send(token: string, message: PushMessage): Promise<PushResult> {
      if (fakePushes.gone.has(token)) return 'gone';
      fakePushes.sent.push({ token, message });
      return 'sent';
    },
  } satisfies PushSender,
};

let sender: PushSender | null | undefined;

/** The configured sender, or null when pushes are off. */
export function pushSender(): PushSender | null {
  if (sender === undefined)
    sender =
      env.PUSH_MODE === 'fake'
        ? fakePushes.sender
        : env.PUSH_MODE === 'fcm'
          ? fcmSender(readServiceAccount(env.FIREBASE_SERVICE_ACCOUNT!))
          : null;
  return sender;
}
