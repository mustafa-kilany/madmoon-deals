// The HTTP layer that takes over from the mocks in Phase 7: requests,
// auth header, error mapping, and response mapping to app types.

import { api, setUnauthorizedHandler } from '@/services/api/client';
import { ApiError } from '@/services/api/errors';
import { tokenStorage } from '@/services/api/tokenStorage';
import { httpCatalogService } from '@/services/catalog/http';

jest.mock('@/config', () => ({
  config: { apiBaseUrl: 'https://api.test/v1', requestTimeoutMs: 1000 },
}));

const fetchMock = jest.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

/** The ApiError a request fails with (fails the test if it succeeds). */
const failure = (request: Promise<unknown>) =>
  request.then(
    () => {
      throw new Error('expected the request to fail');
    },
    (error: unknown) => error as ApiError,
  );

const respond = (status: number, body?: unknown) =>
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  });

beforeEach(() => {
  fetchMock.mockReset();
  tokenStorage.clear();
});

test('sends JSON with the bearer token to the base URL', async () => {
  tokenStorage.set('tok123');
  respond(200, { ok: true });
  await expect(api.post('/auth/login', { email: 'a@b.co' })).resolves.toEqual({
    ok: true,
  });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('https://api.test/v1/auth/login');
  expect(init.method).toBe('POST');
  expect(init.headers.Authorization).toBe('Bearer tok123');
  expect(init.headers['Content-Type']).toBe('application/json');
  expect(JSON.parse(init.body)).toEqual({ email: 'a@b.co' });
});

test('maps the contract error body to ApiError codes', async () => {
  respond(409, { error: { code: 'EMAIL_TAKEN', message: 'taken' } });
  const error = await failure(api.post('/auth/signup', {}));
  expect(error).toBeInstanceOf(ApiError);
  expect(error.code).toBe('EMAIL_TAKEN');
  expect(error.status).toBe(409);
});

test('a rejected token (401) signs out through the registered handler', async () => {
  const handler = jest.fn();
  setUnauthorizedHandler(handler);
  tokenStorage.set('expired');
  respond(401);
  const error = await failure(api.get('/me'));
  expect(error.code).toBe('UNAUTHORIZED');
  expect(handler).toHaveBeenCalled();
});

test('a 401 without a token (wrong password) does not sign out', async () => {
  const handler = jest.fn();
  setUnauthorizedHandler(handler);
  respond(401, { error: { code: 'INVALID_CREDENTIALS' } });
  expect((await failure(api.post('/auth/login', {}))).code).toBe(
    'INVALID_CREDENTIALS',
  );
  expect(handler).not.toHaveBeenCalled();
});

test('no connection becomes a NETWORK error', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
  expect((await failure(api.get('/listings'))).code).toBe('NETWORK');
});

test('catalog maps wire format to app types', async () => {
  respond(200, [
    {
      id: 'tech',
      name: { ar: 'تكنولوجيا', en: 'Tech' },
      icon: 'Laptop',
      imageUrl: 'https://cdn.test/tech.jpg',
    },
  ]);
  const [category] = await httpCatalogService.getCategories();
  expect(category.image).toEqual({ uri: 'https://cdn.test/tech.jpg' });

  respond(200, {
    id: 'auction-tech',
    saleType: 'auction',
    auction: {
      endsAt: '2026-10-19T12:00:00Z',
      bidCount: 3,
      incrementFils: 10000,
    },
  });
  const item = await httpCatalogService.getItem('auction-tech');
  expect(item.auction?.endsAt).toBe(Date.parse('2026-10-19T12:00:00Z'));
  expect(fetchMock.mock.calls[1][0]).toBe(
    'https://api.test/v1/listings/auction-tech',
  );
});
