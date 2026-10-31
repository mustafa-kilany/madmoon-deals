import { nearestCity } from '@/lib/places';
import { env } from '../../env';
import { cities } from '../../reference';

// GET /geocode/reverse (BACKEND_PLAN B7.1, decision D6): the street at the
// buyer's GPS fix, to fill the checkout address. The app already knows the
// area; this adds "street, neighbourhood". Coordinates are never stored or logged.

export type Lang = 'ar' | 'en';
export type Position = { lat: number; lng: number };

export interface Geocoder {
  /** "شارع مكة، تلاع العلي" / "Mecca St, Tla' Al-Ali", or "" when there's no street. */
  street(position: Position, lang: Lang): Promise<string>;
}

/** Development and tests (GEOCODER=fake): the nearest area's main street, like the app's mock. */
const fakeGeocoder: Geocoder = {
  async street(position, lang) {
    const area = nearestCity(cities, position);
    if (!area) return '';
    return lang === 'ar' ? `الشارع الرئيسي، ${area.name.ar}` : `Main Street, ${area.name.en}`;
  },
};

type NominatimAddress = Partial<Record<'road' | 'neighbourhood' | 'quarter' | 'suburb' | 'city_district', string>>;

/**
 * OpenStreetMap's Nominatim (GEOCODER=nominatim): free, no key. The public server
 * allows about 1 request a second and asks for an identifying User-Agent: fine for
 * trying it out; for launch, self-host it (NOMINATIM_URL) or pick a paid service (D6).
 */
const nominatim: Geocoder = {
  async street({ lat, lng }, lang) {
    const url = new URL('/reverse', env.NOMINATIM_URL);
    url.search = new URLSearchParams({ format: 'jsonv2', lat: String(lat), lon: String(lng), zoom: '17', 'accept-language': lang }).toString();
    const r = await fetch(url, { headers: { 'User-Agent': 'Sahla marketplace (https://sahla.jo)' }, signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error(`Nominatim answered ${r.status}`);
    const address = ((await r.json()) as { address?: NominatimAddress }).address ?? {};
    const parts = [address.road, address.neighbourhood ?? address.quarter ?? address.suburb ?? address.city_district];
    return parts.filter(Boolean).join(lang === 'ar' ? '، ' : ', ');
  },
};

/** The geocoder in use, or null (GEOCODER=off): the app then fills only the area. */
export function geocoder(): Geocoder | null {
  return env.GEOCODER === 'fake' ? fakeGeocoder : env.GEOCODER === 'nominatim' ? nominatim : null;
}

/** Roughly Jordan: anywhere else there's no area to deliver to, so no lookup is made. */
export const inJordan = ({ lat, lng }: Position) => lat >= 29 && lat <= 33.5 && lng >= 34.8 && lng <= 39.5;
