// The dashboard's only way to the backend: JSON in and out, the dashboard
// token, and errors as ApiError (docs/API.md → Error Codes Standard,
// → Admin dashboard). The token lives in sessionStorage: closing the browser
// tab signs out, and it lasts 12 hours anyway.

const BASE = import.meta.env.VITE_API_URL ?? '/v1';
const TOKEN_KEY = 'madmoon-admin-token';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const token = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (value: string) => sessionStorage.setItem(TOKEN_KEY, value),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
};

/** Called when the server rejects the token: the session ended. */
let onSignedOut = () => {};
export const setSignedOutHandler = (handler: () => void) => {
  onSignedOut = handler;
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const saved = token.get();
  let response: Response;
  try {
    response = await fetch(BASE + path, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(saved && { Authorization: `Bearer ${saved}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ApiError('NETWORK', 'Can’t reach the server. Is the backend running?', 0);
  }
  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    if (response.status === 401 && saved) {
      token.clear();
      onSignedOut();
    }
    const error = data?.error ?? {};
    throw new ApiError(error.code ?? 'INTERNAL', error.message ?? `Error ${response.status}`, response.status);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  /** A file only admins may see (a certificate's original photo): an <img> can't send the token itself. */
  async blob(path: string): Promise<Blob> {
    const saved = token.get();
    const response = await fetch(BASE + path, {
      headers: saved ? { Authorization: `Bearer ${saved}` } : {},
      signal: AbortSignal.timeout(30_000),
    }).catch(() => {
      throw new ApiError('NETWORK', 'Can’t reach the server. Is the backend running?', 0);
    });
    if (!response.ok) throw new ApiError('NOT_FOUND', `Couldn’t load the file (${response.status})`, response.status);
    return response.blob();
  },
};
