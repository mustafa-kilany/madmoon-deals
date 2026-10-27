// "Use my current location": ask permission, take one GPS fix, and hand back
// the position. Areas only need an approximate fix, turned into an area
// (nearestCity / citiesWithin) on the phone. The checkout asks for a precise
// one, to look up the street for the delivery address (docs/API.md →
// GET /geocode/reverse); nothing else sends coordinates to the server.

import Geolocation from '@react-native-community/geolocation';
import { useMutation } from '@tanstack/react-query';
import { PermissionsAndroid, Platform } from 'react-native';
import type { Position } from '@/lib/types';

export type { Position } from '@/lib/types';

/** A fix and how far off it may be, in metres. */
export type Fix = Position & { accuracy: number };

/** Within this, the fix is good enough to name the street. */
export const STREET_ACCURACY_M = 150;

/** Why locating failed; each has a message under `location.*` in i18n. */
export class LocateError extends Error {
  constructor(readonly reason: 'denied' | 'unavailable') {
    super(reason);
    this.name = 'LocateError';
  }
}

async function askPermission(precise: boolean): Promise<void> {
  if (Platform.OS === 'android') {
    const { ACCESS_COARSE_LOCATION: coarse, ACCESS_FINE_LOCATION: fine } =
      PermissionsAndroid.PERMISSIONS;
    // Coarse (~city block) is all an area needs, and is easier to grant.
    // Android 12+ asks for both together and lets the user pick
    // "approximate"; then the fix is just less accurate.
    const result = await PermissionsAndroid.requestMultiple(
      precise ? [fine, coarse] : [coarse],
    );
    if (result[coarse] !== PermissionsAndroid.RESULTS.GRANTED)
      throw new LocateError('denied');
    return;
  }
  await new Promise<void>((resolve, reject) =>
    Geolocation.requestAuthorization(resolve, () =>
      reject(new LocateError('denied')),
    ),
  );
}

// Google Play's fused location (works with the coarse permission, indoors
// too). On phones without Google Play (e.g. newer Huawei) the library falls
// back to Android's own providers. Note: 'auto' does NOT pick Google Play in
// this library version, so it must be named. We ask for permission ourselves.
Geolocation.setRNConfiguration({
  skipPermissionRequests: true,
  locationProvider: 'playServices',
});

const ATTEMPT_MS = 12_000;

const getPosition = (enableHighAccuracy: boolean, maximumAge: number) =>
  new Promise<Fix>((resolve, reject) => {
    // The Google Play path ignores `timeout` when no fix ever arrives, so we
    // keep our own clock; otherwise the button would spin forever.
    const timer = setTimeout(
      () => reject(new LocateError('unavailable')),
      ATTEMPT_MS,
    );
    Geolocation.getCurrentPosition(
      ({ coords }) => {
        clearTimeout(timer);
        resolve({
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
        });
      },
      error => {
        clearTimeout(timer);
        reject(new LocateError(error.code === 1 ? 'denied' : 'unavailable'));
      },
      { enableHighAccuracy, timeout: ATTEMPT_MS, maximumAge },
    );
  });

/** precise: for a street address (GPS first, a fix from the last minute). */
export async function locate({ precise = false } = {}): Promise<Fix> {
  await askPermission(precise);
  // An area fix from the last 10 minutes is fine; areas don't move.
  const maximumAge = precise ? 60_000 : 600_000;
  try {
    return await getPosition(precise, maximumAge);
  } catch (error) {
    // No fix that way (e.g. no SIM, emulator, indoors): try the other once.
    if (error instanceof LocateError && error.reason === 'unavailable')
      return getPosition(!precise, maximumAge);
    throw error;
  }
}

/** Mutation wrapper so screens get isPending / error for the button. */
export const useLocate = () => useMutation({ mutationFn: () => locate() });

/** i18n key for a locate failure. */
export const locateErrorKey = (error: unknown) =>
  error instanceof LocateError && error.reason === 'denied'
    ? 'location.denied'
    : 'location.unavailable';
