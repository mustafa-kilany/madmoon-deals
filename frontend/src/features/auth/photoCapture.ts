// Photos for the account: the national ID (camera) and the profile picture
// (gallery). Uses the phone's own camera / photo picker, so the app needs no
// camera permission. Returns null if the user cancels.

import {
  launchCamera,
  launchImageLibrary,
  type ImagePickerResponse,
} from 'react-native-image-picker';
import type { LocalPhoto } from '@/lib/types';

/** The picker failed (no camera, no storage access…), not a cancel. */
export class PhotoCaptureError extends Error {}

function toPhoto(result: ImagePickerResponse, fallbackName: string) {
  if (result.didCancel) return null;
  if (result.errorCode)
    throw new PhotoCaptureError(result.errorMessage ?? result.errorCode);
  const asset = result.assets?.[0];
  if (!asset?.uri) return null;
  return {
    uri: asset.uri,
    mimeType: asset.type ?? 'image/jpeg',
    fileName: asset.fileName ?? fallbackName,
  } satisfies LocalPhoto;
}

// IDs need to stay readable; 2000px JPEG at 80% keeps uploads around 0.5–1 MB.
export const captureIdPhoto = async (): Promise<LocalPhoto | null> =>
  toPhoto(
    await launchCamera({
      mediaType: 'photo',
      cameraType: 'back',
      quality: 0.8,
      maxWidth: 2000,
      maxHeight: 2000,
      saveToPhotos: false,
    }),
    'national-id.jpg',
  );

export const pickAvatarPhoto = async (): Promise<LocalPhoto | null> =>
  toPhoto(
    await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.8,
      maxWidth: 600,
      maxHeight: 600,
    }),
    'avatar.jpg',
  );

// A shop's test report: sharp enough for the server to read (OCR), like IDs.
export const pickCertificatePhoto = async (): Promise<LocalPhoto | null> =>
  toPhoto(
    await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.9,
      maxWidth: 2000,
      maxHeight: 2000,
    }),
    'test-certificate.jpg',
  );

export const pickListingPhoto = async (): Promise<LocalPhoto | null> =>
  toPhoto(
    await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.8,
      maxWidth: 1200,
      maxHeight: 1200,
    }),
    'listing.jpg',
  );
