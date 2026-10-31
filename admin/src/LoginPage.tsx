// Two steps (docs/API.md → Admin dashboard → Log-in): email + password, then
// the 6-digit code from an authenticator app. The first time, the server sends
// the app's secret: shown as a QR code to scan (and as text to type).

import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from './api';
import { useSession } from './session';
import type { LoginDone, LoginStart } from './types';

const messages: Record<string, string> = {
  INVALID_CREDENTIALS: 'Wrong email or password.',
  FORBIDDEN: 'This account can’t use the dashboard.',
  INVALID_CODE: 'That code is wrong or was already used. Wait for the next one.',
  RATE_LIMITED: 'Too many tries. Wait 15 minutes and try again.',
  UNAUTHORIZED: 'That took too long. Log in again.',
};
const messageFor = (error: unknown) =>
  error instanceof ApiError ? (messages[error.code] ?? error.message) : 'Something went wrong. Try again.';

export function LoginPage() {
  const { signIn, endedNote } = useSession();
  const [step, setStep] = useState<LoginStart | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setStep(await api.post<LoginStart>('/admin/auth/login', { email, password }));
      setPassword('');
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!step) return;
    setBusy(true);
    setError(null);
    try {
      signIn(await api.post<LoginDone>('/admin/auth/verify', { challenge: step.challenge, code }));
    } catch (e) {
      setError(messageFor(e));
      setCode('');
      if (e instanceof ApiError && e.code === 'UNAUTHORIZED') setStep(null); // the ticket expired
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <div className="card login-card">
        <div className="brand">
          <span className="brand-mark">S</span> Sahla Admin
        </div>
        {!step ? (
          <form onSubmit={submitPassword}>
            <h1>Log in</h1>
            {endedNote && !error && <p className="note">{endedNote}</p>}
            <label>
              Email
              <input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} autoFocus />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary" disabled={busy}>
              {busy ? 'Checking…' : 'Continue'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitCode}>
            <h1>{step.setup ? 'Set up two-step log-in' : 'Enter your code'}</h1>
            {step.setup ? (
              <Setup secret={step.setup.secret} otpauthUrl={step.setup.otpauthUrl} />
            ) : (
              <p className="muted">Open your authenticator app and enter the 6-digit code for Sahla Admin.</p>
            )}
            <label>
              6-digit code
              <input
                className="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary" disabled={busy || code.length !== 6}>
              {busy ? 'Checking…' : 'Log in'}
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                setStep(null);
                setError(null);
                setCode('');
              }}
            >
              Use a different account
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

function Setup({ secret, otpauthUrl }: { secret: string; otpauthUrl: string }) {
  const [qr, setQr] = useState<string>();
  useEffect(() => {
    QRCode.toDataURL(otpauthUrl, { margin: 1, width: 200 }).then(setQr, () => setQr(undefined));
  }, [otpauthUrl]);
  return (
    <ol className="steps">
      <li>Install an authenticator app on your phone: Google Authenticator, Microsoft Authenticator or 1Password.</li>
      <li>
        In the app, add an account and scan this code:
        {qr && <img className="qr" src={qr} alt="QR code for the authenticator app" width={200} height={200} />}
        <span className="muted small">Can’t scan? Type this key instead:</span>
        <code className="secret">{secret.match(/.{1,4}/g)?.join(' ')}</code>
      </li>
      <li>Enter the 6-digit code the app shows. You’ll need a new code each time you log in.</li>
    </ol>
  );
}
