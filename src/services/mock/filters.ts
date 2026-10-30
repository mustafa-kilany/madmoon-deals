// Categories (GET /categories) and the item types per category (GET
// /categories/filters): brands, models, and which types need a shop test
// certificate. Kept apart from catalog.ts (which bundles images) so the
// backend can load it in Node too.

import type {
  Category,
  CategoryFilters,
  CategoryId,
  ItemType,
} from '@/lib/types';
import { brandsByType } from './brands';

/** The 8 root categories (GET /categories), without their bundled images. */
export const categoryInfo: Omit<Category, 'image'>[] = [
  {
    id: 'mobiles',
    name: { ar: 'موبايلات وتابلت', en: 'Mobiles & Tablets' },
    icon: 'Smartphone',
  },
  {
    id: 'electronics',
    name: { ar: 'إلكترونيات', en: 'Electronics' },
    icon: 'Laptop',
  },
  {
    id: 'vehicles',
    name: { ar: 'سيارات ومركبات', en: 'Cars & Vehicles' },
    icon: 'Car',
  },
  {
    id: 'furniture',
    name: { ar: 'أثاث ومنزل', en: 'Home & Furniture' },
    icon: 'Sofa',
  },
  {
    id: 'appliances',
    name: { ar: 'أجهزة منزلية', en: 'Home Appliances' },
    icon: 'Refrigerator',
  },
  { id: 'fashion', name: { ar: 'أزياء', en: 'Fashion' }, icon: 'Shirt' },
  {
    id: 'kids',
    name: { ar: 'أطفال ومواليد', en: 'Kids & Baby' },
    icon: 'Baby',
  },
  {
    id: 'hobbies',
    name: { ar: 'رياضة وهوايات', en: 'Sports & Hobbies' },
    icon: 'Dumbbell',
  },
];

const itemType = (id: string, ar: string, en: string): ItemType => ({
  id,
  name: { ar, en },
});

/** Electronics a shop can test: listing one needs a test certificate. */
const testedTypes: Partial<Record<CategoryId, string[]>> = {
  mobiles: ['phones', 'tablets', 'smartwatches'],
  electronics: ['laptops', 'gaming', 'tvs', 'cameras', 'audio'],
};

/**
 * Each type with its brands / models from brands.ts, and the category's
 * brands: every type's, de-duplicated.
 */
const withBrands = (category: CategoryId, plain: ItemType[]) => {
  const types = plain.map(type => ({
    ...type,
    ...brandsByType[category][type.id],
    ...(testedTypes[category]?.includes(type.id) && {
      requiresTestCertificate: true,
    }),
  }));
  return {
    types,
    brands: [...new Set(types.flatMap(type => type.brands ?? []))],
  };
};

const filters: Record<CategoryId, ItemType[]> = {
  mobiles: [
    itemType('phones', 'هواتف', 'Phones'),
    itemType('tablets', 'أجهزة لوحية', 'Tablets'),
    itemType('smartwatches', 'ساعات ذكية', 'Smartwatches'),
    itemType('accessories', 'إكسسوارات', 'Accessories'),
  ],
  electronics: [
    itemType('laptops', 'لابتوبات', 'Laptops'),
    itemType('gaming', 'ألعاب فيديو', 'Gaming'),
    itemType('tvs', 'شاشات وتلفزيونات', 'TVs & Screens'),
    itemType('cameras', 'كاميرات', 'Cameras'),
    itemType('audio', 'سماعات وصوتيات', 'Audio'),
  ],
  vehicles: [
    itemType('cars', 'سيارات', 'Cars'),
    itemType('motorcycles', 'دراجات نارية', 'Motorcycles'),
    itemType('parts', 'قطع غيار', 'Parts & Accessories'),
    itemType('scooters', 'سكوترات', 'Scooters'),
  ],
  furniture: [
    itemType('sofas', 'كنب', 'Sofas'),
    itemType('tables', 'طاولات', 'Tables'),
    itemType('chairs', 'كراسي', 'Chairs'),
    itemType('storage', 'خزائن', 'Storage'),
    itemType('beds', 'أسِرّة', 'Beds'),
  ],
  appliances: [
    itemType('fridges', 'ثلاجات', 'Fridges'),
    itemType('washing-machines', 'غسالات', 'Washing Machines'),
    itemType('kitchen', 'أجهزة مطبخ', 'Kitchen'),
    itemType('air-conditioners', 'مكيفات', 'Air Conditioners'),
    itemType('small-appliances', 'أجهزة صغيرة', 'Small Appliances'),
  ],
  fashion: [
    itemType('men', 'رجالي', "Men's Clothing"),
    itemType('women', 'نسائي', "Women's Clothing"),
    itemType('shoes', 'أحذية', 'Shoes'),
    itemType('bags', 'حقائب', 'Bags'),
    itemType('watches-jewelry', 'ساعات ومجوهرات', 'Watches & Jewelry'),
  ],
  kids: [
    itemType('toys', 'ألعاب أطفال', 'Toys'),
    itemType('strollers', 'عربات أطفال', 'Strollers'),
    itemType('car-seats', 'كراسي سيارة', 'Car Seats'),
    itemType('kids-clothing', 'ملابس أطفال', 'Kids Clothing'),
  ],
  hobbies: [
    itemType('bicycles', 'دراجات هوائية', 'Bicycles'),
    itemType('fitness', 'معدات رياضية', 'Fitness'),
    itemType('instruments', 'آلات موسيقية', 'Instruments'),
    itemType('books', 'كتب', 'Books'),
    itemType('camping', 'تخييم ورحلات', 'Camping'),
  ],
};

export const categoryFilters = Object.fromEntries(
  Object.entries(filters).map(([id, types]) => [
    id,
    withBrands(id as CategoryId, types),
  ]),
) as Record<CategoryId, CategoryFilters>;
