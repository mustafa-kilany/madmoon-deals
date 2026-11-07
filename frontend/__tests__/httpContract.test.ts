// Every request the app's HTTP layer can make: the method, path and body it
// sends, and that docs/API.md (what the backend developer builds from)
// documents that endpoint. A new http.ts call without a row here, or an
// endpoint missing from the doc, fails this test.

import { httpAuthService } from '@/services/auth/http';
import { httpCatalogService } from '@/services/catalog/http';
import { httpCourierService } from '@/services/courier/http';
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
const doc = readFileSync('../docs/API.md', 'utf8');

const photo = {
  uri: 'file:///p.jpg',
  mimeType: 'image/jpeg',
  fileName: 'p.jpg',
};
const T = '2026-10-19T12:00:00Z';
const offer = { id: 'o1', createdAt: T };
const order = { id: 'SA-1', createdAt: T };
const delivery = {
  name: 'Ahmad',
  phone: '0791234567',
  cityId: 'amman-khalda',
  address: 'Mecca St, Building 12',
};
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
        code: '123456',
      }),
    url: '/auth/signup',
    body: { name: 'A', email: 'a@b.co', password: 'x', code: '123456' },
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
    endpoint: 'POST /auth/forgot-password',
    call: () => httpAuthService.forgotPassword({ email: 'a@b.co' }),
    url: '/auth/forgot-password',
    body: { email: 'a@b.co' },
  },
  {
    endpoint: 'POST /auth/reset-password',
    call: () =>
      httpAuthService.resetPassword({
        email: 'a@b.co',
        code: '123456',
        password: 'newpassword',
      }),
    url: '/auth/reset-password',
    body: { email: 'a@b.co', code: '123456', password: 'newpassword' },
  },
  {
    endpoint: 'POST /auth/logout',
    call: () => httpAuthService.logOut(),
    url: '/auth/logout',
  },
  { endpoint: 'GET /me', call: () => httpAuthService.getMe(), url: '/me' },
  {
    endpoint: 'DELETE /me',
    call: () => httpAuthService.deleteAccount(),
    url: '/me',
  },
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
    endpoint: 'POST /me/id-verification/sanad',
    call: () => httpAuthService.startIdVerification(),
    reply: { redirectUrl: 'https://sanad.test/consent' },
    url: '/me/id-verification/sanad',
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
    endpoint: 'POST /listings/:id/views',
    call: () => httpCatalogService.recordView('mobiles-1'),
    url: '/listings/mobiles-1/views',
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
    endpoint: 'POST /test-certificates',
    call: () =>
      httpCatalogService.checkTestCertificate({
        photo,
        category: 'mobiles',
        type: 'phones',
        brand: 'Apple',
        model: 'iPhone 14 Pro',
      }),
    reply: { id: 'cert-1', status: 'passed', problems: [], specs: [] },
    url: '/test-certificates',
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
        description: 'd',
        type: 'phones',
        locationId: 'salt',
        saleType: 'auction',
        auctionEndsAt: Date.parse(T),
        incrementFils: 1000,
        testCertificateId: 'cert-1',
        pickup: { phone: '0791234567', address: 'Main St 1' },
      }),
    url: '/listings',
    body: {
      category: 'mobiles',
      titleAr: 'ت',
      titleEn: 'T',
      priceFils: 5000,
      imageUrls: ['https://cdn/p.jpg'],
      condition: 'new',
      description: 'd',
      type: 'phones',
      locationId: 'salt',
      saleType: 'auction',
      auctionEndsAt: '2026-10-19T12:00:00.000Z',
      incrementFils: 1000,
      testCertificateId: 'cert-1',
      pickup: { phone: '0791234567', address: 'Main St 1' },
    },
  },
  {
    endpoint: 'PATCH /listings/:id',
    call: () =>
      httpCatalogService.updateListing('l1', {
        titleEn: 'New',
        imageUrls: ['https://cdn/p.jpg'],
        priceFils: 4000,
      }),
    url: '/listings/l1',
    body: { titleEn: 'New', imageUrls: ['https://cdn/p.jpg'], priceFils: 4000 },
  },
  {
    endpoint: 'DELETE /listings/:id',
    call: () => httpCatalogService.withdrawListing('l1'),
    reply: null,
    url: '/listings/l1',
  },
  {
    endpoint: 'GET /geocode/reverse',
    call: () =>
      httpCatalogService.reverseGeocode(
        { lat: 31.953949, lng: 35.910632 },
        'ar',
      ),
    reply: { address: 'شارع مكة' },
    url: '/geocode/reverse?lat=31.95395&lng=35.91063&lang=ar',
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
  // Safety
  {
    endpoint: 'POST /reports',
    call: () =>
      httpNegotiationService.report({
        target: { type: 'listing', id: 'mobiles-1' },
        reason: 'scam',
        details: 'Asks for payment outside Sahla',
      }),
    url: '/reports',
    body: {
      targetType: 'listing',
      targetId: 'mobiles-1',
      reason: 'scam',
      details: 'Asks for payment outside Sahla',
    },
  },
  {
    endpoint: 'POST /me/blocked',
    call: () => httpNegotiationService.blockUser('u2'),
    url: '/me/blocked',
    body: { userId: 'u2' },
  },
  {
    endpoint: 'DELETE /me/blocked/:userId',
    call: () => httpNegotiationService.unblockUser('u2'),
    url: '/me/blocked/u2',
  },
  {
    endpoint: 'GET /me/blocked',
    call: () => httpNegotiationService.getBlockedUsers(),
    reply: [],
    url: '/me/blocked',
  },
  // Orders
  {
    endpoint: 'POST /orders',
    call: () =>
      httpOrdersService.createOrder({
        listingId: 'mobiles-1',
        offerId: 'o1',
        delivery,
      }),
    reply: order,
    url: '/orders',
    body: { listingId: 'mobiles-1', offerId: 'o1', delivery },
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
    endpoint: 'GET /me/sales',
    call: () => httpOrdersService.getMySales(),
    reply: [order],
    url: '/me/sales',
  },
  {
    endpoint: 'POST /orders/:id/cancel',
    call: () =>
      httpOrdersService.cancelOrder('SA-1', 'other', 'Found it nearby'),
    reply: order,
    url: '/orders/SA-1/cancel',
    body: { reason: 'other', note: 'Found it nearby' },
  },
  {
    endpoint: 'POST /orders/:id/problem',
    call: () => httpOrdersService.reportItemIssue('SA-1', 'defect'),
    reply: order,
    url: '/orders/SA-1/problem',
    body: { reason: 'defect' },
  },
  // Courier mode
  {
    endpoint: 'GET /courier/deliveries',
    call: () => httpCourierService.getDeliveries(),
    reply: [{ orderId: 'SA-1', assignedAt: T }],
    url: '/courier/deliveries',
  },
  {
    endpoint: 'POST /courier/deliveries/:orderId/picked-up',
    call: () => httpCourierService.markPickedUp('SA-1'),
    reply: { orderId: 'SA-1', assignedAt: T, pickedUpAt: T },
    url: '/courier/deliveries/SA-1/picked-up',
  },
  {
    endpoint: 'POST /courier/confirm-delivery',
    call: () => httpCourierService.confirmDelivery('SA-1', '1234'),
    reply: order,
    url: '/courier/confirm-delivery',
    body: { orderId: 'SA-1', pin: '1234' },
  },
  {
    endpoint: 'POST /courier/deliveries/:orderId/failed',
    call: () => httpCourierService.markFailed('SA-1', 'buyer_unavailable'),
    reply: { orderId: 'SA-1', assignedAt: T },
    url: '/courier/deliveries/SA-1/failed',
    body: { reason: 'buyer_unavailable' },
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

test('the test certificate form names the device', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 201,
    text: async () =>
      JSON.stringify({
        id: 'cert-1',
        status: 'passed',
        problems: [],
        testedAt: '2026-10-20T00:00:00Z',
        specs: ['128GB'],
      }),
  });
  const check = await httpCatalogService.checkTestCertificate({
    photo,
    category: 'mobiles',
    type: 'phones',
    brand: 'Apple',
  });
  const form = fetchMock.mock.calls[0][1].body as FormData;
  expect(form.getAll('category')).toEqual(['mobiles']);
  expect(form.getAll('type')).toEqual(['phones']);
  expect(form.getAll('brand')).toEqual(['Apple']);
  expect(form.getAll('model')).toEqual([]); // no model: no field
  expect(check.testedAt).toBe(Date.parse('2026-10-20T00:00:00Z'));
});

test('a listing test certificate becomes an image source and epoch ms', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        id: 'mobiles-0',
        testCertificate: {
          imageUrl: 'https://cdn/cert.jpg',
          shopName: 'Smart Fix',
          testedAt: '2026-10-20T00:00:00Z',
          specs: ['128GB'],
        },
      }),
  });
  const item = await httpCatalogService.getItem('mobiles-0');
  expect(item.testCertificate).toEqual({
    image: { uri: 'https://cdn/cert.jpg' },
    shopName: 'Smart Fix',
    testedAt: Date.parse('2026-10-20T00:00:00Z'),
    specs: ['128GB'],
  });
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
