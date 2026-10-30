// Development data: the app's mock catalog (src/services/mock) as real rows,
// so every browsing screen shows the same listings as in mock mode, with the
// same ids. Run by `npm run db:seed`; running it again resets them (auction end
// times move to "now + the demo minutes").

import { createRequire } from 'node:module';
import path from 'node:path';
import type { Item } from '@/lib/types';
import { prisma } from '../src/db';
import { hashPassword } from '../src/modules/auth/password';

// The mock bundles its certificate photos with require('….jpg'), which only the
// app's bundler understands. Here each photo is just its file name.
const require = createRequire(import.meta.url);
require.extensions['.jpg'] = (module: NodeJS.Module, filename: string) => {
  module.exports = filename;
};
const { buildItems } = await import('@/services/mock/catalog');
const { buildRefurbishedItems } = await import('@/services/mock/refurbished');

/** Files from assets/images/certificates, served at /static/certificates (development). */
const certificateUrl = (image: unknown) =>
  `/static/certificates/${path.basename(String(image))}`;

const listingFields = (item: Item) => ({
  category: item.category,
  type: item.type,
  titleAr: item.title.ar,
  titleEn: item.title.en,
  priceFils: item.priceFils,
  imageUrls: item.imageUrls ?? [item.imageUrl],
  condition: item.condition,
  description: item.description,
  status: item.status,
  brand: item.brand ?? null,
  model: item.model ?? null,
  locationId: item.location.id,
  saleType: item.saleType,
  auctionEndsAt: item.auction ? new Date(item.auction.endsAt) : null,
  incrementFils: item.auction?.incrementFils ?? null,
  bidCount: item.auction?.bidCount ?? 0,
  views: item.views,
});

export async function seedListings() {
  const now = Date.now();
  const items = buildItems(now);
  const refurbished = buildRefurbishedItems(now);

  // Demo sellers: one account per mock seller; verified when most of their listings say so.
  const passwordHash = await hashPassword('sahla1234');
  const sellers = new Map<string, { name: string; verified: number; total: number }>();
  for (const item of items) {
    const seller = sellers.get(item.sellerId) ?? { name: item.seller.en, verified: 0, total: 0 };
    seller.total++;
    if (item.verified) seller.verified++;
    sellers.set(item.sellerId, seller);
  }
  for (const [id, seller] of sellers) {
    const data = { name: seller.name, verified: seller.verified * 2 >= seller.total };
    await prisma.user.upsert({
      where: { id },
      update: data,
      create: {
        id,
        ...data,
        email: `${id.replace(/^user-/, '')}@demo.sahla.jo`,
        passwordHash,
        method: 'email',
      },
    });
  }

  for (const item of items) {
    const fields = { ...listingFields(item), sellerUserId: item.sellerId };
    const listing = await prisma.listing.upsert({
      where: { id: item.id },
      update: fields,
      create: { id: item.id, ...fields },
    });
    const cert = item.testCertificate;
    if (cert && !listing.testCertificateId) {
      const photoUrl = certificateUrl(cert.image);
      const certificate = await prisma.testCertificate.create({
        data: {
          userId: item.sellerId,
          status: 'passed',
          problems: [],
          category: item.category,
          type: item.type,
          brand: item.brand ?? '',
          model: item.model,
          shopName: cert.shopName,
          testedAt: new Date(cert.testedAt),
          specs: cert.specs,
          photoUrl,
          blurredUrl: photoUrl,
          ocrProvider: 'seed',
          ocrText: '',
          stampChecked: true,
        },
      });
      await prisma.listing.update({
        where: { id: item.id },
        data: { testCertificateId: certificate.id },
      });
    }
  }

  for (const item of refurbished) {
    await prisma.store.upsert({
      where: { id: item.sellerId },
      update: {},
      create: { id: item.sellerId, nameEn: item.seller.en, nameAr: item.seller.ar },
    });
    const fields = {
      ...listingFields(item),
      storeId: item.sellerId,
      sku: item.id.replace(`refurb-${item.sellerId}-`, ''),
      warrantyMonths: item.refurbished!.warrantyMonths,
    };
    await prisma.listing.upsert({
      where: { id: item.id },
      update: fields,
      create: { id: item.id, ...fields },
    });
  }

  console.log(
    `${items.length} listings from ${sellers.size} demo sellers, ` +
      `${refurbished.length} refurbished listings from ${new Set(refurbished.map(i => i.sellerId)).size} stores`,
  );
}
