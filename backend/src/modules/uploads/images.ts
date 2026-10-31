import sharp from 'sharp';
import { ApiError } from '../../lib/errors';

// Every uploaded photo goes through here (docs/API.md → POST /uploads/listing-photo):
// the real file type is read from its bytes, not its name; it's turned upright
// (camera orientation) and re-encoded, which drops every bit of EXIF data
// (camera GPS position included); it's resized; thumbnails are cropped square.

const ACCEPTED = new Set(['jpeg', 'png', 'webp']);
const MIN_BYTES = 1024;

const unusable = (field: string, detail: string) =>
  new ApiError(422, 'VALIDATION', `"${field}" is not a usable photo (${detail})`);

/** Throws VALIDATION unless the bytes are a JPEG, PNG or WebP image. */
export async function checkImage(data: Buffer, field: string) {
  if (data.length < MIN_BYTES) throw unusable(field, `${data.length} bytes`);
  const meta = await sharp(data)
    .metadata()
    .catch(() => {
      throw unusable(field, 'not an image');
    });
  if (!meta.format || !ACCEPTED.has(meta.format)) throw unusable(field, `type ${meta.format ?? 'unknown'}`);
  return meta;
}

/** Upright JPEG, longest side at most `maxSide` px, no metadata. */
export const fullSize = (data: Buffer, maxSide: number) =>
  sharp(data)
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

/** Upright square JPEG of `side` px, centre-cropped, no metadata. */
export const square = (data: Buffer, side: number) =>
  sharp(data)
    .rotate()
    .resize(side, side, { fit: 'cover' })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
