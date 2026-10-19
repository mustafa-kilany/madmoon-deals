// Photo of the national ID for verification. Phase 3 keeps the prototype's
// simulated scan and returns a placeholder photo; a real camera capture
// (react-native-vision-camera or an image picker, DEVELOPMENT_GUIDE §7.3)
// replaces this function only — the screen and services stay the same.

import type { LocalPhoto } from '@/lib/types';

export async function captureIdPhoto(): Promise<LocalPhoto> {
  return {
    uri: 'mock://national-id.jpg',
    mimeType: 'image/jpeg',
    fileName: 'national-id.jpg',
  };
}
