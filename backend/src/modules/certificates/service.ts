import { randomUUID } from 'node:crypto';
import { prisma } from '../../db';
import { env } from '../../env';
import { ApiError } from '../../lib/errors';
import { keyedHash } from '../../lib/hash';
import { privateStorage, storage } from '../../lib/storage';
import { findType } from '../../reference';
import { fullSize } from '../uploads/images';
import { checkCertificateText, type CertificateProblem } from './checks';
import { fakeOcr, type FakeDevice } from './fakeOcr';
import { googleVision, type OcrProvider } from './ocr';
import { blurWords, imageHash, serialWords } from './photo';
import { noStampDetector } from './stamp';

// POST /test-certificates (BACKEND_PLAN B4.3): docs/API.md → Shop test
// certificates, steps 1–8. Answers in a few seconds: one OCR call, the rest local.

export type CertificateDevice = { category: string; type: string; brand: string; model?: string };

let ocrOverride: ((device: FakeDevice) => OcrProvider) | null = null;
/** Tests only: read certificates with this instead (e.g. a scripted page of text). */
export const useOcrForTests = (ocr: typeof ocrOverride) => {
  ocrOverride = ocr;
};

/** Google Vision with a key; the fake reader in development; nothing in production without a key. */
function ocrFor(device: FakeDevice): OcrProvider {
  if (ocrOverride) return ocrOverride(device);
  if (env.GOOGLE_VISION_API_KEY) return googleVision(env.GOOGLE_VISION_API_KEY);
  if (env.NODE_ENV !== 'production') return fakeOcr(device);
  throw new ApiError(503, 'INTERNAL', "Certificate checks aren't set up on this server yet");
}

/** A listing that counts as "another listing" for reuse: still for sale or sold through Sahla. */
const liveListing = { listing: { status: { not: 'withdrawn' as const } } };

export async function checkCertificate(userId: string, photo: Buffer, device: CertificateDevice) {
  const type = findType(device.category, device.type);
  if (!type) throw new ApiError(422, 'VALIDATION', `No type ${device.type} in ${device.category}`);
  if (!type.requiresTestCertificate)
    throw new ApiError(422, 'VALIDATION', `${device.type} listings don't need a test certificate`);

  // Upright and without EXIF, so OCR word boxes match the copy we blur.
  const image = await fullSize(photo, 2000);
  const [ocr, stamp, hash] = await Promise.all([
    ocrFor(device).read(image),
    noStampDetector.detect(image),
    imageHash(image),
  ]);
  const knownModels = type.models?.[device.brand] ?? [];
  const text = checkCertificateText(ocr, { brand: device.brand, model: device.model, knownModels }, new Date());
  const problems: CertificateProblem[] = [...text.problems];
  if (stamp.found === false) problems.push('no_stamp');

  // Step 7: the same photo, or the same IMEI / serial, on another listing.
  const serialHashes = text.serials.map(serial => keyedHash('serial', serial));
  const reused = await prisma.testCertificate.findFirst({
    where: {
      OR: [{ imageHash: hash }, ...(serialHashes.length ? [{ serialHashes: { hasSome: serialHashes } }] : [])],
      ...liveListing,
    },
    select: { id: true },
  });
  if (reused) problems.push('already_used');

  const name = `certificates/${randomUUID()}`;
  const [photoUrl, blurredUrl] = await Promise.all([
    privateStorage.put(`${name}.jpg`, image), // the original: admins only
    blurWords(image, serialWords(ocr.words, text.serials)).then(blurred => storage.put(`${name}_blurred.jpg`, blurred)),
  ]);

  return prisma.testCertificate.create({
    data: {
      userId,
      status: problems.length ? 'failed' : 'passed',
      problems,
      category: device.category,
      type: device.type,
      brand: device.brand,
      model: device.model,
      shopName: text.shopName,
      shopPhone: text.shopPhone,
      testedAt: text.testedAt,
      device: text.device,
      specs: text.specs,
      photoUrl,
      blurredUrl,
      imageHash: hash,
      serialHashes,
      ocrProvider: ocr.provider,
      ocrText: ocr.text, // for disputes; never returned to the app
      stampChecked: stamp.found !== null,
    },
  });
}

/** docs/API.md `CertificateCheck`: what the seller sees (no OCR text, no photo). */
export const toCertificateCheck = (c: Awaited<ReturnType<typeof checkCertificate>>) => ({
  id: c.id,
  status: c.status,
  problems: c.problems,
  ...(c.shopName && { shopName: c.shopName }),
  ...(c.testedAt && { testedAt: c.testedAt.toISOString() }),
  ...(c.device && { device: c.device }),
  specs: c.specs,
});
