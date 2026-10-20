// Every request the app's HTTP layer can make: the method, path and body it
// sends, and that docs/API.md (what the backend developer builds from)
// documents that endpoint. A new http.ts call without a row here, or an
// endpoint missing from the doc, fails this test.

import { httpAuthService } from '@/services/auth/http';
import { httpCatalogService } from '@/services/catalog/http';
import { httpNegotiationService } from '@/services/negotiation/http';
import { httpOrdersService } from '@/services/orders/http';
import { emptyFilters } from '@/lib/browsing';

jest.mock('@/config', () => ({
  config: {
    apiBaseUrl: 'https://api.test/v1',
    requestTimeoutMs: 1000,
    uploadTimeoutMs: 1000,
  },
}));

const fetchMock = jest.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

// Jest runs from the project root. (No Node types in this project, hence the cast.)
const { readFileSync } = jest.requireActual('fs') as {
  readFileSync: (file: string, encoding: 'utf8') => string;
};
const doc = readFileSync('docs/API.md', 'utf8');

const photo = {
  uri: 'file:///p.jpg',
  mimeType: 'image/jpeg',
  fileName: 'p.jpg',
};
const T = '2026-10-19T12:00:00Z';
const offer = { id: 'o1', createdAt: T };
const order = { id: 'SA-1', createdAt: T };
const page = { items: [], nextCursor: null, total: 0 };

type Row = {
  /** As written in docs/API.md. */
  endpoint: string;
  call: () => Promise<unknown>;
  /** What the server answers (enough for the app's mapping). */
  reply?: unknown;
  url: string;
  body?: unknown;
  form?: string;
};

const rows: Row[] = [
  // Accounts
  {
    endpoint: 'POST /auth/signup',
    call: () =>
      httpAuthService.signUpWithEmail({
        name: 'A',
        email: 'a@b.co',
        password: 'x',
      }),
    url: '/auth/signup',
    body: { name: 'A', email: 'a@b.co', password: 'x' },
  },
  {
    endpoint: 'POST /auth/login',
    call: () =>
      httpAuthService.logInWithEmail({ email: 'a@b.co', password: 'x' }),
    url: '/auth/login',
    body: { email: 'a@b.co', password: 'x' },
  },
  {
    endpoint: 'POST /auth/google',
    call: () => httpAuthService.logInWithGoogle('g'),
    url: '/auth/google',
    body: { idToken: 'g' },
  },
  {
    endpoint: 'POST /auth/apple',
    call: () => httpAuthService.logInWithApple('a'),
    url: '/auth/apple',
    body: { idToken: 'a' },
  },
  {
    endpoint: 'POST /auth/send-otp',
    call: () => httpAuthService.sendOtp({ email: 'a@b.co' }),
    url: '/auth/send-otp',
    body: { email: 'a@b.co' },
  },
  {
    endpoint: 'POST /auth/verify-otp',
    call: () => httpAuthService.verifyOtp({ email: 'a@b.co', code: '1' }),
    url: '/auth/verify-otp',
    body: { email: 'a@b.co', code: '1' },
  },
  {
    endpoint: 'POST /auth/logout',
    call: () => httpAuthService.logOut(),
    url: '/auth/logout',
  },
  { endpoint: 'GET /me', call: () => httpAuthService.getMe(), url: '/me' },
  {
    endpoint: 'PATCH /me',
    call: () => httpAuthService.updateProfile({ cityId: 'salt' }),
    url: '/me',
    body: { cityId: 'salt' },
  },
  {
    endpoint: 'POST /me/avatar',
    call: () => httpAuthService.changeAvatar(photo),
    url: '/me/avatar',
    form: 'avatar',
  },
  {
    endpoint: 'POST /me/id-verification',
    call: () => httpAuthService.verifyId(photo),
    url: '/me/id-verification',
    form: 'idPhoto',
  },
  {
    endpoint: 'POST /me/payment-card',
    call: () => httpAuthService.savePaymentCard('tok'),
    url: '/me/payment-card',
    body: { cardToken: 'tok' },
  },
  {
    endpoint: 'DELETE /me/payment-card',
    call: () => httpAuthService.removePaymentCard(),
    url: '/me/payment-card',
  },
  // Catalog & listings
  {
    endpoint: 'GET /categories',
    call: () => httpCatalogService.getCategories(),
    reply: [],
    url: '/categories',
  },
  {
    endpoint: 'GET /categories/filters',
    call: () => httpCatalogService.getCategoryFilters(),
    url: '/categories/filters',
  },
  {
    endpoint: 'GET /cities',
    call: () => httpCatalogService.getCities(),
    reply: [],
    url: '/cities',
  },
  {
    endpoint: 'GET /listings',
    call: () =>
      httpCatalogService.searchListings(
        {
          q: 'iphone',
          format: 'auction',
          sort: 'ending_soon',
          filters: emptyFilters(),
        },
        'c2',
      ),
    reply: page,
    url: '/listings?q=iphone&format=auction&sort=ending_soon&cursor=c2',
  },
  {
    endpoint: 'GET /listings/:id',
    call: () => httpCatalogService.getItem('mobiles-1'),
    url: '/listings/mobiles-1',
  },
  {
    endpoint: 'GET /me/listings',
    call: () => httpCatalogService.getMyListings(),
    reply: [],
    url: '/me/listings',
  },
  {
    endpoint: 'POST /uploads/listing-photo',
    call: () => httpCatalogService.uploadListingPhoto(photo),
    reply: { url: 'https://cdn/p.jpg' },
    url: '/uploads/listing-photo',
    form: 'photo',
  },
  {
    endpoint: 'POST /listings',
    call: () =>
      httpCatalogService.createListing({
        category: 'mobiles',
        titleAr: 'ت',
        titleEn: 'T',
        priceFils: 5000,
        imageUrls: ['https://cdn/p.jpg'],
        condition: 'new',
        type: 'phones',
        locationId: 'salt',
        saleType: 'auction',
        auctionEndsAt: Date.parse(T),
        incrementFils: 1000,
      }),
    url: '/listings',
    body: {
      category: 'mobiles',
      titleAr: 'ت',
      titleEn: 'T',
      priceFils: 5000,
      imageUrls: ['https://cdn/p.jpg'],
      condition: 'new',
      type: 'phones',
      locationId: 'salt',
      saleType: 'auction',
      auctionEndsAt: '2026-10-19T12:00:00.000Z',
      incrementFils: 1000,
    },
  },
  // Negotiation
  {
    endpoint: 'POST /listings/:id/offers',
    call: () =>
      httpNegotiationService.makeOffer({
        itemId: 'mobiles-1',
        amountFils: 9000,
      }),
    reply: { offer, chatId: 'c1' },
    url: '/listings/mobiles-1/offers',
    body: { amountFils: 9000 },
  },
  {
    endpoint: 'GET /offers/:id',
    call: () => httpNegotiationService.getOffer('o1'),
    reply: offer,
    url: '/offers/o1',
  },
  {
    endpoint: 'POST /offers/:id/respond',
    call: () => httpNegotiationService.respondToOffer('o1', 'countered', 9500),
    reply: offer,
    url: '/offers/o1/respond',
    body: { status: 'countered', counterAmountFils: 9500 },
  },
  {
    endpoint: 'GET /listings/:id/bids',
    call: () => httpNegotiationService.getBids('auction-mobiles'),
    reply: [],
    url: '/listings/auction-mobiles/bids',
  },
  {
    endpoint: 'POST /listings/:id/bids',
    call: () =>
      httpNegotiationService.placeBid({
        itemId: 'auction-mobiles',
        amountFils: 9000,
      }),
    reply: { createdAt: T },
    url: '/listings/auction-mobiles/bids',
    body: { amountFils: 9000 },
  },
  {
    endpoint: 'GET /chats',
    call: () => httpNegotiationService.getChatThreads(),
    reply: [],
    url: '/chats',
  },
  {
    endpoint: 'GET /chats/:id/messages',
    call: () => httpNegotiationService.getChatMessages('c1'),
    reply: [],
    url: '/chats/c1/messages',
  },
  {
    endpoint: 'POST /chats/:id/messages',
    call: () =>
      httpNegotiationService.sendMessage({ chatId: 'c1', text: 'hi' }),
    reply: { createdAt: T },
    url: '/chats/c1/messages',
    body: { text: 'hi' },
  },
  // Orders
  {
    endpoint: 'POST /orders',
    call: () =>
      httpOrdersService.createOrder({ listingId: 'mobiles-1', offerId: 'o1' }),
    reply: order,
    url: '/orders',
    body: { listingId: 'mobiles-1', offerId: 'o1' },
  },
  {
    endpoint: 'POST /orders/:id/pay',
    call: () => httpOrdersService.payOrder('SA-1', 'saved'),
    reply: order,
    url: '/orders/SA-1/pay',
    body: { cardToken: 'saved' },
  },
  {
    endpoint: 'GET /orders/:id',
    call: () => httpOrdersService.getOrder('SA-1'),
    reply: order,
    url: '/orders/SA-1',
  },
  {
    endpoint: 'GET /me/orders',
    call: () => httpOrdersService.getMyOrders(),
    reply: [order],
    url: '/me/orders',
  },
  {
    endpoint: 'POST /courier/confirm-delivery',
    call: () => httpOrdersService.confirmDelivery('SA-1', '1234'),
    reply: order,
    url: '/courier/confirm-delivery',
    body: { orderId: 'SA-1', pin: '1234' },
  },
];

beforeEach(() => fetchMock.mockReset());

test.each(rows)('$endpoint', async row => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(row.reply ?? {}),
  });
  await row.call();

  const [url, init] = fetchMock.mock.calls[0];
  expect(`${init.method} ${url}`).toBe(
    `${row.endpoint.split(' ')[0]} https://api.test/v1${row.url}`,
  );
  if (row.form) {
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).getAll(row.form)).toHaveLength(1);
  } else if (row.body) {
    expect(JSON.parse(init.body)).toEqual(row.body);
  }
  expect(doc).toContain(`\`${row.endpoint}\``);
});

test('dates arrive as ISO strings and become epoch ms', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify([{ ...order, deliveredAt: '2026-10-20T08:00:00Z' }]),
  });
  const [mine] = await httpOrdersService.getMyOrders();
  expect(mine.createdAt).toBe(Date.parse(T));
  expect(mine.deliveredAt).toBe(Date.parse('2026-10-20T08:00:00Z'));
});
