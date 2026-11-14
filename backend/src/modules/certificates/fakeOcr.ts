import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { OcrProvider, OcrWord } from './ocr';

// BACKEND_PLAN B4.6. Development without a Google Vision key: "reads" a passing
// shop report for the device the seller chose, dated today. The IMEI comes from
// the photo's bytes, so the same photo twice is caught as already_used (and a
// new photo isn't). Never used in production (the server answers 503 there).

export type FakeDevice = { brand: string; model?: string };

export function fakeOcr(device: FakeDevice): OcrProvider {
  return {
    name: 'fake',
    async read(image) {
      const { width = 1000 } = await sharp(image).metadata();
      const digits = BigInt(`0x${createHash('sha256').update(image).digest('hex').slice(0, 15)}`).toString().padStart(15, '0');
      const imei = `35${digits.slice(0, 13)}`;
      const today = new Date();
      const date = `${String(today.getUTCDate()).padStart(2, '0')}/${String(today.getUTCMonth() + 1).padStart(2, '0')}/${today.getUTCFullYear()}`;
      const lines = [
        'مركز مضمون ديلز التجريبي للخلويات',
        'Madmoon Deals Demo Mobile Center',
        'Tel: 0791234567',
        `Device: ${device.brand} ${device.model ?? ''}`.trim(),
        'Storage 128GB  Battery 91%',
        `IMEI: ${imei}`,
        `Date: ${date}`,
      ];
      // One word per space, laid out top to bottom, so blurring has boxes to use.
      const words: OcrWord[] = lines.flatMap((line, row) => {
        let x = Math.round(width * 0.08);
        const y = 60 + row * 70;
        return line.split(/\s+/).map(text => {
          const w = Math.max(20, text.length * 18);
          const box = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + 40 }, { x, y: y + 40 }];
          x += w + 14;
          return { text, confidence: 0.95, box };
        });
      });
      return { provider: 'fake', text: lines.join('\n'), words, confidence: 0.95 };
    },
  };
}
