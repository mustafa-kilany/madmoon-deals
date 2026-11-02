// streetFromGoogle: "street, neighbourhood" from Google's reverse-geocoding results.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { streetFromGoogle } from './geocoder';

const component = (long_name: string, ...types: string[]) => ({ long_name, types: [...types, 'political'] });

test('the first named road and the first neighbourhood, joined in the buyer’s language', () => {
  const results = [
    { address_components: [component('12', 'street_number'), component('شارع مكة', 'route'), component('عمان', 'locality')] },
    { address_components: [component('تلاع العلي', 'neighborhood'), component('عمان', 'locality')] },
  ];
  assert.equal(streetFromGoogle(results, 'ar'), 'شارع مكة، تلاع العلي');
  const en = [{ address_components: [component('Mecca St', 'route'), component("Tla' Al-Ali", 'sublocality_level_1', 'sublocality')] }];
  assert.equal(streetFromGoogle(en, 'en'), "Mecca St, Tla' Al-Ali");
});

test('unnamed roads are skipped; only what exists is returned', () => {
  const results = [
    { address_components: [component('Unnamed Road', 'route')] },
    { address_components: [component('Al-Jubeiha', 'neighborhood')] },
  ];
  assert.equal(streetFromGoogle(results, 'en'), 'Al-Jubeiha');
  assert.equal(streetFromGoogle([{ address_components: [component('طريق بدون اسم', 'route')] }], 'ar'), '');
  assert.equal(streetFromGoogle([], 'ar'), '');
});

test('the same name as road and neighbourhood appears once', () => {
  const results = [{ address_components: [component('Rainbow St', 'route'), component('Rainbow St', 'neighborhood')] }];
  assert.equal(streetFromGoogle(results, 'en'), 'Rainbow St');
});
