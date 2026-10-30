// The certificate rules in docs/API.md → Shop test certificates, steps 1, 2,
// 4, 5 and 6, on text an OcrProvider read. Pure functions: no database, no
// network. Step 3 (stamp) is stamp.ts; step 7 (already used) needs the database.

import type { OcrResult } from './ocr';

export type CertificateProblem =
  | 'unreadable'
  | 'no_stamp'
  | 'no_shop'
  | 'device_mismatch'
  | 'no_specs'
  | 'too_old'
  | 'already_used';

export type ChosenDevice = {
  brand: string;
  model?: string;
  /** Every model of this brand for the chosen type (GET /categories/filters). */
  knownModels: string[];
};

export type TextCheck = {
  problems: CertificateProblem[];
  shopName?: string;
  shopPhone?: string;
  testedAt?: Date;
  device?: string;
  specs: string[];
  /** IMEI / serial numbers on the paper: hash them for reuse checks, blur them for buyers. */
  serials: string[];
};

const MIN_TEXT = 30;
const MIN_CONFIDENCE = 0.6;
const MAX_AGE_DAYS = 30;

/** Arabic-Indic (٠١٢…) and Persian (۰۱۲…) digits → 0-9. */
export const westernDigits = (text: string) =>
  text
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0));

const compact = (text: string) => text.toLowerCase().replace(/[\s\-_]+/g, '');

// ── Step 2: shop ────────────────────────────────────────────────────────────

/** A Jordanian mobile (07[789]XXXXXXX) or landline (0[2356]XXXXXXX), as 0XXXXXXXXX. */
export function findJordanPhone(text: string): string | undefined {
  // Join digits split by spaces or dashes ("079 123 4567").
  const joined = westernDigits(text).replace(/(\d)[ \t-]+(?=\d)/g, '$1');
  const match = joined.match(/(?<!\d)(?:\+?962|00962|0)(7[789]\d{7}|[2356]\d{7})(?!\d)/);
  return match ? `0${match[1]}` : undefined;
}

const SHOP_WORDS =
  /(محل|محلات|مؤسسة|موسسة|شركة|مركز|معرض|للخلويات|للهواتف|للإلكترونيات|للالكترونيات|صيانة|mobile|phone|store|shop|center|centre|electronics|tech)/i;

/** The letterhead line that names the shop, or the first line with words in it. */
export function findShopName(text: string): string | undefined {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /\p{L}{2,}/u.test(line) && line.length <= 80);
  return (lines.find(line => SHOP_WORDS.test(line)) ?? lines[0])?.slice(0, 80);
}

// ── Step 4: device ──────────────────────────────────────────────────────────

/** How sellers and shops write brands in Arabic. Add more as reports come in. */
const BRAND_SPELLINGS: Record<string, string[]> = {
  apple: ['apple', 'آبل', 'ابل', 'أبل', 'ايفون', 'آيفون', 'iphone', 'ipad', 'macbook'],
  samsung: ['samsung', 'سامسونج', 'سامسونغ', 'سامسونق', 'galaxy', 'جالكسي', 'جالاكسي'],
  xiaomi: ['xiaomi', 'شاومي', 'شياومي', 'redmi', 'ريدمي', 'poco', 'بوكو'],
  huawei: ['huawei', 'هواوي'],
  honor: ['honor', 'هونر', 'هونور'],
  oppo: ['oppo', 'اوبو', 'أوبو'],
  realme: ['realme', 'ريلمي'],
  vivo: ['vivo', 'فيفو'],
  oneplus: ['oneplus', 'ونبلس', 'وان بلس'],
  google: ['google', 'pixel', 'جوجل', 'بكسل'],
  infinix: ['infinix', 'انفنكس', 'إنفينكس'],
  sony: ['sony', 'سوني', 'playstation', 'بلايستيشن'],
  microsoft: ['microsoft', 'مايكروسوفت', 'xbox', 'اكس بوكس'],
  nintendo: ['nintendo', 'نينتندو'],
  lenovo: ['lenovo', 'لينوفو'],
  hp: ['hp', 'اتش بي', 'إتش بي'],
  dell: ['dell', 'ديل'],
  asus: ['asus', 'اسوس', 'أسوس'],
  acer: ['acer', 'ايسر', 'أيسر'],
  lg: ['lg', 'ال جي', 'إل جي'],
};

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The brand as a whole word ("iPhone14" counts, but "ابل" inside "قابل" or
 * "ديل" inside "تعديل" doesn't).
 */
export function brandOnPaper(text: string, brand: string): boolean {
  const spellings = BRAND_SPELLINGS[brand.toLowerCase()] ?? [brand.toLowerCase()];
  return spellings.some(spelling =>
    new RegExp(
      `(?<!\\p{L})${spelling.split(/\s+/).map(escape).join('\\s*')}(?!\\p{L})`,
      'iu',
    ).test(text),
  );
}

/**
 * The model written on the paper. Takes the longest known model found, so
 * "iPhone 14 Pro Max" on the paper isn't accepted for "iPhone 14 Pro".
 */
export function modelOnPaper(text: string, device: ChosenDevice): string | undefined {
  const page = compact(text);
  const candidates = [...new Set([...device.knownModels, ...(device.model ? [device.model] : [])])];
  return candidates
    .filter(model => page.includes(compact(model)))
    .sort((a, b) => compact(b).length - compact(a).length)[0];
}

// ── Step 5: specs ───────────────────────────────────────────────────────────

export function findSpecs(text: string): string[] {
  const t = westernDigits(text).replace(/٪/g, '%');
  const specs: string[] = [];
  const add = (spec: string) => !specs.includes(spec) && specs.push(spec);

  const ramGb = new Set<string>();
  for (const m of t.matchAll(/(?:ram|رام|الرام|ذاكرة عشوائية)\s*[:\-]?\s*(\d{1,2})\s*(?:gb|g|جيجا|غيغا)|(?<!\d)(\d{1,2})\s*(?:gb|g)\s*(?:ram|رام)/gi)) {
    const gb = m[1] ?? m[2];
    ramGb.add(gb);
    add(`${gb}GB RAM`);
  }
  for (const m of t.matchAll(/(\d{2,4})\s*(gb|tb|جيجا|غيغا|جيغا|تيرا)(?![a-z])/gi)) {
    const unit = /tb|تيرا/i.test(m[2]) ? 'TB' : 'GB';
    if (unit === 'GB' && ramGb.has(m[1])) continue;
    add(`${m[1]}${unit}`);
  }
  for (const m of t.matchAll(/(?:battery|بطارية|البطارية|صحة البطارية|battery health)[^\d%\n]{0,25}(\d{2,3})\s*%/gi))
    if (Number(m[1]) <= 100) add(`Battery ${m[1]}%`);
  for (const m of t.matchAll(/(\d{1,2}(?:\.\d)?)\s*(?:inch|inches|"|انش|إنش|بوصة)/gi))
    add(`${m[1]}"`);
  for (const m of t.matchAll(/\b(i[3579][\s-]?\d{4,5}[a-z]{0,2}|ryzen\s*[3579](?:\s*\d{4}[a-z]{0,2})?|m[1-5](?:\s*(?:pro|max|ultra))?|snapdragon\s*[\w+]+)\b/gi))
    add(m[1].replace(/\s+/g, ' '));
  return specs;
}

// ── Step 6: date ────────────────────────────────────────────────────────────

/** Every date on the page: dd/mm/yyyy (Jordan's usual), or yyyy-mm-dd. */
export function findDates(text: string): Date[] {
  const t = westernDigits(text);
  const dates: Date[] = [];
  const push = (y: number, m: number, d: number) => {
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCMonth() === m - 1 && date.getUTCDate() === d) dates.push(date);
  };
  for (const m of t.matchAll(/(?<!\d)(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?!\d)/g))
    push(+m[1], +m[2], +m[3]);
  for (const m of t.matchAll(/(?<!\d)(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?!\d)/g))
    push(+m[3], +m[2], +m[1]);
  return dates;
}

/** The newest date that isn't in the future, if it is at most 30 days old. */
export function recentTestDate(text: string, now: Date): Date | undefined {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const newest = findDates(text)
    .filter(date => date.getTime() <= today)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  if (!newest) return undefined;
  return today - newest.getTime() <= MAX_AGE_DAYS * 86_400_000 ? newest : undefined;
}

// ── Serials (for step 7 and blurring) ───────────────────────────────────────

export function findSerials(text: string): string[] {
  const t = westernDigits(text);
  const serials = new Set<string>();
  for (const m of t.matchAll(/(?<!\d)(\d{15})(?!\d)/g)) serials.add(m[1]); // IMEI
  for (const m of t.matchAll(/(?:s\/n|serial(?:\s*no\.?)?|الرقم التسلسلي|سيريال)\s*[:#\-]?\s*([A-Z0-9]{8,20})/gi))
    serials.add(m[1].toUpperCase());
  return [...serials];
}

// ── All text checks ─────────────────────────────────────────────────────────

export function checkCertificateText(
  ocr: OcrResult,
  device: ChosenDevice,
  now: Date,
): TextCheck {
  const text = ocr.text;
  if (text.replace(/\s/g, '').length < MIN_TEXT || ocr.confidence < MIN_CONFIDENCE)
    return { problems: ['unreadable'], specs: [], serials: [] };

  const problems: CertificateProblem[] = [];
  const shopPhone = findJordanPhone(text);
  const shopName = findShopName(text);
  if (!shopPhone || !shopName) problems.push('no_shop');

  let deviceOnPaper: string | undefined;
  if (!brandOnPaper(text, device.brand)) problems.push('device_mismatch');
  else if (device.model) {
    const found = modelOnPaper(text, device);
    if (!found || compact(found) !== compact(device.model)) problems.push('device_mismatch');
    else deviceOnPaper = `${device.brand} ${found}`;
  } else deviceOnPaper = device.brand;

  const specs = findSpecs(text);
  if (specs.length === 0) problems.push('no_specs');

  const testedAt = recentTestDate(text, now);
  if (!testedAt) problems.push('too_old');

  return {
    problems,
    shopName,
    shopPhone,
    testedAt,
    device: deviceOnPaper,
    specs,
    serials: findSerials(text),
  };
}
