import sharp from 'sharp';
import { westernDigits } from './checks';
import type { OcrWord } from './ocr';

// The certificate photo: a fingerprint to catch the same photo twice (step 7), and
// the copy buyers see with IMEI / serial numbers blurred (BACKEND_PLAN B4.4).

/**
 * Difference hash: 64 bits from a 9 × 8 grey thumbnail. The same photo re-saved,
 * resized or slightly recompressed gives the same hash.
 */
export async function imageHash(image: Buffer) {
  const pixels = await sharp(image).greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
  let bits = 0n;
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++)
      bits = (bits << 1n) | (pixels[row * 9 + col] > pixels[row * 9 + col + 1] ? 1n : 0n);
  return bits.toString(16).padStart(16, '0');
}

/**
 * Words that are (part of) an IMEI or serial read off the page, also when the shop
 * spaced it out ("35 922164 626733 6"). The shop's phone and the date stay readable.
 */
export function serialWords(words: OcrWord[], serials: string[]) {
  const compact = (text: string) => westernDigits(text).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return words.filter(word => {
    const text = compact(word.text);
    return text.length >= 3 && serials.some(serial => serial.includes(text));
  });
}

/** A copy with every given word box blurred (padded, so no digit edge survives). */
export async function blurWords(image: Buffer, words: OcrWord[]) {
  const { width = 0, height = 0 } = await sharp(image).metadata();
  const pad = 8;
  const patches = await Promise.all(
    words
      .filter(word => word.box.length > 0)
      .map(async word => {
        const xs = word.box.map(p => p.x);
        const ys = word.box.map(p => p.y);
        const left = Math.max(0, Math.floor(Math.min(...xs)) - pad);
        const top = Math.max(0, Math.floor(Math.min(...ys)) - pad);
        const right = Math.min(width, Math.ceil(Math.max(...xs)) + pad);
        const bottom = Math.min(height, Math.ceil(Math.max(...ys)) + pad);
        if (right - left < 2 || bottom - top < 2) return null;
        const area = { left, top, width: right - left, height: bottom - top };
        const input = await sharp(image).extract(area).blur(Math.max(8, area.height / 2)).toBuffer();
        return { input, left, top };
      }),
  );
  const overlays = patches.filter(p => p !== null);
  return sharp(image).composite(overlays).jpeg({ quality: 82 }).toBuffer();
}
