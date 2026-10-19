// Seed catalog ported from the prototype's data/catalog.ts: 8 categories, 4
// fixed-price listings each, plus one demo auction per category (id
// `auction-<category>`, built from one of that category's listings). Listing
// photos stay remote, like real listing images will; category tiles are bundled.

import { jod } from '@/lib/money';
import type {
  Category,
  CategoryFilters,
  CategoryId,
  Condition,
  Item,
  Localized,
  Place,
} from '@/lib/types';

const unsplash = (photo: string) =>
  `https://images.unsplash.com/${photo}?w=400&h=400&fit=crop`;

export const categories: Category[] = [
  {
    id: 'clothing',
    name: { ar: 'ملابس', en: 'Clothing' },
    icon: 'Shirt',
    image: require('../../../assets/images/categories/clothing.jpg'),
  },
  {
    id: 'tech',
    name: { ar: 'تكنولوجيا', en: 'Tech' },
    icon: 'Laptop',
    image: require('../../../assets/images/categories/tech.jpg'),
  },
  {
    id: 'vehicles',
    name: { ar: 'مركبات', en: 'Vehicles' },
    icon: 'Car',
    image: require('../../../assets/images/categories/vehicles.jpg'),
  },
  {
    id: 'furniture',
    name: { ar: 'أثاث', en: 'Furniture' },
    icon: 'Sofa',
    image: require('../../../assets/images/categories/furniture.jpg'),
  },
  {
    id: 'shoes',
    name: { ar: 'أحذية', en: 'Shoes' },
    icon: 'Sneaker',
    image: require('../../../assets/images/categories/shoes.jpg'),
  },
  {
    id: 'gaming',
    name: { ar: 'ألعاب', en: 'Gaming' },
    icon: 'Gamepad',
    image: require('../../../assets/images/categories/gaming.jpg'),
  },
  {
    id: 'watches',
    name: { ar: 'ساعات', en: 'Watches' },
    icon: 'Watch',
    image: require('../../../assets/images/categories/watches.jpg'),
  },
  {
    id: 'more',
    name: { ar: 'المزيد', en: 'More' },
    icon: 'Grid',
    image: require('../../../assets/images/categories/more.jpg'),
  },
];

const itemType = (id: string, ar: string, en: string) => ({
  id,
  name: { ar, en },
});

export const categoryFilters: Record<CategoryId, CategoryFilters> = {
  clothing: {
    types: [
      itemType('jackets', 'جاكيتات', 'Jackets'),
      itemType('shirts', 'قمصان', 'Shirts'),
      itemType('dresses', 'فساتين', 'Dresses'),
      itemType('sweaters', 'كنزات', 'Sweaters'),
    ],
    brands: ['Zara', 'H&M', 'Mango', 'Uniqlo', 'Nike', 'Adidas'],
  },
  tech: {
    types: [
      itemType('phones', 'هواتف', 'Phones'),
      itemType('laptops', 'لابتوبات', 'Laptops'),
      itemType('headphones', 'سماعات', 'Headphones'),
      itemType('watches', 'ساعات', 'Watches'),
      itemType('tablets', 'أجهزة لوحية', 'Tablets'),
    ],
    brands: ['Apple', 'Samsung', 'Sony', 'Dell', 'HP', 'Xiaomi'],
  },
  vehicles: {
    types: [
      itemType('cars', 'سيارات', 'Cars'),
      itemType('motorcycles', 'دراجات نارية', 'Motorcycles'),
      itemType('bicycles', 'دراجات هوائية', 'Bicycles'),
      itemType('scooters', 'سكوترات', 'Scooters'),
    ],
    brands: ['Kia', 'Toyota', 'Honda', 'Hyundai', 'Trek', 'Xiaomi'],
  },
  furniture: {
    types: [
      itemType('sofas', 'كنب', 'Sofas'),
      itemType('tables', 'طاولات', 'Tables'),
      itemType('chairs', 'كراسي', 'Chairs'),
      itemType('storage', 'تخزين', 'Storage'),
      itemType('beds', 'أسِرّة', 'Beds'),
    ],
    brands: ['IKEA', 'Home Centre', 'Pan Emirates'],
  },
  shoes: {
    types: [
      itemType('sneakers', 'رياضية', 'Sneakers'),
      itemType('formal', 'رسمية', 'Formal'),
      itemType('sandals', 'صنادل', 'Sandals'),
      itemType('boots', 'جزم', 'Boots'),
    ],
    brands: ['Nike', 'Adidas', 'Puma', 'Aldo'],
  },
  gaming: {
    types: [
      itemType('consoles', 'أجهزة', 'Consoles'),
      itemType('accessories', 'ملحقات', 'Accessories'),
      itemType('games', 'ألعاب', 'Games'),
      itemType('pcs', 'حواسيب', 'PCs'),
    ],
    brands: ['Sony', 'Microsoft', 'Nintendo', 'Cougar'],
  },
  watches: {
    types: [
      itemType('classic', 'كلاسيكية', 'Classic'),
      itemType('sports', 'رياضية', 'Sports'),
      itemType('luxury', 'فاخرة', 'Luxury'),
      itemType('smart', 'ذكية', 'Smart'),
    ],
    brands: ['Fossil', 'Casio', 'Rolex', 'Apple', 'Garmin'],
  },
  more: {
    types: [
      itemType('cameras', 'كاميرات', 'Cameras'),
      itemType('instruments', 'آلات موسيقية', 'Instruments'),
      itemType('books', 'كتب', 'Books'),
      itemType('home-garden', 'منزل وحديقة', 'Home & Garden'),
    ],
    brands: ['Canon', 'Nikon', 'Yamaha'],
  },
};

const sellers = {
  omar: { ar: 'عمر', en: 'Omar' },
  layla: { ar: 'ليلى', en: 'Layla' },
  sami: { ar: 'سامي', en: 'Sami' },
  rania: { ar: 'رانيا', en: 'Rania' },
  khaled: { ar: 'خالد', en: 'Khaled' },
  noor: { ar: 'نور', en: 'Noor' },
} satisfies Record<string, Localized>;

export const cities: Place[] = [
  { id: 'amman', name: { ar: 'عمّان', en: 'Amman' } },
  { id: 'irbid', name: { ar: 'إربد', en: 'Irbid' } },
  { id: 'zarqa', name: { ar: 'الزرقاء', en: 'Zarqa' } },
  { id: 'aqaba', name: { ar: 'العقبة', en: 'Aqaba' } },
];

type Seed = {
  title: Localized;
  price: number;
  photo: string;
  condition: Condition;
  seller: Localized;
  brand?: string;
  type: string;
};

const seed = (
  ar: string,
  en: string,
  price: number,
  photo: string,
  condition: Condition,
  seller: Localized,
  type: string,
  brand?: string,
): Seed => ({
  title: { ar, en },
  price,
  photo,
  condition,
  seller,
  type,
  brand,
});

const s = sellers;
const listings: Record<CategoryId, Seed[]> = {
  clothing: [
    seed(
      'جاكيت جلد كلاسيكي',
      'Classic Leather Jacket',
      45,
      'photo-1551028719-00167b16eac5',
      'excellent',
      s.omar,
      'jackets',
      'Zara',
    ),
    seed(
      'قميص قطني رجالي',
      "Men's Cotton Shirt",
      12,
      'photo-1596755094514-f87e34085b2c',
      'new',
      s.layla,
      'shirts',
      'H&M',
    ),
    seed(
      'فستان صيفي',
      'Summer Dress',
      28,
      'photo-1595777457583-95e059d581b8',
      'good',
      s.rania,
      'dresses',
      'Mango',
    ),
    seed(
      'بلوفر شتوي',
      'Winter Sweater',
      20,
      'photo-1576871337622-98d48d1cf531',
      'excellent',
      s.sami,
      'sweaters',
      'Uniqlo',
    ),
  ],
  tech: [
    seed(
      'آيفون 14 برو',
      'iPhone 14 Pro',
      520,
      'photo-1695048133142-1a20484d2569',
      'excellent',
      s.omar,
      'phones',
      'Apple',
    ),
    seed(
      'لابتوب ماك بوك',
      'MacBook Laptop',
      780,
      'photo-1517336714731-489689fd1ca8',
      'excellent',
      s.khaled,
      'laptops',
      'Apple',
    ),
    seed(
      'سماعات لاسلكية',
      'Wireless Headphones',
      60,
      'photo-1505740420928-5e560c06d30e',
      'new',
      s.noor,
      'headphones',
      'Sony',
    ),
    seed(
      'ساعة ذكية',
      'Smart Watch',
      95,
      'photo-1546868871-7041f2a55e12',
      'new',
      s.layla,
      'watches',
      'Samsung',
    ),
  ],
  vehicles: [
    seed(
      'كيا سيراتو 2019',
      'Kia Cerato 2019',
      9500,
      'photo-1502877338535-766e1452684a',
      'loved',
      s.sami,
      'cars',
      'Kia',
    ),
    seed(
      'دراجة نارية',
      'Motorcycle',
      2200,
      'photo-1558981403-c5f9899a28bc',
      'excellent',
      s.khaled,
      'motorcycles',
      'Honda',
    ),
    seed(
      'دراجة هوائية جبلية',
      'Mountain Bike',
      150,
      'photo-1485965120184-e220f721d03e',
      'good',
      s.noor,
      'bicycles',
      'Trek',
    ),
    seed(
      'سكوتر كهربائي',
      'Electric Scooter',
      180,
      'photo-1604868189265-219ba7bf7ea3',
      'new',
      s.rania,
      'scooters',
      'Xiaomi',
    ),
  ],
  furniture: [
    seed(
      'كنبة ثلاثة مقاعد',
      '3-Seater Sofa',
      210,
      'photo-1555041469-a586c61ea9bc',
      'good',
      s.layla,
      'sofas',
      'IKEA',
    ),
    seed(
      'طاولة طعام خشب',
      'Wooden Dining Table',
      160,
      'photo-1533090161767-e6ffed986c88',
      'excellent',
      s.omar,
      'tables',
      'IKEA',
    ),
    seed(
      'كرسي مكتب',
      'Office Chair',
      45,
      'photo-1580480055273-228ff5388ef8',
      'new',
      s.sami,
      'chairs',
      'Home Centre',
    ),
    seed(
      'خزانة ملابس',
      'Wardrobe',
      130,
      'photo-1595428774223-ef52624120d2',
      'loved',
      s.rania,
      'storage',
      'IKEA',
    ),
  ],
  shoes: [
    seed(
      'حذاء رياضي نايكي',
      'Nike Sneakers',
      55,
      'photo-1542291026-7eec264c27ff',
      'excellent',
      s.omar,
      'sneakers',
      'Nike',
    ),
    seed(
      'حذاء رسمي جلد',
      'Leather Dress Shoes',
      40,
      'photo-1614252369475-531eba835eb1',
      'new',
      s.khaled,
      'formal',
      'Aldo',
    ),
    seed(
      'صندل صيفي',
      'Summer Sandals',
      15,
      'photo-1603487742131-4160ec999306',
      'loved',
      s.noor,
      'sandals',
      'Adidas',
    ),
    seed(
      'حذاء أديداس',
      'Adidas Trainers',
      48,
      'photo-1600185365483-26d7a4cc7519',
      'excellent',
      s.sami,
      'sneakers',
      'Adidas',
    ),
  ],
  gaming: [
    seed(
      'بلايستيشن 5',
      'PlayStation 5',
      380,
      'photo-1606813907291-d86efa9b94db',
      'excellent',
      s.omar,
      'consoles',
      'Sony',
    ),
    seed(
      'يد تحكم اكس بوكس',
      'Xbox Controller',
      35,
      'photo-1592840496694-26d035b52b48',
      'new',
      s.layla,
      'accessories',
      'Microsoft',
    ),
    seed(
      'نينتندو سويتش',
      'Nintendo Switch',
      190,
      'photo-1578303512597-81e6cc155b3e',
      'good',
      s.khaled,
      'consoles',
      'Nintendo',
    ),
    seed(
      'كرسي ألعاب',
      'Gaming Chair',
      120,
      'photo-1598550476439-6847785fcea6',
      'new',
      s.rania,
      'accessories',
      'Cougar',
    ),
  ],
  watches: [
    seed(
      'ساعة كلاسيكية',
      'Classic Watch',
      75,
      'photo-1524592094714-0f0654e20314',
      'excellent',
      s.omar,
      'classic',
      'Fossil',
    ),
    seed(
      'ساعة رياضية',
      'Sports Watch',
      50,
      'photo-1508057198894-247b23fe5ade',
      'new',
      s.sami,
      'sports',
      'Casio',
    ),
    seed(
      'ساعة فاخرة',
      'Luxury Watch',
      320,
      'photo-1523170335258-f5ed11844a49',
      'excellent',
      s.khaled,
      'luxury',
      'Rolex',
    ),
    seed(
      'ساعة ذكية',
      'Smart Watch',
      110,
      'photo-1579586337278-3befd40fd17a',
      'new',
      s.noor,
      'smart',
      'Apple',
    ),
  ],
  more: [
    seed(
      'كاميرا رقمية',
      'Digital Camera',
      240,
      'photo-1516035069371-29a1b244cc32',
      'excellent',
      s.omar,
      'cameras',
      'Canon',
    ),
    seed(
      'جيتار أكوستيك',
      'Acoustic Guitar',
      90,
      'photo-1550985616-10810253b84d',
      'good',
      s.layla,
      'instruments',
      'Yamaha',
    ),
    seed(
      'مجموعة كتب',
      'Book Collection',
      25,
      'photo-1512820790803-83ca734da794',
      'good',
      s.rania,
      'books',
    ),
    seed(
      'نبتة زينة',
      'Decorative Plant',
      18,
      'photo-1485955900006-10f4d324d411',
      'new',
      s.noor,
      'home-garden',
    ),
  ],
};

/** Demo auction per category: which listing it copies, opening bid, time left. */
const auctions: Record<
  CategoryId,
  {
    index: number;
    price: number;
    minutes: number;
    bids: number;
    increment: number;
  }
> = {
  clothing: { index: 0, price: 28, minutes: 240, bids: 5, increment: 2 },
  tech: { index: 0, price: 450, minutes: 45, bids: 18, increment: 10 },
  vehicles: { index: 2, price: 95, minutes: 1200, bids: 3, increment: 5 },
  furniture: { index: 1, price: 85, minutes: 480, bids: 4, increment: 5 },
  shoes: { index: 0, price: 32, minutes: 75, bids: 7, increment: 2 },
  gaming: { index: 0, price: 250, minutes: 150, bids: 12, increment: 10 },
  watches: { index: 2, price: 210, minutes: 360, bids: 9, increment: 10 },
  more: { index: 0, price: 150, minutes: 2400, bids: 6, increment: 5 },
};

/** All seed listings. Auction end times count from `startedAt` (app launch). */
export function buildItems(startedAt: number): Item[] {
  return categories.flatMap(({ id: category }, categoryIndex) => {
    const fixed: Item[] = listings[category].map((l, index) => ({
      id: `${category}-${index}`,
      category,
      title: l.title,
      priceFils: jod(l.price),
      imageUrl: unsplash(l.photo),
      condition: l.condition,
      seller: l.seller,
      brand: l.brand,
      type: l.type,
      verified: index % 3 !== 0,
      location: cities[(categoryIndex + index) % cities.length],
      saleType: 'fixed',
    }));
    const demo = auctions[category];
    const auction: Item = {
      ...fixed[demo.index],
      id: `auction-${category}`,
      ...(category === 'tech' && {
        title: {
          ar: 'آيفون 14 برو ماكس 256 جيجا',
          en: 'iPhone 14 Pro Max 256GB',
        },
      }),
      priceFils: jod(demo.price),
      saleType: 'auction',
      verified: true,
      auction: {
        endsAt: startedAt + demo.minutes * 60 * 1000,
        bidCount: demo.bids,
        incrementFils: jod(demo.increment),
      },
    };
    return [...fixed, auction];
  });
}
