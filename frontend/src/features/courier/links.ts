// Links the courier taps: call a phone, or find an address in the maps app.

import type { DeliveryDetails } from '@/lib/types';

/** tel: link, or null when there's no number yet (seller hasn't given the pickup). */
export const callUrl = (phone: string) =>
  phone.trim() ? `tel:${phone.replace(/[^\d+]/g, '')}` : null;

/**
 * A maps search for the address in its area. Google's universal link opens
 * the Google Maps app on Android and iPhone (or the browser without it).
 */
export const mapsUrl = (stop: DeliveryDetails, areaName: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    [stop.address.trim(), areaName, 'Jordan'].filter(Boolean).join(', '),
  )}`;
