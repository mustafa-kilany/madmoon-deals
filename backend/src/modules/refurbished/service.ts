import type { RefurbishedImportRow } from '@/lib/refurbishedImport';
import { prisma } from '../../db';
import { ApiError } from '../../lib/errors';
import { searchTextFor } from '../catalog/searchText';
import { planImport, type ExistingListing } from './plan';
import type { ImportCaller } from './storeKeys';

export type ImportRequest = {
  storeId: string;
  mode: 'upsert' | 'replace';
  dryRun: boolean;
  items: RefurbishedImportRow[];
};

export async function importRefurbished(req: ImportRequest, caller: ImportCaller) {
  const store = await prisma.store.findUnique({ where: { id: req.storeId } });
  if (!store) throw new ApiError(404, 'NOT_FOUND', `No store ${req.storeId}`);
  if (caller.storeId !== req.storeId)
    throw new ApiError(403, 'FORBIDDEN', 'This key can only import its own store');

  const existing = (await prisma.listing.findMany({
    where: { storeId: store.id, sku: { not: null } },
  })) as unknown as ExistingListing[];
  const plan = planImport(req.items, existing, req.mode);
  const result = {
    dryRun: req.dryRun,
    created: plan.create.length,
    updated: plan.update.length,
    withdrawn: plan.withdraw.length,
    errors: plan.errors,
  };
  if (req.dryRun) return result;

  // TODO(uploads): copy imageUrls to Madmoon Deals' CDN instead of linking the brand's URLs.
  await prisma.$transaction(
    async tx => {
      // Store listings are always verified (the brand's official store).
      for (const { sku, fields } of plan.create)
        await tx.listing.create({
          data: {
            ...fields,
            storeId: store.id,
            sku,
            searchText: searchTextFor(fields),
            sellerVerified: true,
          },
        });
      for (const { id, fields } of plan.update)
        await tx.listing.update({
          where: { id },
          data: { ...fields, searchText: searchTextFor(fields) },
        });
      if (plan.withdraw.length > 0)
        await tx.listing.updateMany({
          where: { id: { in: plan.withdraw.map(w => w.id) } },
          data: { status: 'withdrawn' },
        });
      await tx.refurbishedImport.create({
        data: {
          storeId: store.id,
          source: caller.source,
          mode: req.mode,
          created: result.created,
          updated: result.updated,
          withdrawn: result.withdrawn,
          errors: plan.errors,
        },
      });
    },
    { timeout: 60_000 },
  );
  return result;
}

/** DELETE /admin/refurbished/:storeId/:sku */
export async function withdrawRefurbished(
  storeId: string,
  sku: string,
  caller: ImportCaller,
) {
  if (caller.storeId !== storeId)
    throw new ApiError(403, 'FORBIDDEN', 'This key can only change its own store');
  const listing = await prisma.listing.findUnique({
    where: { storeId_sku: { storeId, sku } },
  });
  if (!listing || listing.status === 'withdrawn')
    throw new ApiError(404, 'NOT_FOUND', `No listing ${storeId}/${sku}`);
  // TODO(orders): a reserved listing (open order) is withdrawn once its order completes.
  if (listing.status === 'active')
    await prisma.listing.update({
      where: { id: listing.id },
      data: { status: 'withdrawn' },
    });
}
