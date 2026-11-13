import { DESCRIPTION_MAX, descriptionValid } from '@/lib/listing';
import { z } from 'zod';
import { categoryInfo, cityIds, findType } from '../../reference';
import { pickupDetails } from '../orders/delivery';

// docs/API.md → Phase 4: Selling. The description rule is the app's own
// (frontend/src/lib/listing.ts), so the Sell form and the server never disagree.

const HOUR_MS = 3_600_000;
export const AUCTION_MIN_MS = HOUR_MS;
export const AUCTION_MAX_MS = 14 * 24 * HOUR_MS; // the app offers 1, 3 or 7 days
const MAX_PRICE_FILS = 1_000_000_000; // 1 000 000 JOD

/** Sellers' grades; refurbished_* come only from the brands' import. */
export const sellerCondition = z.enum(['new', 'excellent', 'good', 'loved'], {
  error: 'condition: new, excellent, good or loved (refurbished grades come from brand stores only)',
});

const price = z.number().int().positive().max(MAX_PRICE_FILS);
const name = z.string().trim().max(60).optional().transform(value => value || undefined);
const title = z.string().trim().min(2).max(100);

export const newListing = z
  .object({
    category: z.enum(categoryInfo.map(c => c.id) as [string, ...string[]]),
    type: z.string(),
    titleAr: title,
    titleEn: title,
    priceFils: price,
    imageUrls: z.array(z.string().url()).min(1).max(5),
    condition: sellerCondition,
    description: z
      .string()
      .trim()
      .refine(descriptionValid, `description: at least 10 words, at most ${DESCRIPTION_MAX} characters`),
    brand: name,
    model: name,
    locationId: z.string().refine(id => cityIds.has(id), 'locationId: an area id from GET /cities'),
    saleType: z.enum(['fixed', 'auction']),
    auctionEndsAt: z.iso.datetime({ offset: true }).optional(),
    incrementFils: z.number().int().min(100).max(MAX_PRICE_FILS).optional(),
    testCertificateId: z.string().optional(),
    // Where the courier collects it (B14.5): never shown to buyers.
    pickup: pickupDetails,
  })
  .superRefine((input, ctx) => {
    const type = findType(input.category, input.type);
    if (!type) ctx.addIssue({ code: 'custom', path: ['type'], message: `no type ${input.type} in ${input.category}` });
    if (input.saleType !== 'auction') return;
    const endsIn = input.auctionEndsAt ? Date.parse(input.auctionEndsAt) - Date.now() : NaN;
    if (!(endsIn >= AUCTION_MIN_MS && endsIn <= AUCTION_MAX_MS))
      ctx.addIssue({ code: 'custom', path: ['auctionEndsAt'], message: 'an auction ends 1 hour to 14 days from now' });
  });

export type NewListing = z.infer<typeof newListing>;

const description = z
  .string()
  .trim()
  .refine(descriptionValid, `description: at least 10 words, at most ${DESCRIPTION_MAX} characters`);

/**
 * B15.2: what a seller can change while the listing is on sale. Not the category,
 * type, brand or model (search facets, and a test certificate is for one device),
 * nor the sale type.
 */
export const listingPatch = z
  .object({
    titleAr: title.optional(),
    titleEn: title.optional(),
    description: description.optional(),
    // The new list, in order: photos already on the listing and/or new uploads.
    imageUrls: z.array(z.string().url()).min(1).max(5).optional(),
    priceFils: price.optional(),
    condition: sellerCondition.optional(),
    pickup: pickupDetails.optional(),
  })
  .strict()
  .refine(patch => Object.values(patch).some(v => v !== undefined), 'nothing to change');

export type ListingPatch = z.infer<typeof listingPatch>;
