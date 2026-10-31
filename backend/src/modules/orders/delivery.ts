import { ADDRESS_MAX, ADDRESS_MIN, NOTES_MAX, normalizeJordanMobile } from '@/lib/delivery';
import { z } from 'zod';
import { cityIds } from '../../reference';

// docs/API.md → DeliveryDetails. The same limits as the app's checkout form
// (frontend/src/lib/delivery.ts), so the form and the server never disagree.

export const deliveryDetails = z.object({
  name: z.string().trim().min(2).max(60),
  // Sent as typed ("+962 79 123 4567"); stored as 0791234567.
  phone: z
    .string()
    .max(30)
    .transform((value, ctx) => {
      const phone = normalizeJordanMobile(value);
      if (!phone) ctx.addIssue({ code: 'custom', message: 'a Jordanian mobile number (077, 078, 079)' });
      return phone ?? '';
    }),
  cityId: z.string().refine(id => cityIds.has(id), 'an area id from GET /cities'),
  address: z.string().trim().min(ADDRESS_MIN).max(ADDRESS_MAX),
  notes: z
    .string()
    .trim()
    .max(NOTES_MAX)
    .optional()
    .transform(value => value || undefined),
});

export type DeliveryInput = z.infer<typeof deliveryDetails>;

/** DeliveryDetails → the order's delivery* columns. */
export const deliveryColumns = (d: DeliveryInput) => ({
  deliveryName: d.name,
  deliveryPhone: d.phone,
  deliveryCityId: d.cityId,
  deliveryAddress: d.address,
  deliveryNotes: d.notes ?? null,
});
