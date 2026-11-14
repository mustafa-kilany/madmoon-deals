// npm run load-check [-- <listings>]: fills the TEST database (madmoon_test) with
// fake listings (default 10 000), times typical GET /listings requests, then
// removes them. Never touches your development data.

import 'dotenv/config';
import { execSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';

const count = Number(process.argv[2] ?? 10_000);
const url = new URL(process.env.DATABASE_URL ?? '');
url.pathname = `${url.pathname.replace(/_test$/, '')}_test`;
process.env.DATABASE_URL = url.toString();
process.env.NODE_ENV = 'test';
execSync('npx prisma migrate deploy', { stdio: 'ignore', env: process.env });

const { app } = await import('../src/app');
const { prisma } = await import('../src/db');
const { categoryFilters, cities } = await import('../src/reference');
const { searchTextFor } = await import('../src/modules/catalog/searchText');

const SELLER = 'user-load-check';
const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]!;
const conditions = ['new', 'excellent', 'good', 'loved'] as const;

async function fill() {
  await prisma.user.upsert({
    where: { id: SELLER },
    update: {},
    create: { id: SELLER, name: 'Load check', email: 'load-check@test.sahla.jo' },
  });
  const now = Date.now();
  for (let done = 0; done < count; done += 1000) {
    const rows = Array.from({ length: Math.min(1000, count - done) }, (_, i) => {
      const category = pick(Object.keys(categoryFilters)) as keyof typeof categoryFilters;
      const type = pick(categoryFilters[category].types);
      const brand = type.brands?.length ? pick(type.brands) : undefined;
      const model = brand && type.models?.[brand]?.length ? pick(type.models[brand]) : undefined;
      const auction = Math.random() < 0.15;
      const fields = {
        category,
        type: type.id,
        titleEn: [brand, model ?? type.name.en].filter(Boolean).join(' '),
        titleAr: `${type.name.ar} ${brand ?? ''}`.trim(),
        brand: brand ?? null,
        model: model ?? null,
      };
      return {
        id: `load-${done + i}`,
        ...fields,
        priceFils: 1000 * (5 + Math.floor(Math.random() * 2000)),
        imageUrls: ['https://images.example.com/x.jpg'],
        condition: pick(conditions),
        description: 'Load check listing with enough words to pass the ten word description rule.',
        locationId: pick(cities).id,
        saleType: auction ? ('auction' as const) : ('fixed' as const),
        auctionEndsAt: auction ? new Date(now + Math.random() * 7 * 86_400_000) : null,
        incrementFils: auction ? 5000 : null,
        bidCount: auction ? Math.floor(Math.random() * 30) : 0,
        views: Math.floor(Math.random() * 1000),
        sellerVerified: Math.random() < 0.6,
        sellerUserId: SELLER,
        searchText: searchTextFor(fields),
        createdAt: new Date(now - Math.random() * 90 * 86_400_000),
      };
    });
    await prisma.listing.createMany({ data: rows });
  }
  await prisma.$executeRawUnsafe('ANALYZE "Listing"');
}

async function time(base: string, query: string) {
  const runs: number[] = [];
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const start = performance.now();
    const response = await fetch(`${base}/listings?${query}`);
    const body = await response.json();
    runs.push(performance.now() - start);
    total = body.total;
  }
  runs.sort((a, b) => a - b);
  return { query: query || '(home: recommended)', median: runs[3]!, total };
}

try {
  console.log(`Adding ${count} listings to ${url.pathname.slice(1)}…`);
  await fill();
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const queries = [
    '',
    'q=samsung',
    'q=ايفون',
    'q=apple%20pro',
    'category=mobiles&types=phones&brands=Apple,Samsung&sort=price_asc',
    'format=auction&sort=ending_soon',
    'format=auction&endingSoon=true',
    'minPrice=100000&maxPrice=500000&verifiedOnly=true&sort=price_desc',
    'cities=amman-khalda,irbid,zarqa&sort=most_viewed',
  ];
  const results = [];
  for (const query of queries) results.push(await time(base, query));
  // Deep page: follow the cursor 10 pages in.
  let cursor: string | null = null;
  for (let page = 0; page < 10; page++) {
    const body: { nextCursor: string | null } = await (
      await fetch(`${base}/listings?sort=price_asc${cursor ? `&cursor=${cursor}` : ''}`)
    ).json();
    cursor = body.nextCursor;
  }
  if (cursor) results.push(await time(base, `sort=price_asc&cursor=${cursor}`));
  server.close();

  console.log('\nGET /listings (median of 7, includes counts and facets):');
  for (const r of results)
    console.log(`  ${r.median.toFixed(0).padStart(5)} ms  ${String(r.total).padStart(6)} matches  ${r.query.slice(0, 70)}`);
} finally {
  await prisma.listing.deleteMany({ where: { sellerUserId: SELLER } });
  await prisma.user.deleteMany({ where: { id: SELLER } });
  await prisma.$disconnect();
}
