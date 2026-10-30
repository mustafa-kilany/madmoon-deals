import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  brandOnPaper,
  checkCertificateText,
  findDates,
  findJordanPhone,
  findSpecs,
  modelOnPaper,
  recentTestDate,
  westernDigits,
} from './checks';
import type { OcrResult } from './ocr';

const ocr = (text: string, confidence = 0.95): OcrResult => ({
  provider: 'test',
  text,
  words: [],
  confidence,
});

const iphones = ['iPhone 14 Pro Max', 'iPhone 14 Pro', 'iPhone 14 Plus', 'iPhone 14'];
const now = new Date('2026-10-30T10:00:00Z');

const report = `محل النجم للخلويات
عمان - شارع الجاردنز  هاتف: ٠٧٩ ١٢٣ ٤٥٦٧
تقرير فحص جهاز
Apple iPhone 14 Pro
Storage: 128GB   RAM 6GB
Battery health: 89%
IMEI: 356789012345678
التاريخ: 25/10/2026`;

test('Arabic digits become western digits', () => {
  assert.equal(westernDigits('٠٧٩١٢٣٤٥٦٧ ۲۵'), '0791234567 25');
});

test('Jordanian phone numbers, spaced, Arabic digits or +962', () => {
  assert.equal(findJordanPhone('هاتف ٠٧٩ ١٢٣ ٤٥٦٧'), '0791234567');
  assert.equal(findJordanPhone('Tel +962 78 555 1234'), '0785551234');
  assert.equal(findJordanPhone('06 5512345'), '065512345');
  assert.equal(findJordanPhone('call 0712345678'), undefined); // 071 isn't a mobile prefix
});

test('brands match as whole words, in Arabic too', () => {
  assert.equal(brandOnPaper('جهاز آبل أصلي', 'Apple'), true);
  assert.equal(brandOnPaper('Apple iPhone14 Pro', 'Apple'), true);
  assert.equal(brandOnPaper('الجهاز قابل للتشغيل', 'Apple'), false);
  assert.equal(brandOnPaper('تم تعديل الشاشة', 'Dell'), false);
  assert.equal(brandOnPaper('لابتوب ديل', 'Dell'), true);
});

test('the longest model wins, so Pro Max is not accepted as Pro', () => {
  const device = { brand: 'Apple', model: 'iPhone 14 Pro', knownModels: iphones };
  assert.equal(modelOnPaper('Apple iPhone 14 Pro Max 256GB', device), 'iPhone 14 Pro Max');
  assert.equal(modelOnPaper('apple iphone14pro', device), 'iPhone 14 Pro');
});

test('specs: storage, RAM, battery', () => {
  assert.deepEqual(findSpecs('Storage: 128GB RAM 6GB Battery health: 89%'), [
    '6GB RAM',
    '128GB',
    'Battery 89%',
  ]);
  assert.deepEqual(findSpecs('ذاكرة 256 جيجا، البطارية ٩٢٪'), [
    '256GB',
    'Battery 92%',
  ]);
});

test('dates: dd/mm/yyyy and yyyy-mm-dd, impossible dates ignored', () => {
  assert.deepEqual(
    findDates('25/10/2026 and 2026-10-01 and 31/02/2026').map(d => d.toISOString().slice(0, 10)),
    ['2026-10-01', '2026-10-25'],
  );
  assert.equal(recentTestDate('01/08/2026', now), undefined); // older than 30 days
  assert.equal(recentTestDate('05/11/2026', now), undefined); // in the future
});

test('a good report passes every text check', () => {
  const result = checkCertificateText(
    ocr(report),
    { brand: 'Apple', model: 'iPhone 14 Pro', knownModels: iphones },
    now,
  );
  assert.deepEqual(result.problems, []);
  assert.equal(result.shopName, 'محل النجم للخلويات');
  assert.equal(result.shopPhone, '0791234567');
  assert.equal(result.device, 'Apple iPhone 14 Pro');
  assert.deepEqual(result.serials, ['356789012345678']);
  assert.equal(result.testedAt?.toISOString().slice(0, 10), '2026-10-25');
});

test('wrong model, missing phone, old date and blurry photos are caught', () => {
  const device = { brand: 'Apple', model: 'iPhone 14', knownModels: iphones };
  assert.deepEqual(
    checkCertificateText(
      ocr(report.replace(/هاتف.*\n/, '\n').replace('25/10/2026', '01/01/2026')),
      device,
      now,
    ).problems,
    ['no_shop', 'device_mismatch', 'too_old'],
  );
  assert.deepEqual(checkCertificateText(ocr(report, 0.3), device, now).problems, ['unreadable']);
});
