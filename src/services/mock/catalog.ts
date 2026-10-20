// Seed catalog: the 8 categories people expect on a Jordanian marketplace
// (mobiles first, gaming under Electronics, watches under Fashion), 4
// fixed-price listings each, plus one demo auction per category (id
// `auction-<category>`, built from one of that category's listings). Listing
// photos stay remote, like real listing images will; category tiles are bundled.

import { jod } from '@/lib/money';
import { cities } from './places';
import type {
  Category,
  CategoryFilters,
  CategoryId,
  Condition,
  Item,
  Localized,
} from '@/lib/types';

const unsplash = (photo: string) =>
  `https://images.unsplash.com/${photo}?w=400&h=400&fit=crop`;

export const categories: Category[] = [
  {
    id: 'mobiles',
    name: { ar: 'موبايلات وتابلت', en: 'Mobiles & Tablets' },
    icon: 'Smartphone',
    image: require('../../../assets/images/categories/mobiles.jpg'),
  },
  {
    id: 'electronics',
    name: { ar: 'إلكترونيات', en: 'Electronics' },
    icon: 'Laptop',
    image: require('../../../assets/images/categories/electronics.jpg'),
  },
  {
    id: 'vehicles',
    name: { ar: 'سيارات ومركبات', en: 'Cars & Vehicles' },
    icon: 'Car',
    image: require('../../../assets/images/categories/vehicles.jpg'),
  },
  {
    id: 'furniture',
    name: { ar: 'أثاث ومنزل', en: 'Home & Furniture' },
    icon: 'Sofa',
    image: require('../../../assets/images/categories/furniture.jpg'),
  },
  {
    id: 'appliances',
    name: { ar: 'أجهزة منزلية', en: 'Home Appliances' },
    icon: 'Refrigerator',
    image: require('../../../assets/images/categories/appliances.jpg'),
  },
  {
    id: 'fashion',
    name: { ar: 'أزياء', en: 'Fashion' },
    icon: 'Shirt',
    image: require('../../../assets/images/categories/fashion.jpg'),
  },
  {
    id: 'kids',
    name: { ar: 'أطفال ومواليد', en: 'Kids & Baby' },
    icon: 'Baby',
    image: require('../../../assets/images/categories/kids.jpg'),
  },
  {
    id: 'hobbies',
    name: { ar: 'رياضة وهوايات', en: 'Sports & Hobbies' },
    icon: 'Dumbbell',
    image: require('../../../assets/images/categories/hobbies.jpg'),
  },
];

const itemType = (id: string, ar: string, en: string) => ({
  id,
  name: { ar, en },
});

export const categoryFilters: Record<CategoryId, CategoryFilters> = {
  mobiles: {
    types: [
      itemType('phones', 'هواتف', 'Phones'),
      itemType('tablets', 'أجهزة لوحية', 'Tablets'),
      itemType('smartwatches', 'ساعات ذكية', 'Smartwatches'),
      itemType('accessories', 'إكسسوارات', 'Accessories'),
    ],
    brands: ['Apple', 'Samsung', 'Xiaomi', 'Huawei', 'Oppo'],
  },
  electronics: {
    types: [
      itemType('laptops', 'لابتوبات', 'Laptops'),
      itemType('gaming', 'ألعاب فيديو', 'Gaming'),
      itemType('tvs', 'شاشات وتلفزيونات', 'TVs & Screens'),
      itemType('cameras', 'كاميرات', 'Cameras'),
      itemType('audio', 'سماعات وصوتيات', 'Audio'),
    ],
    brands: ['Apple', 'Sony', 'Samsung', 'Dell', 'HP', 'Canon', 'Microsoft'],
  },
  vehicles: {
    types: [
      itemType('cars', 'سيارات', 'Cars'),
      itemType('motorcycles', 'دراجات نارية', 'Motorcycles'),
      itemType('parts', 'قطع غيار', 'Parts & Accessories'),
      itemType('scooters', 'سكوترات', 'Scooters'),
    ],
    brands: ['Kia', 'Toyota', 'Hyundai', 'Ford', 'Fiat', 'Honda'],
  },
  furniture: {
    types: [
      itemType('sofas', 'كنب', 'Sofas'),
      itemType('tables', 'طاولات', 'Tables'),
      itemType('chairs', 'كراسي', 'Chairs'),
      itemType('storage', 'خزائن', 'Storage'),
      itemType('beds', 'أسِرّة', 'Beds'),
    ],
    brands: ['IKEA', 'Home Centre', 'Pan Emirates'],
  },
  appliances: {
    types: [
      itemType('fridges', 'ثلاجات', 'Fridges'),
      itemType('washing-machines', 'غسالات', 'Washing Machines'),
      itemType('kitchen', 'أجهزة مطبخ', 'Kitchen'),
      itemType('air-conditioners', 'مكيفات', 'Air Conditioners'),
      itemType('small-appliances', 'أجهزة صغيرة', 'Small Appliances'),
    ],
    brands: ['Samsung', 'LG', 'Bosch', 'Smeg', 'Xiaomi', 'Black+Decker'],
  },
  fashion: {
    types: [
      itemType('men', 'رجالي', "Men's Clothing"),
      itemType('women', 'نسائي', "Women's Clothing"),
      itemType('shoes', 'أحذية', 'Shoes'),
      itemType('bags', 'حقائب', 'Bags'),
      itemType('watches-jewelry', 'ساعات ومجوهرات', 'Watches & Jewelry'),
    ],
    brands: ['Zara', 'H&M', 'Mango', 'Nike', 'Adidas', 'Fossil', 'Rolex'],
  },
  kids: {
    types: [
      itemType('toys', 'ألعاب أطفال', 'Toys'),
      itemType('strollers', 'عربات أطفال', 'Strollers'),
      itemType('car-seats', 'كراسي سيارة', 'Car Seats'),
      itemType('kids-clothing', 'ملابس أطفال', 'Kids Clothing'),
    ],
    brands: ['LEGO', 'Chicco', 'Graco', 'Joie', 'Fisher-Price'],
  },
  hobbies: {
    types: [
      itemType('bicycles', 'دراجات هوائية', 'Bicycles'),
      itemType('fitness', 'معدات رياضية', 'Fitness'),
      itemType('instruments', 'آلات موسيقية', 'Instruments'),
      itemType('books', 'كتب', 'Books'),
      itemType('camping', 'تخييم ورحلات', 'Camping'),
    ],
    brands: ['Trek', 'Giant', 'Yamaha', 'Decathlon'],
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

export { cities };

/** Where the seed listings are, spread across a few governorates. */
const seedPlaces = [
  'amman-khalda',
  'irbid',
  'zarqa',
  'salt',
  'amman-abdoun',
  'aqaba',
  'madaba',
  'amman-sweileh',
].map(id => cities.find(c => c.id === id)!);

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
  mobiles: [
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
      'سامسونج جالكسي S21',
      'Samsung Galaxy S21',
      330,
      'photo-1610945265064-0e34e5519bbf',
      'good',
      s.layla,
      'phones',
      'Samsung',
    ),
    seed(
      'آيباد إير',
      'iPad Air',
      290,
      'photo-1544244015-0df4b3ffc6b0',
      'excellent',
      s.khaled,
      'tablets',
      'Apple',
    ),
    seed(
      'ساعة آبل',
      'Apple Watch',
      110,
      'photo-1579586337278-3befd40fd17a',
      'new',
      s.noor,
      'smartwatches',
      'Apple',
    ),
  ],
  electronics: [
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
      'بلايستيشن 5',
      'PlayStation 5',
      380,
      'photo-1606813907291-d86efa9b94db',
      'excellent',
      s.omar,
      'gaming',
      'Sony',
    ),
    seed(
      'كاميرا رقمية',
      'Digital Camera',
      240,
      'photo-1516035069371-29a1b244cc32',
      'excellent',
      s.rania,
      'cameras',
      'Canon',
    ),
    seed(
      'سماعات لاسلكية',
      'Wireless Headphones',
      60,
      'photo-1505740420928-5e560c06d30e',
      'new',
      s.noor,
      'audio',
      'Sony',
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
      'فورد موستانج 2018',
      'Ford Mustang 2018',
      18500,
      'photo-1494976388531-d1058494cdd8',
      'good',
      s.khaled,
      'cars',
      'Ford',
    ),
    seed(
      'فيات 500 موديل 2016',
      'Fiat 500 2016',
      6200,
      'photo-1549317661-bd32c8ce0db2',
      'excellent',
      s.rania,
      'cars',
      'Fiat',
    ),
    seed(
      'دراجة نارية',
      'Motorcycle',
      2200,
      'photo-1558981403-c5f9899a28bc',
      'excellent',
      s.omar,
      'motorcycles',
      'Honda',
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
  appliances: [
    seed(
      'غسالة أوتوماتيك',
      'Front-Load Washing Machine',
      180,
      'photo-1626806787461-102c1bfaaea1',
      'good',
      s.noor,
      'washing-machines',
      'Samsung',
    ),
    seed(
      'ثلاجة كلاسيكية',
      'Retro Fridge',
      350,
      'photo-1571175443880-49e1d25b2bc5',
      'excellent',
      s.layla,
      'fridges',
      'Smeg',
    ),
    seed(
      'مكنسة روبوت',
      'Robot Vacuum',
      120,
      'photo-1558317374-067fb5f30001',
      'new',
      s.sami,
      'small-appliances',
      'Xiaomi',
    ),
    seed(
      'فرن كهربائي صغير',
      'Toaster Oven',
      35,
      'photo-1574269909862-7e1d70bb8078',
      'good',
      s.khaled,
      'kitchen',
      'Black+Decker',
    ),
  ],
  fashion: [
    seed(
      'جاكيت جلد كلاسيكي',
      'Classic Leather Jacket',
      45,
      'photo-1551028719-00167b16eac5',
      'excellent',
      s.omar,
      'men',
      'Zara',
    ),
    seed(
      'فستان صيفي',
      'Summer Dress',
      28,
      'photo-1595777457583-95e059d581b8',
      'good',
      s.rania,
      'women',
      'Mango',
    ),
    seed(
      'حذاء رياضي نايكي',
      'Nike Sneakers',
      55,
      'photo-1542291026-7eec264c27ff',
      'excellent',
      s.sami,
      'shoes',
      'Nike',
    ),
    seed(
      'ساعة فاخرة',
      'Luxury Watch',
      320,
      'photo-1523170335258-f5ed11844a49',
      'excellent',
      s.khaled,
      'watches-jewelry',
      'Rolex',
    ),
  ],
  kids: [
    seed(
      'قطار خشبي للأطفال',
      'Wooden Train Set',
      30,
      'photo-1596461404969-9ae70f2830c1',
      'excellent',
      s.layla,
      'toys',
    ),
    seed(
      'مجموعة مكعبات ليغو',
      'LEGO Bricks Bundle',
      40,
      'photo-1587654780291-39c9404d746b',
      'good',
      s.omar,
      'toys',
      'LEGO',
    ),
    seed(
      'بدلة شتوية لطفل',
      'Baby Winter Suit',
      12,
      'photo-1522771930-78848d9293e8',
      'new',
      s.noor,
      'kids-clothing',
    ),
    seed(
      'دبدوب',
      'Teddy Bear',
      10,
      'photo-1530325553241-4f6e7690cf36',
      'new',
      s.rania,
      'toys',
    ),
  ],
  hobbies: [
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
      'مجموعة دمبلز',
      'Dumbbell Set',
      70,
      'photo-1534438327276-14e5300c3a48',
      'excellent',
      s.sami,
      'fitness',
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
  mobiles: { index: 0, price: 450, minutes: 45, bids: 18, increment: 10 },
  electronics: { index: 1, price: 250, minutes: 150, bids: 12, increment: 10 },
  vehicles: { index: 3, price: 1800, minutes: 1200, bids: 3, increment: 50 },
  furniture: { index: 1, price: 85, minutes: 480, bids: 4, increment: 5 },
  appliances: { index: 0, price: 140, minutes: 600, bids: 6, increment: 5 },
  fashion: { index: 3, price: 210, minutes: 360, bids: 9, increment: 10 },
  kids: { index: 1, price: 25, minutes: 240, bids: 5, increment: 2 },
  hobbies: { index: 1, price: 60, minutes: 2400, bids: 6, increment: 5 },
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
      location: (({ id, name, governorate }) => ({ id, name, governorate }))(
        seedPlaces[(categoryIndex + index) % seedPlaces.length],
      ),
      saleType: 'fixed',
    }));
    const demo = auctions[category];
    const auction: Item = {
      ...fixed[demo.index],
      id: `auction-${category}`,
      ...(category === 'mobiles' && {
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
