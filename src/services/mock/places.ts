// Every place a listing or account can be in: Jordan's 12 governorates and
// their main cities / areas (Amman by neighbourhood). The server owns this
// list (GET /cities); this is the mock's copy. Shown as "البلقاء / السلط".
// lat/lng are approximate centres, used only on the phone to pick the
// nearest area from GPS; exact coordinates are never sent or stored.

import type { City, Localized } from '@/lib/types';

const gov = {
  amman: { ar: 'عمّان', en: 'Amman' },
  irbid: { ar: 'إربد', en: 'Irbid' },
  zarqa: { ar: 'الزرقاء', en: 'Zarqa' },
  balqa: { ar: 'البلقاء', en: 'Balqa' },
  madaba: { ar: 'مادبا', en: 'Madaba' },
  mafraq: { ar: 'المفرق', en: 'Mafraq' },
  jerash: { ar: 'جرش', en: 'Jerash' },
  ajloun: { ar: 'عجلون', en: 'Ajloun' },
  karak: { ar: 'الكرك', en: 'Karak' },
  tafilah: { ar: 'الطفيلة', en: 'Tafilah' },
  maan: { ar: 'معان', en: "Ma'an" },
  aqaba: { ar: 'العقبة', en: 'Aqaba' },
} satisfies Record<string, Localized>;

const place = (
  id: string,
  governorate: Localized,
  ar: string,
  en: string,
  lat: number,
  lng: number,
): City => ({ id, name: { ar, en }, governorate, lat, lng });

export const cities: City[] = [
  // Amman
  place('amman', gov.amman, 'وسط البلد', 'Downtown', 31.9516, 35.9239),
  place('amman-abdoun', gov.amman, 'عبدون', 'Abdoun', 31.942, 35.879),
  place('amman-shmeisani', gov.amman, 'الشميساني', 'Shmeisani', 31.97, 35.9),
  place(
    'amman-jabal-amman',
    gov.amman,
    'جبل عمّان',
    'Jabal Amman',
    31.952,
    35.906,
  ),
  place(
    'amman-jabal-hussein',
    gov.amman,
    'جبل الحسين',
    'Jabal Al-Hussein',
    31.968,
    35.92,
  ),
  place('amman-sweifieh', gov.amman, 'الصويفية', 'Sweifieh', 31.956, 35.862),
  place('amman-rabiah', gov.amman, 'الرابية', 'Al-Rabiah', 31.975, 35.878),
  place('amman-khalda', gov.amman, 'خلدا', 'Khalda', 31.996, 35.835),
  place(
    'amman-tla-al-ali',
    gov.amman,
    'تلاع العلي',
    "Tla' Al-Ali",
    32.001,
    35.864,
  ),
  place('amman-jubeiha', gov.amman, 'الجبيهة', 'Jubeiha', 32.027, 35.873),
  place('amman-sweileh', gov.amman, 'صويلح', 'Sweileh', 32.022, 35.84),
  place('amman-dabouq', gov.amman, 'دابوق', 'Dabouq', 31.985, 35.815),
  place(
    'amman-wadi-al-seer',
    gov.amman,
    'وادي السير',
    'Wadi Al-Seer',
    31.95,
    35.82,
  ),
  place(
    'amman-marj-al-hamam',
    gov.amman,
    'مرج الحمام',
    'Marj Al-Hamam',
    31.893,
    35.843,
  ),
  place('amman-abu-nseir', gov.amman, 'أبو نصير', 'Abu Nseir', 32.057, 35.88),
  place('amman-tabarbour', gov.amman, 'طبربور', 'Tabarbour', 32.009, 35.945),
  place(
    'amman-hashmi',
    gov.amman,
    'الهاشمي الشمالي',
    'Al-Hashmi Al-Shamali',
    31.969,
    35.945,
  ),
  place('amman-marka', gov.amman, 'ماركا', 'Marka', 31.98, 35.985),
  place(
    'amman-quwaysimah',
    gov.amman,
    'القويسمة',
    'Al-Quwaysimah',
    31.917,
    35.95,
  ),
  place('amman-naour', gov.amman, 'ناعور', "Na'our", 31.876, 35.83),
  place('amman-sahab', gov.amman, 'سحاب', 'Sahab', 31.871, 36.005),
  // Irbid
  place('irbid', gov.irbid, 'إربد', 'Irbid', 32.5556, 35.85),
  place('ramtha', gov.irbid, 'الرمثا', 'Ramtha', 32.559, 36.008),
  place('al-husn', gov.irbid, 'الحصن', 'Al-Husn', 32.488, 35.88),
  place('kourah', gov.irbid, 'الكورة', 'Al-Koura', 32.503, 35.682),
  place('al-taybeh', gov.irbid, 'الطيبة', 'Al-Taybeh', 32.545, 35.72),
  place(
    'mazar-shamali',
    gov.irbid,
    'المزار الشمالي',
    'Al-Mazar Al-Shamali',
    32.47,
    35.79,
  ),
  place(
    'north-shuna',
    gov.irbid,
    'الشونة الشمالية',
    'North Shuna',
    32.61,
    35.608,
  ),
  // Zarqa
  place('zarqa', gov.zarqa, 'الزرقاء', 'Zarqa', 32.0728, 36.088),
  place('russeifa', gov.zarqa, 'الرصيفة', 'Russeifa', 32.017, 36.046),
  place('hashimiyya', gov.zarqa, 'الهاشمية', 'Al-Hashimiyya', 32.127, 36.105),
  place('dhulail', gov.zarqa, 'الضليل', 'Al-Dhulail', 32.124, 36.27),
  place('azraq', gov.zarqa, 'الأزرق', 'Azraq', 31.834, 36.815),
  // Balqa
  place('salt', gov.balqa, 'السلط', 'Salt', 32.0392, 35.7272),
  place('fuheis', gov.balqa, 'الفحيص', 'Fuheis', 32.01, 35.77),
  place('mahis', gov.balqa, 'ماحص', 'Mahis', 31.993, 35.78),
  place('ain-al-basha', gov.balqa, 'عين الباشا', 'Ain Al-Basha', 32.06, 35.84),
  place('deir-alla', gov.balqa, 'دير علا', 'Deir Alla', 32.198, 35.62),
  place(
    'south-shuna',
    gov.balqa,
    'الشونة الجنوبية',
    'South Shuna',
    31.9,
    35.63,
  ),
  // Madaba
  place('madaba', gov.madaba, 'مادبا', 'Madaba', 31.716, 35.794),
  place('dhiban', gov.madaba, 'ذيبان', 'Dhiban', 31.499, 35.781),
  // Mafraq
  place('mafraq', gov.mafraq, 'المفرق', 'Mafraq', 32.342, 36.208),
  place('khalidiya', gov.mafraq, 'الخالدية', 'Al-Khalidiya', 32.175, 36.31),
  place('ruwaished', gov.mafraq, 'الرويشد', 'Al-Ruwaished', 32.505, 38.2),
  // Jerash
  place('jerash', gov.jerash, 'جرش', 'Jerash', 32.2808, 35.8993),
  place('souf', gov.jerash, 'سوف', 'Souf', 32.313, 35.837),
  // Ajloun
  place('ajloun', gov.ajloun, 'عجلون', 'Ajloun', 32.3326, 35.7517),
  place('kufranjah', gov.ajloun, 'كفرنجة', 'Kufranjah', 32.299, 35.705),
  // Karak
  place('karak', gov.karak, 'الكرك', 'Karak', 31.1853, 35.7048),
  place('al-qasr', gov.karak, 'القصر', 'Al-Qasr', 31.314, 35.743),
  place(
    'mazar-janoubi',
    gov.karak,
    'المزار الجنوبي',
    'Al-Mazar Al-Janoubi',
    31.065,
    35.695,
  ),
  place(
    'ghor-al-safi',
    gov.karak,
    'غور الصافي',
    'Ghor Al-Safi',
    31.045,
    35.465,
  ),
  // Tafilah
  place('tafilah', gov.tafilah, 'الطفيلة', 'Tafilah', 30.8375, 35.6042),
  place('busayra', gov.tafilah, 'بصيرا', 'Busayra', 30.733, 35.608),
  // Ma'an
  place('maan', gov.maan, 'معان', "Ma'an", 30.1962, 35.7341),
  place(
    'wadi-musa',
    gov.maan,
    'وادي موسى (البتراء)',
    'Wadi Musa (Petra)',
    30.322,
    35.48,
  ),
  place('shoubak', gov.maan, 'الشوبك', 'Shoubak', 30.53, 35.56),
  // Aqaba
  place('aqaba', gov.aqaba, 'العقبة', 'Aqaba', 29.532, 35.0063),
  place('quwayrah', gov.aqaba, 'القويرة', 'Al-Quwayrah', 29.8, 35.32),
];
