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
    const r = await fetch(url, { headers: { 'User-Agent': 'Madmoon Deals marketplace (https://sahla.jo)' }, signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error(`Nominatim answered ${r.status}`);
    const address = ((await r.json()) as { address?: NominatimAddress }).address ?? {};
    const parts = [address.road, address.neighbourhood ?? address.quarter ?? address.suburb ?? address.city_district];
    return parts.filter(Boolean).join(lang === 'ar' ? '، ' : ', ');
  },
};

type GoogleComponent = { long_name: string; types: string[] };
type GoogleResult = { address_components?: GoogleComponent[] };

// Google's placeholder for a road with no name, in either language.
const UNNAMED = /^(unnamed road|طريق بدون اسم|طريق غير مسمى)$/i;

/**
 * "street, neighbourhood" from Google's reverse-geocoding results (best match
 * first): the first named road, and the first neighbourhood / sub-locality.
 */
export function streetFromGoogle(results: GoogleResult[], lang: Lang): string {
  // Google puts invisible direction marks (U+200E, U+200F, …) inside some Arabic names.
  const clean = (name: string) => name.replace(/[‎‏‪-‮⁦-⁩]/g, '').trim();
  const components = results.flatMap(result => result.address_components ?? []);
  const named = (types: string[]) =>
    components
      .filter(c => types.some(t => c.types.includes(t)))
      .map(c => clean(c.long_name))
      .find(name => name && !UNNAMED.test(name));
  const parts = [named(['route']), named(['neighborhood', 'sublocality_level_1', 'sublocality'])];
  return [...new Set(parts.filter(Boolean))].join(lang === 'ar' ? '، ' : ', ');
}

/**
 * Google Geocoding API (GEOCODER=google, GOOGLE_MAPS_API_KEY): paid per lookup
 * after the free monthly allowance; best street names in Jordan, in Arabic and
 * English. The key stays on the server and never appears in logs.
 */
const google: Geocoder = {
  async street({ lat, lng }, lang) {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.search = new URLSearchParams({
      latlng: `${lat},${lng}`,
      language: lang,
      result_type: 'street_address|route|neighborhood|sublocality',
      key: env.GOOGLE_MAPS_API_KEY!,
    }).toString();
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error(`Google Geocoding answered ${r.status}`);
    const body = (await r.json()) as { status: string; results?: GoogleResult[] };
    if (body.status === 'ZERO_RESULTS') return '';
    // REQUEST_DENIED (key / API not enabled / billing), OVER_QUERY_LIMIT, …: only the status, never the URL.
    if (body.status !== 'OK') throw new Error(`Google Geocoding status ${body.status}`);
    return streetFromGoogle(body.results ?? [], lang);
  },
};

/** The geocoder in use, or null (GEOCODER=off): the app then fills only the area. */
export function geocoder(): Geocoder | null {
  switch (env.GEOCODER) {
    case 'fake':
      return fakeGeocoder;
    case 'nominatim':
      return nominatim;
    case 'google':
      return google;
    default:
      return null;
  }
}

/** Roughly Jordan: anywhere else there's no area to deliver to, so no lookup is made. */
export const inJordan = ({ lat, lng }: Position) => lat >= 29 && lat <= 33.5 && lng >= 34.8 && lng <= 39.5;
