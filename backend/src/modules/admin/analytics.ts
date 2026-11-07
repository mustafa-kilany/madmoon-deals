import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { Prisma } from '../../generated/prisma/client';

import { can } from './permissions';

// The dashboard's Analytics page (BACKEND_PLAN B8.8): what happened day by
// day over the chosen period, compared with the period before, plus how the
// marketplace looks right now. Days are Jordan days (Asia/Amman), like the
// courier's "today". Business numbers only: technical health is Sentry's (B12).

export const adminAnalyticsRoutes = Router();

const TZ = 'Asia/Amman';
const DAY = 86_400_000;

/** "2026-11-01": the calendar day in Jordan of this moment. */
const jordanDay = (at: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(at);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** Timestamps are stored in UTC without a zone: this is their day in Jordan. */
const localDay = (column: string) => Prisma.raw(`(("${column}" AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}')::date`);

type DayCount = { day: Date; count: bigint; total?: bigint | null };

/** Rows per Jordan day from `from` (inclusive), as a map "2026-11-01" → numbers. */
async function perDay(table: string, column: string, from: string, extra: Prisma.Sql, sum?: string) {
  const day = localDay(column);
  const rows = await prisma.$queryRaw<DayCount[]>`
    SELECT ${day} AS day, count(*) AS count ${sum ? Prisma.raw(`, sum("${sum}") AS total`) : Prisma.empty}
    FROM ${Prisma.raw(`"${table}"`)}
    WHERE "${Prisma.raw(column)}" IS NOT NULL AND ${day} >= ${from}::date ${extra}
    GROUP BY 1`;
  return new Map(rows.map(r => [r.day.toISOString().slice(0, 10), { count: Number(r.count), total: Number(r.total ?? 0) }]));
}

const query = z.object({ days: z.coerce.number().refine(d => [7, 30, 90].includes(d), '7, 30 or 90').default(30) });

adminAnalyticsRoutes.get('/admin/analytics', ...can('analytics'), async (req, res) => {
  const { days } = query.parse(req.query);
  const today = jordanDay(new Date());
  const from = addDays(today, -(days - 1));
  // The period before, for the comparisons: as long, right before it.
  const previousFrom = addDays(from, -days);

  const [signups, listings, paid, reports, ordersByStatus, methods, categories, areas] = await Promise.all([
    perDay('User', 'createdAt', previousFrom, Prisma.sql`AND "role" IS NULL`),
    // People's listings: a store's sheet adds hundreds at once and would hide the trend.
    perDay('Listing', 'createdAt', previousFrom, Prisma.sql`AND "sellerUserId" IS NOT NULL`),
    perDay('Order', 'paidAt', previousFrom, Prisma.empty, 'totalFils'),
    perDay('Report', 'createdAt', previousFrom, Prisma.empty),
    prisma.$queryRaw<{ status: string; count: bigint }[]>`
      SELECT "status"::text AS status, count(*) AS count FROM "Order"
      WHERE ${localDay('createdAt')} >= ${from}::date GROUP BY 1`,
    prisma.user.groupBy({ by: ['method'], where: { role: null }, _count: { _all: true } }),
    prisma.listing.groupBy({ by: ['category'], where: { status: 'active', reportHidden: false }, _count: { _all: true } }),
    prisma.listing.groupBy({ by: ['locationId'], where: { status: 'active', reportHidden: false }, _count: { _all: true } }),
  ]);

  const daily = Array.from({ length: days }, (_, i) => {
    const day = addDays(from, i);
    return {
      day,
      signups: signups.get(day)?.count ?? 0,
      listings: listings.get(day)?.count ?? 0,
      paidOrders: paid.get(day)?.count ?? 0,
      salesFils: paid.get(day)?.total ?? 0,
      reports: reports.get(day)?.count ?? 0,
    };
  });
  const totalOf = (map: Map<string, { count: number; total: number }>, start: string, end: string, key: 'count' | 'total' = 'count') =>
    [...map].filter(([day]) => day >= start && day <= end).reduce((sum, [, v]) => sum + v[key], 0);
  const period = (start: string, end: string) => ({
    signups: totalOf(signups, start, end),
    listings: totalOf(listings, start, end),
    paidOrders: totalOf(paid, start, end),
    salesFils: totalOf(paid, start, end, 'total'),
    reports: totalOf(reports, start, end),
  });

  const statusCount = new Map(ordersByStatus.map(r => [r.status, Number(r.count)]));
  res.json({
    days,
    from,
    to: today,
    timeZone: TZ,
    totals: period(from, today),
    previous: period(previousFrom, addDays(from, -1)),
    daily,
    // Orders started in the period, by where they are now.
    ordersByStatus: Object.fromEntries(
      ['awaiting_payment', 'escrow_held', 'completed', 'refunded', 'cancelled'].map(s => [s, statusCount.get(s) ?? 0]),
    ),
    // Now, whatever the period: customers by how they sign in, what is on sale and where.
    customersBySignIn: Object.fromEntries(['email', 'google', 'apple'].map(m => [m, methods.find(r => r.method === m)?._count._all ?? 0])),
    listingsByCategory: categories.map(c => ({ category: c.category, count: c._count._all })).sort((a, b) => b.count - a.count),
    listingsByArea: areas.map(a => ({ areaId: a.locationId, count: a._count._all })).sort((a, b) => b.count - a.count),
  });
});
