import {
  citiesWithin,
  distanceKm,
  matchesPlace,
  nearestCity,
  placeLabel,
} from '@/lib/places';
import { buildItems } from '@/services/mock/catalog';
import { cities } from '@/services/mock/places';

const find = (id: string) => cities.find(c => c.id === id)!;
const en = (text: { en: string }) => text.en;
const ar = (text: { ar: string }) => text.ar;

describe('Jordan places', () => {
  test('all 12 governorates, unique ids', () => {
    expect(new Set(cities.map(c => c.governorate.en)).size).toBe(12);
    expect(new Set(cities.map(c => c.id)).size).toBe(cities.length);
  });

  test('label is "Governorate / Area", or just the city when it is the capital', () => {
    expect(placeLabel(find('salt'), ar)).toBe('البلقاء / السلط');
    expect(placeLabel(find('amman-khalda'), en)).toBe('Amman / Khalda');
    expect(placeLabel(find('irbid'), ar)).toBe('إربد');
  });

  test('GPS position → nearest area', () => {
    // Just outside Salt's centre
    expect(nearestCity(cities, { lat: 32.045, lng: 35.73 })?.id).toBe('salt');
    // Aqaba port
    expect(nearestCity(cities, { lat: 29.52, lng: 35.0 })?.id).toBe('aqaba');
  });

  test('"Near me" radius picks close areas only, nearest first', () => {
    const khalda = find('amman-khalda');
    const near = citiesWithin(cities, khalda, 15).map(c => c.id);
    expect(near[0]).toBe('amman-khalda');
    expect(near).toContain('salt'); // ~11 km away
    expect(near).not.toContain('irbid');
    expect(distanceKm(find('amman'), find('aqaba'))).toBeGreaterThan(250);
  });

  test('search matches area or governorate in either language', () => {
    expect(matchesPlace(find('salt'), 'balqa')).toBe(true);
    expect(matchesPlace(find('salt'), 'السلط')).toBe(true);
    expect(matchesPlace(find('salt'), 'irbid')).toBe(false);
  });

  test('listings carry their governorate but never coordinates', () => {
    for (const item of buildItems(0)) {
      expect(item.location.governorate).toBeDefined();
      expect(item.location).not.toHaveProperty('lat');
    }
  });
});
