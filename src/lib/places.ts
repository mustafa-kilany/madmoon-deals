// Place helpers: the "Governorate / Area" label, and distance maths used to
// turn a GPS fix into the nearest area on the phone (no coordinates leave it).

import type { City, Localized, Place } from './types';

/**
 * "البلقاء / السلط". Just the name when it is the governorate's own city
 * ("إربد", "العقبة"), or when the place has no governorate.
 */
export function placeLabel(
  place: Place,
  localized: (text: Localized) => string,
): string {
  const name = localized(place.name);
  if (!place.governorate) return name;
  const governorate = localized(place.governorate);
  return governorate === name ? name : `${governorate} / ${name}`;
}

const EARTH_RADIUS_KM = 6371;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in km (haversine). */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** The area closest to a position. */
export function nearestCity(
  cities: City[],
  position: { lat: number; lng: number },
): City | undefined {
  let best: City | undefined;
  let bestKm = Infinity;
  for (const city of cities) {
    const km = distanceKm(city, position);
    if (km < bestKm) {
      best = city;
      bestKm = km;
    }
  }
  return best;
}

/** Areas within `radiusKm` of a position, nearest first ("Near me" filter). */
export function citiesWithin(
  cities: City[],
  position: { lat: number; lng: number },
  radiusKm: number,
): City[] {
  return cities
    .map(city => ({ city, km: distanceKm(city, position) }))
    .filter(x => x.km <= radiusKm)
    .sort((a, b) => a.km - b.km)
    .map(x => x.city);
}

/** Case-insensitive match on area or governorate, either language. */
export const matchesPlace = (city: City, query: string): boolean => {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return true;
  return [city.name.ar, city.name.en, city.governorate.ar, city.governorate.en]
    .join(' ')
    .toLocaleLowerCase()
    .includes(q);
};
