// Delivery address from the buyer's location: one precise GPS fix → the
// nearest area (on the phone) and the street (GET /geocode/reverse). The
// checkout fills both in; the buyer checks them and edits what's wrong.

import { useMutation } from '@tanstack/react-query';
import { useCities } from '@/features/catalog/hooks/useCatalog';
import {
  locate,
  STREET_ACCURACY_M,
  type Fix,
} from '@/features/location/useLocate';
import { useLang } from '@/i18n';
import { distanceKm, nearestCity } from '@/lib/places';
import type { City, Position } from '@/lib/types';
import { catalogService } from '@/services/catalog';

/** Further than this from every area centre = not in Jordan. */
const MAX_AREA_KM = 60;

/** cityId missing = outside Jordan; address '' = only the area is known. */
export type FoundAddress = { cityId?: string; address: string };

export async function addressAt(
  fix: Fix,
  cities: City[],
  lookUpStreet: (position: Position) => Promise<string>,
): Promise<FoundAddress> {
  const area = nearestCity(cities, fix);
  if (!area || distanceKm(area, fix) > MAX_AREA_KM) return { address: '' };
  // A rough fix ("approximate" location) only tells the area. Without the
  // street the buyer still gets the area, so a failed lookup is fine.
  const address =
    fix.accuracy <= STREET_ACCURACY_M
      ? await lookUpStreet(fix).catch(() => '')
      : '';
  return { cityId: area.id, address };
}

export function useDeliveryLocation() {
  const lang = useLang();
  const { data: cities = [] } = useCities();
  return useMutation({
    mutationFn: async () =>
      addressAt(await locate({ precise: true }), cities, position =>
        catalogService.reverseGeocode(position, lang),
      ),
  });
}
