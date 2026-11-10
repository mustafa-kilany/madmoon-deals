// Shared helpers for the end-to-end tests (never loaded by the server): a real
// server on a free port, real accounts that really log in, and calls that give
// back status + JSON.

import type { AddressInfo } from 'node:net';
import { app } from '../app';
import { prisma } from '../db';
import type { AdminRole, Prisma } from '../generated/prisma/client';
import { adminToken } from '../modules/admin/testing';
import { hashPassword } from '../modules/auth/password';

export const PASSWORD = 'longenough-1';

export type Person = { id: string; email: string; token: string };
export type Reply = { status: number; headers: Headers; body: any };

export function startApi() {
  const server = app.listen(0);
  let base = '';
  const ready = new Promise<void>(resolve =>
    server.once('listening', () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
      resolve();
    }),
  );
  const raw = (path: string, init?: RequestInit) => fetch(base + path, init);
  const call = async (method: string, path: string, who?: { token: string } | null, body?: unknown): Promise<Reply> => {
    const r = await raw(path, {
      method,
      headers: {
        ...(who && { Authorization: `Bearer ${who.token}` }),
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      /* a page, not JSON */
    }
    return { status: r.status, headers: r.headers, body: parsed };
  };
  return { server, ready, raw, call, url: () => base, close: () => server.close() };
}
export type Api = ReturnType<typeof startApi>;

const loginBody = (email: string) => JSON.stringify({ email, password: PASSWORD });

/** A customer, courier or (with `adminRole`) admin, signed in the normal way. */
export async function newPerson(api: Api, email: string, extra: Partial<Prisma.UserUncheckedCreateInput> & { adminRole?: AdminRole } = {}): Promise<Person> {
  await prisma.user.deleteMany({ where: { email } });
  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.create({ data: { name: email.split('@')[0].replace(/\W/g, ' '), email, passwordHash, ...extra } });
  if (extra.role === 'admin') return { id: user.id, email, token: await adminToken(user.id) };
  const r = await api.raw('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: loginBody(email) });
  const { token } = (await r.json()) as { token: string };
  return { id: user.id, email, token };
}

export const DELIVERY = { name: 'Sara Haddad', phone: '0771234567', cityId: 'irbid', address: 'University St, building 7', notes: 'Second floor' };
export const PICKUP = { phone: '0791112223', address: 'Seller Street, building 5', notes: 'Ring twice' };

/** A plain fixed-price listing, already on sale. */
export const newListing = (sellerUserId: string, id: string, extra: Partial<Prisma.ListingUncheckedCreateInput> = {}) =>
  prisma.listing.create({
    data: {
      id,
      category: 'furniture',
      type: 'sofas',
      titleAr: 'كنبة',
      titleEn: id,
      priceFils: 90_000,
      imageUrls: ['https://images.example.com/sofa.jpg'],
      condition: 'good',
      locationId: 'zarqa',
      description: 'A corner sofa with washable covers, no tears or stains, easy to take apart.',
      sellerUserId,
      pickupPhone: PICKUP.phone,
      pickupAddress: PICKUP.address,
      pickupNotes: PICKUP.notes,
      ...extra,
    },
  });

/** Checkout + a card that pays at once: an order with its money held (and the buyer's PIN). */
export async function paidOrder(api: Api, buyer: Person, listingId: string) {
  const order = await api.call('POST', '/orders', buyer, { listingId, delivery: DELIVERY });
  if (order.status !== 201) throw new Error(`checkout: ${JSON.stringify(order.body)}`);
  const paid = await api.call('POST', `/orders/${order.body.id}/pay`, buyer, { cardToken: 'mock_visa_4242' });
  if (paid.status !== 200) throw new Error(`pay: ${JSON.stringify(paid.body)}`);
  return paid.body as { id: string; pin: string; [key: string]: unknown };
}

/** Tests only: orders with their money records, which the database never deletes with an order (H3). */
export async function deleteOrders(where: Prisma.OrderWhereInput) {
  const ids = (await prisma.order.findMany({ where, select: { id: true } })).map(order => order.id);
  await prisma.payout.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.order.deleteMany({ where: { id: { in: ids } } });
}

/** Removes what a test file made, children first (orders keep listings; listings keep users). */
export async function cleanUp(listingIds: string[], emails: string[]) {
  await deleteOrders({ listingId: { in: listingIds } });
  await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
}
