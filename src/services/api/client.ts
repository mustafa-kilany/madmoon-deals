// HTTP client for the Sahla API: JSON in/out, bearer token, timeout, and
// errors turned into ApiError. Only the services' http.ts files use it.

import { config } from '@/config';
import type { LocalPhoto } from '@/lib/types';
import { ApiError, type ApiErrorCode } from './errors';
import { tokenStorage } from './tokenStorage';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

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
  const headers: Record<string, string> = { Accept: 'application/json' };
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
  if (status === 404) return 'NOT_FOUND';
  if (status === 400 || status === 422) return 'VALIDATION';
  return 'UNKNOWN';
}

/** multipart/form-data body with one image field. */
export function photoForm(field: string, photo: LocalPhoto): FormData {
  const form = new FormData();
  // React Native's FormData takes { uri, type, name } for files.
  form.append(field, {
    uri: photo.uri,
    type: photo.mimeType,
    name: photo.fileName,
  } as unknown as Blob);
  return form;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
