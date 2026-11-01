import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { ApiError } from '../../lib/errors';
import { publicUrl } from '../../lib/publicUrl';
import { privateFilePath } from '../../lib/storage';
import { currentUser, requireAdmin } from '../auth/requireUser';
import { coverUrl } from '../catalog/apiItem';
import { ADMIN_REJECTED } from '../certificates/service';
import { pushListingRemoved } from '../notifications/notify';
import { adminDid } from './audit';

// The dashboard's review queues (BACKEND_PLAN B8.3): reported listings and
// users, suspicious-account flags, and test certificates whose stamp nobody has
// checked yet. Every decision needs a reason and goes to the audit log.

export const adminQueueRoutes = Router();

const reason = z.object({ reason: z.string().trim().min(3).max(500) });
const iso = (d: Date | null) => d?.toISOString() ?? null;
const absolute = (req: Request, url: string | null) => (url ? (url.startsWith('/') ? publicUrl(req, url) : url) : null);
/** How many queue entries one request returns (the oldest or worst first). */
const QUEUE_SIZE = 100;

type ReportRow = { id: string; reason: string; details: string | null; createdAt: Date; reporter: { id: string; name: string } };
const toApiReport = (r: ReportRow) => ({
  id: r.id,
  reporter: r.reporter,
  reason: r.reason,
  details: r.details,
  createdAt: r.createdAt.toISOString(),
});
const reasonCounts = (reports: { reason: string }[]) =>
  reports.reduce<Record<string, number>>((counts, r) => ({ ...counts, [r.reason]: (counts[r.reason] ?? 0) + 1 }), {});

/** The open reports about these targets, grouped by target, newest report first. */
async function openReportsFor(targetType: 'listing' | 'user', targetIds: string[]) {
  const rows = await prisma.report.findMany({
    where: { targetType, targetId: { in: targetIds }, resolvedAt: null },
    include: { reporter: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const byTarget = new Map<string, ReportRow[]>();
  for (const row of rows) byTarget.set(row.targetId, [...(byTarget.get(row.targetId) ?? []), row]);
  return byTarget;
}

const resolveReports = (targetType: 'listing' | 'user', targetId: string, resolution: string, adminId: string) =>
  prisma.report.updateMany({
    where: { targetType, targetId, resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedById: adminId, resolution },
  });

// ── Reported listings ────────────────────────────────────────────────────────

/** Listings with open reports: hidden ones first, then the most reporters. */
adminQueueRoutes.get('/admin/reports/listings', ...requireAdmin, async (req, res) => {
  const groups = await prisma.report.groupBy({
    by: ['targetId'],
    where: { targetType: 'listing', resolvedAt: null },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  const listings = await prisma.listing.findMany({
    where: { id: { in: groups.map(g => g.targetId) } },
    include: { sellerUser: { select: { id: true, name: true, email: true, suspended: true } }, store: { select: { id: true, nameEn: true } } },
  });
  const byId = new Map(listings.map(l => [l.id, l]));
  const ranked = groups
    .filter(g => byId.has(g.targetId))
    .sort(
      (a, b) =>
        Number(byId.get(b.targetId)!.reportHidden) - Number(byId.get(a.targetId)!.reportHidden) ||
        b._count._all - a._count._all ||
        (b._max.createdAt?.getTime() ?? 0) - (a._max.createdAt?.getTime() ?? 0),
    )
    .slice(0, QUEUE_SIZE);
  const reports = await openReportsFor('listing', ranked.map(g => g.targetId));
  res.json(
    ranked.map(g => {
      const l = byId.get(g.targetId)!;
      const open = reports.get(l.id) ?? [];
      return {
        listing: {
          id: l.id,
          title: l.titleEn,
          imageUrl: coverUrl(l.imageUrls, req),
          priceFils: l.priceFils,
          status: l.status,
          reportHidden: l.reportHidden,
          createdAt: l.createdAt.toISOString(),
        },
        seller: l.store
          ? { id: l.store.id, name: l.store.nameEn, email: '', suspended: false }
          : l.sellerUser && { ...l.sellerUser, email: l.sellerUser.email ?? '' },
        reasons: reasonCounts(open),
        reports: open.map(toApiReport),
      };
    }),
  );
});

/** "Nothing wrong": back on sale if it was hidden; its open reports are closed. */
adminQueueRoutes.post('/admin/listings/:id/keep', ...requireAdmin, async (req, res) => {
  const { reason: why } = reason.parse(req.body);
  const id = req.params.id as string;
  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) throw new ApiError(404, 'NOT_FOUND', `No listing ${id}`);
  const [{ count }] = await prisma.$transaction([
    resolveReports('listing', id, 'kept', currentUser(res.locals).id),
    prisma.listing.update({ where: { id }, data: { reportHidden: false } }),
  ]);
  await adminDid(req, res, 'listing.keep', { type: 'listing', id }, { reason: why, reports: count, wasHidden: listing.reportHidden });
  res.status(204).end();
});

/** Breaks the rules: off sale for good (withdrawn); the seller gets a push. Not once paid for. */
adminQueueRoutes.post('/admin/listings/:id/remove', ...requireAdmin, async (req, res) => {
  const { reason: why } = reason.parse(req.body);
  const id = req.params.id as string;
  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) throw new ApiError(404, 'NOT_FOUND', `No listing ${id}`);
  if (listing.status === 'reserved')
    throw new ApiError(409, 'OPEN_ORDERS', 'This listing has a paid order: refund the order first, then remove it');
  if (listing.status === 'sold') throw new ApiError(409, 'ITEM_UNAVAILABLE', 'Already sold: use “Keep” to close its reports');
  if (listing.status === 'withdrawn') throw new ApiError(422, 'VALIDATION', 'Already off sale');
  const [{ count }] = await prisma.$transaction([
    resolveReports('listing', id, 'removed', currentUser(res.locals).id),
    prisma.listing.update({ where: { id }, data: { status: 'withdrawn' } }),
  ]);
  await adminDid(req, res, 'listing.remove', { type: 'listing', id }, { reason: why, reports: count });
  pushListingRemoved(id, 'reports');
  res.status(204).end();
});

// ── Reported users ───────────────────────────────────────────────────────────

/** Accounts with open reports about them (not about their listings), the most reporters first. */
adminQueueRoutes.get('/admin/reports/users', ...requireAdmin, async (_req, res) => {
  const groups = await prisma.report.groupBy({
    by: ['targetId'],
    where: { targetType: 'user', resolvedAt: null },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  const users = await prisma.user.findMany({ where: { id: { in: groups.map(g => g.targetId) } } });
  const byId = new Map(users.map(u => [u.id, u]));
  const ranked = groups
    .filter(g => byId.has(g.targetId))
    .sort((a, b) => b._count._all - a._count._all || (b._max.createdAt?.getTime() ?? 0) - (a._max.createdAt?.getTime() ?? 0))
    .slice(0, QUEUE_SIZE);
  const reports = await openReportsFor('user', ranked.map(g => g.targetId));
  res.json(
    ranked.map(g => {
      const u = byId.get(g.targetId)!;
      const open = reports.get(u.id) ?? [];
      return {
        user: { id: u.id, name: u.name, email: u.email ?? '', suspended: u.suspended, createdAt: u.createdAt.toISOString() },
        reasons: reasonCounts(open),
        reports: open.map(toApiReport),
      };
    }),
  );
});

/** "Nothing wrong": closes the open reports about this account (suspending closes them too). */
adminQueueRoutes.post('/admin/reports/users/:id/dismiss', ...requireAdmin, async (req, res) => {
  const { reason: why } = reason.parse(req.body);
  const id = req.params.id as string;
  const { count } = await resolveReports('user', id, 'dismissed', currentUser(res.locals).id);
  if (!count) throw new ApiError(422, 'VALIDATION', 'No open reports about this account');
  await adminDid(req, res, 'user.reports_dismiss', { type: 'user', id }, { reason: why, reports: count });
  res.status(204).end();
});

// ── Suspicious accounts (risk flags, B5.3) ─────────────────────────────────────

const flagQuery = z.object({ status: z.enum(['open', 'dismissed', 'actioned']).default('open') });

/** Open flags: the highest score first. Reviewed ones: the latest review first. */
adminQueueRoutes.get('/admin/risk-flags', ...requireAdmin, async (req, res) => {
  const { status } = flagQuery.parse(req.query);
  const flags = await prisma.riskFlag.findMany({
    where: { status },
    include: {
      user: { select: { id: true, name: true, email: true, suspended: true, createdAt: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
    orderBy: status === 'open' ? [{ score: 'desc' }, { createdAt: 'asc' }] : [{ reviewedAt: 'desc' }],
    take: QUEUE_SIZE,
  });
  res.json(
    flags.map(f => ({
      id: f.id,
      user: { ...f.user, email: f.user.email ?? '', createdAt: f.user.createdAt.toISOString() },
      score: f.score,
      signals: f.signals,
      aiSummary: f.aiSummary,
      status: f.status,
      reviewedBy: f.reviewedBy,
      reviewNote: f.reviewNote,
      createdAt: f.createdAt.toISOString(),
      reviewedAt: iso(f.reviewedAt),
    })),
  );
});

/**
 * dismissed = an admin looked and nothing is wrong; actioned = they did
 * something (warned, suspended…). The checker only adds a new flag for this
 * account once this one is closed and the score is still high.
 */
adminQueueRoutes.post('/admin/risk-flags/:id/review', ...requireAdmin, async (req, res) => {
  const { status, note } = z
    .object({ status: z.enum(['dismissed', 'actioned']), note: z.string().trim().min(3).max(500) })
    .parse(req.body);
  const flag = await prisma.riskFlag.findUnique({ where: { id: req.params.id as string } });
  if (!flag) throw new ApiError(404, 'NOT_FOUND', 'No such flag');
  if (flag.status !== 'open') throw new ApiError(422, 'VALIDATION', 'Already reviewed');
  await prisma.riskFlag.update({
    where: { id: flag.id },
    data: { status, reviewNote: note, reviewedById: currentUser(res.locals).id, reviewedAt: new Date() },
  });
  await adminDid(req, res, `risk_flag.${status}`, { type: 'user', id: flag.userId }, { reason: note, flagId: flag.id, score: flag.score });
  res.status(204).end();
});

// ── Test certificates: the stamp check (B4.3) ─────────────────────────────────

/** Passed on the text alone, on a listing that is on sale: the oldest first (it has been on sale longest). */
adminQueueRoutes.get('/admin/certificates', ...requireAdmin, async (req, res) => {
  const certificates = await prisma.testCertificate.findMany({
    where: { status: 'passed', stampChecked: false, listing: { status: { in: ['active', 'reserved'] } } },
    include: {
      listing: { select: { id: true, titleEn: true, imageUrls: true, priceFils: true, status: true } },
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: QUEUE_SIZE,
  });
  res.json(
    certificates.map(c => ({
      id: c.id,
      listing: c.listing && {
        id: c.listing.id,
        title: c.listing.titleEn,
        imageUrl: coverUrl(c.listing.imageUrls, req),
        priceFils: c.listing.priceFils,
        status: c.listing.status,
      },
      seller: { ...c.user, email: c.user.email ?? '' },
      device: { category: c.category, type: c.type, brand: c.brand, model: c.model },
      read: { shopName: c.shopName, shopPhone: c.shopPhone, testedAt: iso(c.testedAt), device: c.device, specs: c.specs },
      blurredUrl: absolute(req, c.blurredUrl),
      createdAt: c.createdAt.toISOString(),
    })),
  );
});

/** The original photo (IMEI / serial readable): admins only, never cached by the browser. */
adminQueueRoutes.get('/admin/certificates/:id/photo', ...requireAdmin, async (req, res) => {
  const certificate = await prisma.testCertificate.findUnique({ where: { id: req.params.id as string }, select: { photoUrl: true } });
  const file = certificate && privateFilePath(certificate.photoUrl);
  if (!file) throw new ApiError(404, 'NOT_FOUND', 'No such certificate photo');
  res.set('Cache-Control', 'private, no-store');
  res.sendFile(file, error => {
    if (error && !res.headersSent) res.status(404).json({ error: { code: 'NOT_FOUND', message: 'The photo file is missing' } });
  });
});

async function uncheckedCertificate(id: string) {
  const certificate = await prisma.testCertificate.findUnique({ where: { id }, include: { listing: true } });
  if (!certificate) throw new ApiError(404, 'NOT_FOUND', 'No such certificate');
  if (certificate.status !== 'passed' || certificate.stampChecked) throw new ApiError(422, 'VALIDATION', 'Already reviewed');
  return certificate;
}

/** The stamp is there and it looks genuine. */
adminQueueRoutes.post('/admin/certificates/:id/approve', ...requireAdmin, async (req, res) => {
  const certificate = await uncheckedCertificate(req.params.id as string);
  await prisma.testCertificate.update({ where: { id: certificate.id }, data: { stampChecked: true } });
  await adminDid(req, res, 'certificate.approve', { type: 'certificate', id: certificate.id }, { listingId: certificate.listing?.id ?? null });
  res.status(204).end();
});

/**
 * No stamp, or not a real shop report: the certificate fails, the listing comes
 * off sale and the seller gets a push. The same photo or IMEI can't be used
 * again on a new listing. Not once paid for (refund first).
 */
adminQueueRoutes.post('/admin/certificates/:id/reject', ...requireAdmin, async (req, res) => {
  const { reason: why } = reason.parse(req.body);
  const certificate = await uncheckedCertificate(req.params.id as string);
  const listing = certificate.listing;
  if (listing?.status === 'reserved')
    throw new ApiError(409, 'OPEN_ORDERS', 'This listing has a paid order: refund the order first, then reject');
  await prisma.$transaction([
    prisma.testCertificate.update({
      where: { id: certificate.id },
      data: { status: 'failed', stampChecked: true, problems: { push: ADMIN_REJECTED } },
    }),
    ...(listing?.status === 'active' ? [prisma.listing.update({ where: { id: listing.id }, data: { status: 'withdrawn' } })] : []),
  ]);
  await adminDid(req, res, 'certificate.reject', { type: 'certificate', id: certificate.id }, { reason: why, listingId: listing?.id ?? null });
  if (listing?.status === 'active') pushListingRemoved(listing.id, 'certificate');
  res.status(204).end();
});
