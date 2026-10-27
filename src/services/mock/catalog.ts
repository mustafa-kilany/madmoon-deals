// Seed catalog: the 8 categories people expect on a Jordanian marketplace
// (mobiles first, gaming under Electronics, watches under Fashion), 4
// fixed-price listings each, plus one demo auction per category (id
// `auction-<category>`, built from one of that category's listings). Listing
// photos stay remote, like real listing images will; category tiles and the
// phones' and electronics' shop test certificates are bundled.

import { jod } from '@/lib/money';
import { brandsByType } from './brands';
import { cities } from './places';
import type {
  Category,
  CategoryFilters,
  CategoryId,
  Condition,
  Item,
  ItemType,
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

/** Models of the seed listings that have one (by listing id). */
const seedModels: Record<string, string> = {
  'mobiles-0': 'iPhone 14 Pro',
  'mobiles-1': 'Galaxy S21',
  'mobiles-2': 'iPad Air (5th gen)',
  'electronics-1': 'PlayStation 5 (Disc)',
  'vehicles-0': 'Cerato',
  'vehicles-1': 'Mustang',
  'vehicles-2': '500',
};

/** What each seller wrote (one language, as typed; at least 10 words). */
const seedDescriptions: Record<string, string> = {
  'mobiles-0':
    'Bought new from an official store in Amman and used with a case and screen protector from day one. Battery health 89%.\n\n' +
    'No scratches or dents, never repaired or opened. Face ID, all three cameras and the speakers work perfectly.\n\n' +
    'Comes with the original box, the cable and two cases. Selling only because I upgraded.',
  'mobiles-1':
    'الجهاز شغال 100% بدون أي مشاكل، فيه خدوش خفيفة على الإطار من الاستعمال. البطارية بتكفي يوم كامل والذاكرة 128 جيجا. معه الشاحن الأصلي والكفر.',
  'mobiles-2':
    'iPad Air 5th gen, 64GB Wi-Fi in space grey. Used mostly for reading and university notes, always in a folio case. ' +
    'The screen is flawless and the battery holds well. Comes with the original box and USB-C cable.',
  'mobiles-3':
    'ساعة آبل جديدة، فُتحت الكرتونة للفحص فقط ولم تُستعمل. وصلتني هدية ولا أحتاجها. المقاس 41 ملم، لون أسود، ومعها كل الملحقات الأصلية.',
  'electronics-0':
    'MacBook Air M1 13-inch with 8GB RAM and a 256GB SSD. Battery cycle count is 210 and health is 91%. ' +
    'No dents, and the keyboard and trackpad work perfectly. Charger included; selling because I switched to a desktop.',
  'electronics-1':
    'بلايستيشن 5 نسخة الأقراص، استعمال خفيف بالبيت ونظيف جداً. معه يدّين أصليتين وكل الكوابل، ولعبة FIFA مجاناً. ما انفتح ولا تصلّح أبداً.',
  'electronics-2':
    'Canon EOS 250D with the 18-55mm kit lens, about 8,000 shutter clicks. The sensor and lens are clean with no fungus or scratches. ' +
    'Comes with two batteries, a 64GB card, the charger and a shoulder bag.',
  'electronics-3':
    'سماعات سوني لاسلكية جديدة، استعملتها مرتين فقط. عزل الضوضاء ممتاز والبطارية بتدوم حوالي 30 ساعة. معها العلبة والكابل وحقيبة الحمل الأصلية.',
  'vehicles-0':
    'السيارة بحالة ممتازة، ماشية 85 ألف كم، صيانة دورية بالوكالة وكل الفواتير موجودة.\n\n' +
    'فحص كامل بدون ملاحظات، لون فضي، فتحة سقف، شاشة وكاميرا خلفية، والترخيص ساري لآخر السنة.\n\n' +
    'سبب البيع: السفر. الإطارات جديدة من شهرين والمكيف بارد.',
  'vehicles-1':
    'Ford Mustang 2018 EcoBoost, 2.3L turbo, automatic, 96,000 km. Imported from the US with a clean history report and serviced regularly at a known garage. ' +
    'Small scratch on the rear bumper, otherwise clean inside and out. Licensed until March.',
  'vehicles-2':
    'فيات 500 موديل 2016، ماشية 61 ألف كم، اقتصادية جداً بالبنزين ومناسبة للمدينة. فحص كامل، فتحة سقف بانوراما، وما فيها أي ضربة. صاحبة أولى والسيارة بحالة الوكالة.',
  'vehicles-3':
    'Honda CB500F, 2020, 14,000 km. Serviced every 4,000 km, with a new chain and tyres this year, and never dropped. ' +
    'Comes with a helmet and a phone mount. Papers are complete and the licence is valid.',
  'furniture-0':
    'كنبة ثلاث مقاعد من ايكيا، لون رمادي، القماش نظيف والأغطية بتنفك وبتنغسل. فيها علامات استعمال خفيفة على الذراع. الاستلام من البيت، وبنساعد بالتنزيل.',
  'furniture-1':
    'Solid wood dining table for six, 180 x 90 cm, with a natural oak finish. No scratches or water marks; we always used placemats. ' +
    'It comes apart for transport. Chairs not included.',
  'furniture-2':
    'كرسي مكتب جديد من هوم سنتر، ظهر شبك مريح ومسند للرقبة، والارتفاع قابل للتعديل. ركّبته وما استعملته لأنه ما ناسب المكتب. مع الكرتونة.',
  'furniture-3':
    'Large two-door wardrobe with a hanging rail and four shelves, 150 cm wide. Well used, with some marks on the side panels, ' +
    'but the doors close properly. Needs to be taken apart for pickup.',
  'appliances-0':
    'غسالة سامسونج أوتوماتيك 8 كيلو، تحميل أمامي، شغالة ممتاز وبدون تسريب. عمرها 4 سنين وتغيّر الكلتش السنة الماضية. البيع بسبب الانتقال لشقة مفروشة.',
  'appliances-1':
    'Smeg retro fridge in pastel blue, 248 litres with a small freezer compartment. Cools well and runs quietly, with no rust or dents. ' +
    'Bought in 2022, original manual included. Pickup from the ground floor.',
  'appliances-2':
    'مكنسة روبوت شاومي جديدة، بتكنس وبتمسح، وبتشتغل من التطبيق على الموبايل. فتحت الكرتونة للتجربة فقط. معها القاعدة والفرشاة الإضافية وكل القطع.',
  'appliances-3':
    'Black+Decker toaster oven, 20 litres, with grill and timer. Works perfectly; the glass door has a small mark that affects nothing. ' +
    'Tray and rack included. Great for a small kitchen or an office.',
  'fashion-0':
    'جاكيت جلد من زارا مقاس L، لون أسود، لبسته موسم واحد بس. الجلد طري وما فيه أي تشققات، والسحّابات كلها شغالة. مناسب للشتوية.',
  'fashion-1':
    'Mango summer dress, size M, floral print on light cotton. Worn a few times and always hand washed, so the colours are still bright. ' +
    'Midi length with adjustable straps.',
  'fashion-2':
    'حذاء نايكي رياضي مقاس 43، أصلي ومعه الفاتورة. ملبوس كم مرة بس، النعل نظيف وما فيه أي اهتراء. بيعه لأنه صغير علي شوي.',
  'fashion-3':
    'Rolex Oyster Perpetual 36mm, bought from an authorised dealer in 2019. Box, papers and receipt included. ' +
    'Serviced last year and keeps perfect time. Light hairlines on the bracelet only.',
  'kids-0':
    'مجموعة قطار خشبي للأطفال، فيها سكة دائرية وجسر وثلاث عربات. كل القطع موجودة ونظيفة. مناسبة من عمر 3 سنين وفوق.',
  'kids-1':
    'About two kilos of mixed LEGO bricks, including wheels, windows and around 15 minifigures. Washed and sorted in a storage box. ' +
    'No original instructions, but great for free building.',
  'kids-2':
    'بدلة شتوية لطفل جديدة مع التيكت، مقاس 6 إلى 9 شهور، مبطنة ودافية مع كبّوت. وصلتنا هدية مكررة وما انلبست.',
  'kids-3':
    'Soft brown teddy bear, about 40 cm tall, brand new with the tag still on. It was a gift we never used, kept in its bag.',
  'hobbies-0':
    'دراجة جبلية تريك مقاس 27.5، الإطار ألمنيوم، 21 سرعة وفرامل ديسك. صيانة كاملة الشهر الماضي وتغيّر الجنزير والفرامل. فيها خدوش خفيفة على الإطار.',
  'hobbies-1':
    'Yamaha F310 acoustic guitar, great for beginners. New strings fitted last month and the neck is straight. ' +
    'A few small marks on the body. Comes with a soft case, a strap and spare picks.',
  'hobbies-2':
    'مجموعة دمبلز قابلة للتعديل من 2 لـ 20 كيلو لكل إيد، مع الحامل. الأقراص مغلفة بالمطاط وما بتعمل صوت. استعمال بيتي خفيف.',
  'hobbies-3':
    'Collection of 25 English novels, mostly classics and bestsellers, all paperback. A few have pencil notes but every page is there. ' +
    'Selling as one bundle.',
};

/** The shop test reports on the seed phones and electronics (photos bundled). */
const seedCertificates: Record<
  string,
  { image: number; shopName: string; testedAt: string; specs: string[] }
> = {
  'mobiles-0': {
    image: require('../../../assets/images/certificates/mobiles-0.jpg'),
    shopName: 'Smart Fix Mobile',
    testedAt: '2026-10-20',
    specs: ['128GB', 'Battery 89%'],
  },
  'mobiles-1': {
    image: require('../../../assets/images/certificates/mobiles-1.jpg'),
    shopName: 'Al-Wafa Electronics',
    testedAt: '2026-10-23',
    specs: ['128GB', '8GB RAM'],
  },
  'mobiles-2': {
    image: require('../../../assets/images/certificates/mobiles-2.jpg'),
    shopName: 'Smart Fix Mobile',
    testedAt: '2026-10-16',
    specs: ['64GB', 'Wi-Fi'],
  },
  'mobiles-3': {
    image: require('../../../assets/images/certificates/mobiles-3.jpg'),
    shopName: 'Tech Care Center',
    testedAt: '2026-10-24',
    specs: ['41mm', 'Battery 100%'],
  },
  'electronics-0': {
    image: require('../../../assets/images/certificates/electronics-0.jpg'),
    shopName: 'Tech Care Center',
    testedAt: '2026-10-21',
    specs: ['8GB RAM', '256GB SSD', 'Battery 91%'],
  },
  'electronics-1': {
    image: require('../../../assets/images/certificates/electronics-1.jpg'),
    shopName: 'Al-Wafa Electronics',
    testedAt: '2026-10-22',
    specs: ['825GB', 'Disc drive OK'],
  },
  'electronics-2': {
    image: require('../../../assets/images/certificates/electronics-2.jpg'),
    shopName: 'Tech Care Center',
    testedAt: '2026-10-19',
    specs: ['24.1MP', '8,000 shots'],
  },
  'electronics-3': {
    image: require('../../../assets/images/certificates/electronics-3.jpg'),
    shopName: 'Al-Wafa Electronics',
    testedAt: '2026-10-25',
    specs: ['Bluetooth OK', 'Noise cancelling OK'],
  },
  'auction-mobiles': {
    image: require('../../../assets/images/certificates/auction-mobiles.jpg'),
    shopName: 'Smart Fix Mobile',
    testedAt: '2026-10-24',
    specs: ['256GB', 'Battery 92%'],
  },
};

const certificateOf = (id: string) => {
  const cert = seedCertificates[id];
  return cert && { ...cert, testedAt: Date.parse(cert.testedAt) };
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

/** Made-up but stable view counts, so "most viewed" has an order. */
const seedViews = (categoryIndex: number, index: number) =>
  40 + ((categoryIndex * 37 + index * 83) % 260);

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
      sellerId: `user-${l.seller.en.toLowerCase()}`,
      description: seedDescriptions[`${category}-${index}`],
      testCertificate: certificateOf(`${category}-${index}`),
      status: 'active',
      brand: l.brand,
      model: seedModels[`${category}-${index}`],
      type: l.type,
      verified: index % 3 !== 0,
      location: (({ id, name, governorate }) => ({ id, name, governorate }))(
        seedPlaces[(categoryIndex + index) % seedPlaces.length],
      ),
      saleType: 'fixed',
      views: seedViews(categoryIndex, index),
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
        model: 'iPhone 14 Pro Max',
        description:
          'iPhone 14 Pro Max 256GB in deep purple. Battery health 92%, always used with a case and screen protector. ' +
          'No repairs; Face ID and the cameras work perfectly. Box and cable included.',
        testCertificate: certificateOf('auction-mobiles'),
      }),
      priceFils: jod(demo.price),
      saleType: 'auction',
      views: seedViews(categoryIndex, demo.index) * 3,
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
