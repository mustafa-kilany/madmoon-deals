import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { findSerials } from './checks';
import type { OcrWord } from './ocr';
import { imageHash, serialWords } from './photo';

const words = (text: string): OcrWord[] => text.split(/\s+/).map(t => ({ text: t, confidence: 1, box: [] }));

test('only the IMEI / serial is blurred, also when spaced out; not the phone or the date', () => {
  const page = 'Tel 0791234567 IMEI 35 922164 626733 6 S/N: F2LXK9QWJ8 Date ٣٠/١٠/٢٠٢٦';
  const serials = findSerials(page.replace('35 922164 626733 6', '359221646267336'));
  const blurred = serialWords(words(page), serials).map(w => w.text);
  assert.deepEqual(blurred, ['922164', '626733', 'F2LXK9QWJ8']);
});

test('the photo fingerprint survives re-saving and resizing, and tells photos apart', async () => {
  // A "paper": a few dark blocks of text on white.
  const paper = (shift: number) =>
    sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="#fff"/>
        <rect x="${80 + shift}" y="100" width="500" height="60" fill="#222"/><rect x="80" y="${300 + shift}" width="700" height="40" fill="#444"/>
        <circle cx="${650 - shift}" cy="900" r="140" fill="#3050c0"/></svg>`,
      ),
    )
      .jpeg()
      .toBuffer();
  const a = await paper(0);
  const resaved = await sharp(a).resize(600).jpeg({ quality: 60 }).toBuffer();
  assert.match(await imageHash(a), /^[0-9a-f]{16}$/);
  assert.equal(await imageHash(resaved), await imageHash(a));
  assert.notEqual(await imageHash(await paper(200)), await imageHash(a));
});
