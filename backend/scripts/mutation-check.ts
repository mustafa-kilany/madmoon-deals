// npm run check:mutations (gate G3): do the tests really catch it? Breaks one protection at a time in the
// code, runs the test that should notice, and restores the file. A protection that can be removed
// with the tests still green isn't protected. Only touches src/ for a moment, on the test database;
// run it on a clean working tree, with no `npm run dev` watching.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

type Mutation = { name: string; file: string; find: string; replace: string; test: string };

const MUTATIONS: Mutation[] = [
  { name: 'anyone can open any order', file: 'src/modules/orders/orders.ts', find: `order?.buyerId === userId ? 'buyer'`, replace: `order ? 'buyer'`, test: 'authz' },
  { name: 'anyone can edit a listing', file: 'src/modules/selling/service.ts', find: `if (listing.sellerUserId !== sellerId) throw new ApiError(403, 'FORBIDDEN', 'Not your listing');`, replace: ``, test: 'authz' },
  { name: 'anyone can read a chat', file: 'src/modules/negotiation/chats.ts', find: `if (!chat || (chat.buyerId !== userId && chat.listing.sellerUserId !== userId))`, replace: `if (!chat)`, test: 'authz' },
  { name: 'anyone can read an offer', file: 'src/modules/negotiation/offers.ts', find: `if (userId !== offer.buyerId && userId !== offer.listing.sellerUserId)`, replace: `if (false)`, test: 'authz' },
  { name: 'another driver can mark a pickup', file: 'src/modules/courier/deliveries.ts', find: `if (!order || order.courierId !== courierId) throw new ApiError(404, 'NOT_FOUND', \`No delivery \${orderId}\`);
  const { count } = await prisma.order.updateMany({
    where: { id: orderId, courierId, courierStatus: 'to_pickup', status: 'escrow_held' },`, replace: `if (!order) throw new ApiError(404, 'NOT_FOUND', \`No delivery \${orderId}\`);
  const { count } = await prisma.order.updateMany({
    where: { id: orderId, courierStatus: 'to_pickup', status: 'escrow_held' },`, test: 'authz' },
  { name: 'an endpoint loses its log-in check', file: 'src/modules/orders/routes.ts', find: `orderRoutes.get('/me/orders', ...requireCustomer, async`, replace: `orderRoutes.get('/me/orders', async`, test: 'authz' },
  { name: 'a customer token opens the dashboard', file: 'src/modules/auth/requireUser.ts', find: `const session = token ? await sessionForToken(token, 'admin') : undefined;`, replace: `const session = token ? ((await sessionForToken(token, 'admin')) ?? (await sessionForToken(token))) : undefined;`, test: 'authz' },
  { name: 'a store key reaches other stores', file: 'src/modules/refurbished/service.ts', find: `if (caller.storeId !== req.storeId)`, replace: `if (false)`, test: 'authz' },
  { name: 'admin answers carry the PIN', file: 'src/modules/orders/admin.ts', find: `const { pin: _pin, ...rest } = toApiOrder(order, req) as ReturnType<typeof toApiOrder> & { pin?: string };
  return rest;`, replace: `return toApiOrder(order, req);`, test: 'money' },
  { name: 'refunds lose their row lock', file: 'src/modules/orders/problems.ts', find: 'await tx.$queryRaw`SELECT 1 FROM "Order" WHERE "id" = ${order.id} FOR UPDATE`;', replace: ``, test: 'money' },
  { name: 'a PIN works before pickup', file: 'src/modules/courier/delivery.ts', find: `if (order.courierStatus !== 'picked_up') throw new ApiError(422, 'VALIDATION', 'Mark it as picked up first');`, replace: ``, test: 'money' },
  { name: 'a card number is accepted', file: 'src/modules/payments/cardToken.ts', find: `.refine(value => !looksLikeCardNumber(value), { error: 'send the provider’s token, never a card number' })`, replace: ``, test: 'money' },
  { name: 'a bid can be any amount', file: 'src/modules/negotiation/routes.ts', find: `const fils = z.number().int().positive().max(1_000_000_000);`, replace: `const fils = z.number();`, test: 'money' },
  { name: 'a bank account change has no hold', file: 'src/modules/payouts/account.ts', find: `...(replaced && { payoutChangedAt: new Date() }),`, replace: ``, test: 'payouts' },
  { name: 'a bank account change needs no password', file: 'src/modules/payouts/account.ts', find: `  await confirmOwner(me, input);\n`, replace: ``, test: 'payouts' },
  { name: 'support can see bank accounts', file: 'src/modules/admin/orders.ts', find: `adminOrdersRoutes.get('/admin/payouts', ...can('payouts'), async`, replace: `adminOrdersRoutes.get('/admin/payouts', ...can('orders'), async`, test: 'payouts' },
  { name: 'the money check misses a double payment', file: 'src/modules/orders/moneyCheck.ts', find: `GROUP BY o."id" HAVING COUNT(p."id") <> 1`, replace: `GROUP BY o."id" HAVING COUNT(p."id") < 1`, test: 'payouts' },
  { name: 'sign-up reveals taken emails', file: 'src/modules/auth/routes.ts', find: `  await sendCode(body.email, 'signup', { accountExists: !!exists });`, replace: `  if (exists) throw emailTaken();\n  await sendCode(body.email, 'signup');`, test: 'privacy' },
  { name: 'forgot-password waits for the email', file: 'src/modules/auth/routes.ts', find: `    runSoon(
      \`mail:reset:\${body.email}\`,
      () => sendCode(body.email, 'reset').catch(error => logger.error({ err: error }, 'Reset code not sent')),
      0,
    );`, replace: `    await sendCode(body.email, 'reset');`, test: 'privacy' },
  { name: 'a reset leaves old sessions alive', file: 'src/modules/auth/routes.ts', find: `    prisma.session.deleteMany({ where: { userId: user.id } }),\n`, replace: ``, test: 'privacy' },
  { name: 'deletion leaves the delivery address', file: 'src/modules/auth/deleteAccount.ts', find: `data: { deliveryName: '', deliveryPhone: '', deliveryAddress: '', deliveryNotes: null, cancelNote: null, itemIssueNote: null },`, replace: `data: { cancelNote: null },`, test: 'privacy' },
  { name: 'deletion leaves the certificate file', file: 'src/modules/auth/deleteAccount.ts', find: `    ...certificates.map(c => privateStorage.remove(c.photoUrl)),\n`, replace: ``, test: 'privacy' },
  { name: 'deletion ignores money owed', file: 'src/modules/auth/deleteAccount.ts', find: `  if (await prisma.payout.count({ where: { sellerUserId: userId, status: { not: 'paid' } } }))\n    throw closedBecause('Sahla still owes you money: wait for your payout');\n`, replace: ``, test: 'privacy' },
  { name: 'the export includes the password hash', file: 'src/modules/auth/exportAccount.ts', find: `      createdAt: user.createdAt,\n`, replace: `      createdAt: user.createdAt,\n      passwordHash: user.passwordHash,\n`, test: 'privacy' },
  { name: 'retention forgets the addresses', file: 'src/modules/privacy/retention.ts', find: `        deliveryPhone: '',\n        deliveryAddress: '',\n`, replace: ``, test: 'retention' },
  { name: 'a seller sees the buyer’s phone', file: 'src/modules/orders/shapes.ts', find: `delivery: { name: order.deliveryName, cityId: order.deliveryCityId },`, replace: `delivery: { name: order.deliveryName, cityId: order.deliveryCityId, phone: order.deliveryPhone },`, test: 'leaks' },
  { name: 'listings show the pickup address', file: 'src/modules/catalog/apiItem.ts', find: `    description: listing.description,\n`, replace: `    description: listing.description,\n    pickupAddress: listing.pickupAddress,\n`, test: 'leaks' },
  { name: 'the profile sends the card token', file: 'src/modules/auth/apiUser.ts', find: `    method: user.method,\n`, replace: `    method: user.method,\n    cardToken: user.cardToken,\n`, test: 'leaks' },
  { name: 'card tries have no limit', file: 'src/modules/orders/routes.ts', find: `orderRoutes.post('/orders/:id/pay', ...requireCustomer, ...LIMITS.pay, async`, replace: `orderRoutes.post('/orders/:id/pay', ...requireCustomer, async`, test: 'limits' },
  { name: 'one email has no overall limit', file: 'src/modules/auth/routes.ts', find: "    rateLimit({ ...common, limit: limit * 5 * env.RATE_LIMIT_MULTIPLIER, keyGenerator: req => `email:${emailOf(req as Request)}` }),\n", replace: ``, test: 'limits' },
  { name: 'bids deadlock the pool again', file: 'src/modules/negotiation/bids.ts', find: `(await sellerSuspended(listing.sellerUserId, tx)) ||
      (listing.sellerUserId && (await isBlockedBetween(bidderId, listing.sellerUserId, tx)))`, replace: `(await sellerSuspended(listing.sellerUserId)) ||
      (listing.sellerUserId && (await isBlockedBetween(bidderId, listing.sellerUserId)))`, test: 'bidsLoad' },
  { name: 'local disk allowed in production', file: 'src/env.ts', find: `.refine(e => !(e.NODE_ENV === 'production' && e.STORAGE !== 's3'), {`, replace: `.refine(() => true, {`, test: 'settings' },
  { name: 'a guessable JWT secret allowed', file: 'src/env.ts', find: `.refine(e => e.NODE_ENV !== 'production' || strongSecret(e.JWT_SECRET), {`, replace: `.refine(() => true, {`, test: 'settings' },
  { name: 'the seed runs in production', file: 'scripts/seed.ts', find: `if (env.NODE_ENV === 'production') {`, replace: `if (false) {`, test: 'settings' },
  { name: 'a NUL byte reaches the database', file: 'src/app.ts', find: `app.use(refuseNulBytes);\n`, replace: ``, test: 'hardening' },
  { name: 'errors send their real message', file: 'src/lib/errors.ts', find: `error = new ApiError(500, 'INTERNAL', 'Something went wrong');`, replace: `error = new ApiError(500, 'INTERNAL', String(err?.message));`, test: 'errorReporter' },
  { name: 'reports carry the raw error', file: 'src/lib/errorReporter.ts', find: `const safe = safeError(error);`, replace: `const safe = { type: 'Error', message: String((error as Error).message), stack: '', code: undefined as string | undefined };`, test: 'errorReporter' },
  { name: 'certificate originals go to the public bucket', file: 'src/modules/certificates/service.ts', find: `privateStorage.put(\`\${name}.jpg\`, image), // the original: admins only`, replace: `storage.put(\`\${name}.jpg\`, image),`, test: 'storage' },
  { name: 'storage requests aren’t really signed', file: 'src/lib/storage.ts', find: `secretAccessKey: env.S3_SECRET_ACCESS_KEY!,`, replace: `secretAccessKey: 'wrong-secret',`, test: 'storage' },
];

const only = process.argv[2];
const list = only ? MUTATIONS.filter(m => m.name.includes(only) || m.test === only) : MUTATIONS;
const results: { name: string; caught: boolean; note?: string }[] = [];
const shell = process.platform === 'win32';
const crlfSafe = (text: string) => text.replace(/\r\n/g, '\n');

for (const mutation of list) {
  const original = readFileSync(mutation.file, 'utf8');
  const source = crlfSafe(original);
  if (!source.includes(mutation.find)) {
    results.push({ name: mutation.name, caught: false, note: 'THE CODE TO BREAK WASN’T FOUND: update this list' });
    console.log(`??       ${mutation.name}: not found in ${mutation.file}`);
    continue;
  }
  try {
    writeFileSync(mutation.file, source.replace(mutation.find, () => mutation.replace));
    const r = spawnSync('npm', ['run', 'test:api', '--', mutation.test], { shell, encoding: 'utf8', timeout: 240_000 });
    const caught = r.status !== 0;
    results.push({ name: mutation.name, caught });
    console.log(`${caught ? 'caught ' : 'MISSED '}  ${mutation.name}  (${mutation.test})`);
  } finally {
    writeFileSync(mutation.file, original);
  }
}

const missed = results.filter(r => !r.caught);
console.log(`${results.length - missed.length} of ${results.length} broken protections were caught.`);
for (const m of missed) console.log(`NOT CAUGHT: ${m.name}${m.note ? ` (${m.note})` : ''}`);
process.exit(missed.length ? 1 : 0);
