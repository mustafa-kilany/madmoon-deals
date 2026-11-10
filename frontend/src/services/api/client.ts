// HTTP client for the Sahla API: JSON in/out, bearer token, timeout, and
// errors turned into ApiError. Only the services' http.ts files use it.

import { config } from '@/config';
import type { LocalPhoto } from '@/lib/types';
import { deviceId } from './deviceId';
import { ApiError, type ApiErrorCode } from './errors';
import { tokenStorage } from './tokenStorage';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** Called when the server says this build is too old (426): the app shows only the update screen. */
let onUpdateRequired: () => void = () => {};
export const setUpdateRequiredHandler = (handler: () => void) => {
  onUpdateRequired = handler;
};

/** Called when the server rejects the token (401), e.g. to sign the user out. */
let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (handler: () => void) => {
  onUnauthorized = handler;
};

async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = tokenStorage.get();
  const isForm = body instanceof FormData;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Device-Id': deviceId(),
    'X-App-Build': String(config.appBuild),
  };
  if (body !== undefined && !isForm)
    headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    isForm ? config.uploadTimeoutMs : config.requestTimeoutMs,
  );
  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      method,
      headers,
      body:
        body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError('NETWORK');
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  const data = text ? safeJson(text) : undefined;

  if (!response.ok) {
    // Only a rejected token means "signed out" (a wrong password on log-in is also a 401).
    if (response.status === 401 && token) onUnauthorized();
    if (response.status === 426) onUpdateRequired();
    // Contract: errors are { "error": { "code": "...", "message": "..." } }.
    const error = (data as { error?: { code?: string; message?: string } })
      ?.error;
    throw new ApiError(
      (error?.code as ApiErrorCode) ?? statusCode(response.status),
      error?.message,
      response.status,
    );
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function statusCode(status: number): ApiErrorCode {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 400 || status === 422) return 'VALIDATION';
  if (status === 429) return 'RATE_LIMITED';
  return 'UNKNOWN';
}

/** multipart/form-data body with one image field, plus any text fields. */
export function photoForm(
  field: string,
  photo: LocalPhoto,
  fields: Record<string, string | undefined> = {},
): FormData {
  const form = new FormData();
  // React Native's FormData takes { uri, type, name } for files.
  form.append(field, {
    uri: photo.uri,
    type: photo.mimeType,
    name: photo.fileName,
  } as unknown as Blob);
  for (const [name, value] of Object.entries(fields))
    if (value !== undefined) form.append(name, value);
  return form;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
