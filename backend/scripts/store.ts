// Set up a brand's Certified Refurbished store and its API keys.
//
//   npm run store -- create store-apple "Apple Certified" "Apple المعتمد"
//   npm run store -- key store-apple "Apple stock system"   (prints the key once)
//   npm run store -- revoke <keyId>
//   npm run store -- list
//   npm run store -- import store-apple stock.csv [--dry-run] [--replace]
//     (the Excel template saved as "CSV UTF-8"; until the admin dashboard exists)

import { readFileSync } from 'node:fs';
import { prisma } from '../src/db';
import { parseImportCsv } from '../src/modules/refurbished/csv';
import { importRefurbished } from '../src/modules/refurbished/service';
import { hashKey, newStoreKey } from '../src/modules/refurbished/storeKeys';

const [command, ...args] = process.argv.slice(2);

async function main() {
  switch (command) {
    case 'create': {
      const [id, nameEn, nameAr] = args;
      if (!/^store-[a-z0-9-]+$/.test(id ?? '') || !nameEn || !nameAr)
        throw new Error('Usage: create store-<brand> "<English name>" "<Arabic name>"');
      const store = await prisma.store.create({ data: { id, nameEn, nameAr } });
      console.log('Created', store);
      break;
    }
    case 'key': {
      const [storeId, label] = args;
      if (!storeId || !label) throw new Error('Usage: key <storeId> "<label>"');
      const key = newStoreKey();
      const row = await prisma.storeApiKey.create({
        data: { storeId, label, keyHash: hashKey(key) },
      });
      console.log(`Key ${row.id} for ${storeId} (${label}). Copy it now, it is not shown again:\n\n  ${key}\n`);
      break;
    }
    case 'revoke': {
      const [keyId] = args;
      await prisma.storeApiKey.update({
        where: { id: keyId },
        data: { revokedAt: new Date() },
      });
      console.log('Revoked', keyId);
      break;
    }
    case 'list': {
      const stores = await prisma.store.findMany({
        include: {
          apiKeys: { select: { id: true, label: true, lastUsedAt: true, revokedAt: true } },
          _count: { select: { listings: { where: { status: 'active' } } } },
        },
      });
      console.dir(stores, { depth: 4 });
      break;
    }
    case 'import': {
      const [storeId, file] = args.filter(arg => !arg.startsWith('--'));
      if (!storeId || !file)
        throw new Error('Usage: import <storeId> <file.csv> [--dry-run] [--replace]');
      const result = await importRefurbished(
        {
          storeId,
          mode: args.includes('--replace') ? 'replace' : 'upsert',
          dryRun: args.includes('--dry-run'),
          items: parseImportCsv(readFileSync(file, 'utf8')),
        },
        { storeId, source: 'admin:cli' },
      );
      // Excel row = item row + 1 (the header)
      for (const e of result.errors)
        console.log(`Excel row ${e.row + 1} (${e.sku ?? 'no sku'}) ${e.field}: ${e.message}`);
      const { errors, ...counts } = result;
      console.log({ ...counts, skippedRows: new Set(errors.map(e => e.row)).size });
      break;
    }
    default:
      throw new Error('Commands: create, key, revoke, list, import');
  }
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
