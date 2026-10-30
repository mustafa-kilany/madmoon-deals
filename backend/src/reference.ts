// Reference data shared with the app, so the server and the app never disagree
// on which categories, item types, brands and areas exist.
// Only image-free files are imported here: Node can't load the app's bundled images.

import { fileURLToPath } from 'node:url';
import { categoryFilters, categoryInfo } from '@/services/mock/filters';
import { cities } from '@/services/mock/places';

export { categoryFilters, categoryInfo, cities };

export const cityIds = new Set(cities.map(city => city.id));
export const cityById = new Map(cities.map(city => [city.id, city]));

/** The item type, or undefined when the category or type doesn't exist. */
export const findType = (category: string, type: string) =>
  categoryFilters[category as keyof typeof categoryFilters]?.types.find(
    t => t.id === type,
  );

/** The app's category tiles (assets/images/categories/<id>.jpg), served at /static/categories. */
export const categoryImageDir = fileURLToPath(
  new URL('../../assets/images/categories', import.meta.url),
);
