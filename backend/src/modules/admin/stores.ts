import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { ApiError } from '../../lib/errors';
import { currentUser, requireAdmin } from '../auth/requireUser';
import { deliveryDetails } from '../orders/delivery';
import { parseImportCsv } from '../refurbished/csv';
import { importRefurbished } from '../refurbished/service';
import { hashKey, newStoreKey } from '../refurbished/storeKeys';
import { adminDid } from './audit';

// Certified Refurbished in the dashboard (BACKEND_PLAN B8.4): the brands'
// stores, their API keys, the import history, and uploading a store's sheet
// (CSV UTF-8, columns = docs/refurbished-import-template.csv) with a preview.
// The same as `npm run store`; the import itself is refurbished/service.ts.
// Under /admin/refurbished/, so a sheet may be up to 5 MB (app.ts).

export const adminStoreRoutes = Router();

const iso = (d: Date | null) => d?.toISOString() ?? null;
/** Excel sheets: the CSV parser's limit; the import endpoint takes 1000 rows per call. */
const MAX_ROWS = 1000;

type KeyRow = { id: string; label: string; createdAt: Date; lastUsedAt: Date | null; revokedAt: Date | null };
const toApiKey = (k: KeyRow) => ({
  id: k.id,
  label: k.label,
  createdAt: k.createdAt.toISOString(),
  lastUsedAt: iso(k.lastUsedAt),
  revokedAt: iso(k.revokedAt),
});

async function store(id: string) {
  const found = await prisma.store.findUnique({ where: { id } });
  if (!found) throw new ApiError(404, 'NOT_FOUND', `No store ${id}`);
  return found;
}

adminStoreRoutes.get('/admin/refurbished/stores', ...requireAdmin, async (_req, res) => {
  const [stores, onSale, lastImports] = await Promise.all([
    prisma.store.findMany({ include: { apiKeys: { orderBy: { createdAt: 'desc' } } }, orderBy: { nameEn: 'asc' } }),
    prisma.listing.groupBy({ by: ['storeId'], where: { storeId: { not: null }, status: 'active' }, _count: { _all: true } }),
    prisma.refurbishedImport.groupBy({ by: ['storeId'], _max: { createdAt: true } }),
  ]);
  const count = new Map(onSale.map(s => [s.storeId, s._count._all]));
  const last = new Map(lastImports.map(i => [i.storeId, i._max.createdAt]));
  res.json(
    stores.map(s => ({
      id: s.id,
      nameEn: s.nameEn,
      nameAr: s.nameAr,
      onSale: count.get(s.id) ?? 0,
      lastImportAt: iso(last.get(s.id) ?? null),
      pickup: s.pickupAddress ? { phone: s.pickupPhone ?? '', cityId: s.pickupCityId ?? '', address: s.pickupAddress } : null,
      keys: s.apiKeys.map(toApiKey),
      createdAt: s.createdAt.toISOString(),
    })),
  );
});

adminStoreRoutes.post('/admin/refurbished/stores', ...requireAdmin, async (req, res) => {
  const input = z
    .object({
      id: z.string().trim().regex(/^store-[a-z0-9-]{2,40}$/, 'store-<brand>: lowercase letters, digits and dashes'),
      nameEn: z.string().trim().min(2).max(60),
      nameAr: z.string().trim().min(2).max(60),
    })
    .parse(req.body);
  if (await prisma.store.findUnique({ where: { id: input.id } }))
    throw new ApiError(422, 'VALIDATION', `There is already a store ${input.id}`);
  const created = await prisma.store.create({ data: input });
  await adminDid(req, res, 'store.create', { type: 'store', id: created.id }, input);
  res.status(201).json({ ...created, onSale: 0, lastImportAt: null, pickup: null, keys: [], createdAt: created.createdAt.toISOString() });
});

/**
 * Where couriers collect this store's orders (B14.5): copied onto each new order,
 * like a person's listing pickup. Orders already placed keep theirs.
 */
adminStoreRoutes.post('/admin/refurbished/stores/:id/pickup', ...requireAdmin, async (req, res) => {
  const pickup = deliveryDetails.pick({ phone: true, cityId: true, address: true }).parse(req.body);
  const { id } = await store(req.params.id as string);
  await prisma.store.update({ where: { id }, data: { pickupPhone: pickup.phone, pickupCityId: pickup.cityId, pickupAddress: pickup.address } });
  await adminDid(req, res, 'store.pickup', { type: 'store', id }, pickup);
  res.json(pickup);
});

/** A new key for the brand's own system: shown once, only its hash is kept. */
adminStoreRoutes.post('/admin/refurbished/stores/:id/keys', ...requireAdmin, async (req, res) => {
  const { label } = z.object({ label: z.string().trim().min(2).max(60) }).parse(req.body);
  const { id: storeId } = await store(req.params.id as string);
  const key = newStoreKey();
  const row = await prisma.storeApiKey.create({ data: { storeId, label, keyHash: hashKey(key) } });
  await adminDid(req, res, 'store.key_create', { type: 'store', id: storeId }, { keyId: row.id, label });
  res.status(201).json({ ...toApiKey(row), key });
});

adminStoreRoutes.post('/admin/refurbished/stores/:id/keys/:keyId/revoke', ...requireAdmin, async (req, res) => {
  const key = await prisma.storeApiKey.findUnique({ where: { id: req.params.keyId as string } });
  if (!key || key.storeId !== req.params.id) throw new ApiError(404, 'NOT_FOUND', 'No such key');
  if (key.revokedAt) throw new ApiError(422, 'VALIDATION', 'Already revoked');
  const revoked = await prisma.storeApiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
  await adminDid(req, res, 'store.key_revoke', { type: 'store', id: key.storeId }, { keyId: key.id, label: key.label });
  res.json(toApiKey(revoked));
});

/** The latest imports of one store, from the dashboard, the CLI or the brand's key. */
adminStoreRoutes.get('/admin/refurbished/stores/:id/imports', ...requireAdmin, async (req, res) => {
  const { id: storeId } = await store(req.params.id as string);
  const imports = await prisma.refurbishedImport.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' }, take: 50 });
  const adminIds = imports.map(i => i.source.match(/^admin:(.+)$/)?.[1]).filter((id): id is string => !!id);
  const admins = new Map(
    (await prisma.user.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true } })).map(a => [a.id, a.name]),
  );
  res.json(
    imports.map(i => {
      const [kind, value] = i.source.split(/:(.*)/s);
      return {
        id: i.id,
        // "Key: Apple stock system", "Admin: Sara", "Command line"
        source: kind === 'key' ? `Key: ${value}` : value === 'cli' ? 'Command line' : `Admin: ${admins.get(value ?? '') ?? 'a deleted account'}`,
        mode: i.mode,
        created: i.created,
        updated: i.updated,
        withdrawn: i.withdrawn,
        errors: i.errors,
        createdAt: i.createdAt.toISOString(),
      };
    }),
  );
});

/**
 * The store's sheet as CSV text. dryRun = the preview (nothing saved); then the
 * same call without dryRun publishes. Rows with problems are skipped either way.
 */
adminStoreRoutes.post('/admin/refurbished/stores/:id/import', ...requireAdmin, async (req, res) => {
  const body = z
    .object({
      csv: z.string().min(1).max(5_000_000),
      mode: z.enum(['upsert', 'replace']).default('upsert'),
      dryRun: z.boolean().default(false),
    })
    .parse(req.body);
  const { id: storeId } = await store(req.params.id as string);
  let items;
  try {
    items = parseImportCsv(body.csv);
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    throw new ApiError(422, 'VALIDATION', `Can’t read this file as CSV (${why}). In Excel: File → Save As → “CSV UTF-8”.`);
  }
  if (!items.length) throw new ApiError(422, 'VALIDATION', 'The sheet has no rows under the header');
  if (items.length > MAX_ROWS) throw new ApiError(422, 'VALIDATION', `At most ${MAX_ROWS} rows per upload (this one has ${items.length})`);
  // Another sheet (or the wrong header row) reads as rows with every template column empty.
  if (items.every(i => !i.sku && !i.titleEn))
    throw new ApiError(422, 'VALIDATION', 'The header row doesn’t match the template (sku, titleEn, titleAr, …)');

  const adminId = currentUser(res.locals).id;
  const result = await importRefurbished({ storeId, mode: body.mode, dryRun: body.dryRun, items }, { storeId, source: `admin:${adminId}` });
  if (!body.dryRun) {
    const { errors, ...counts } = result;
    const skippedRows = new Set(errors.map(e => e.row)).size;
    await adminDid(req, res, 'store.import', { type: 'store', id: storeId }, { mode: body.mode, ...counts, skippedRows });
  }
  res.json({ ...result, rows: items.length });
});
