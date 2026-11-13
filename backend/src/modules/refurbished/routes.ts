import { Router } from 'express';
import { z } from 'zod';
import type { RefurbishedImportRow } from '@/lib/refurbishedImport';
import { importRefurbished, withdrawRefurbished } from './service';
import { requireImportCaller } from './storeKeys';

// docs/API.md → Certified Refurbished import. Row problems aren't errors: they
// come back in `errors` with status 200. Only the envelope is checked here.
const importBody = z.object({
  storeId: z.string().min(1),
  mode: z.enum(['upsert', 'replace']).default('upsert'),
  dryRun: z.boolean().default(false),
  items: z.array(z.record(z.string(), z.unknown())).max(1000),
});

export const refurbishedRoutes = Router();

refurbishedRoutes.post(
  '/admin/refurbished/import',
  requireImportCaller,
  async (req, res) => {
    const body = importBody.parse(req.body);
    const result = await importRefurbished(
      { ...body, items: body.items as unknown as RefurbishedImportRow[] },
      res.locals.importCaller!,
    );
    res.json(result);
  },
);

refurbishedRoutes.delete(
  '/admin/refurbished/:storeId/:sku',
  requireImportCaller,
  async (req, res) => {
    await withdrawRefurbished(
      req.params.storeId as string,
      req.params.sku as string,
      res.locals.importCaller!,
    );
    res.status(204).end();
  },
);
