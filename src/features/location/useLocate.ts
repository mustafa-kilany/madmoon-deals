// "Use my current location": ask permission, take one approximate GPS fix,
// and hand back the position. Callers turn it into an area (nearestCity /
// citiesWithin) on the phone; the coordinates are never sent to the server.

import Geolocation from '@react-native-community/geolocation';
import { useMutation } from '@tanstack/react-query';
import { PermissionsAndroid, Platform } from 'react-native';

export type Position = { lat: number; lng: number };

/** Why locating failed; each has a message under `location.*` in i18n. */
export class LocateError extends Error {
  constructor(readonly reason: 'denied' | 'unavailable') {
    super(reason);
    this.name = 'LocateError';
  }
}

async function askPermission(): Promise<void> {
  if (Platform.OS === 'android') {
    // Coarse (~city block) is all an area needs, and is easier to grant.
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    );
    if (result !== PermissionsAndroid.RESULTS.GRANTED)
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

const getPosition = (enableHighAccuracy: boolean) =>
  new Promise<Position>((resolve, reject) => {
    // The Google Play path ignores `timeout` when no fix ever arrives, so we
    // keep our own clock; otherwise the button would spin forever.
    const timer = setTimeout(
      () => reject(new LocateError('unavailable')),
      ATTEMPT_MS,
    );
    Geolocation.getCurrentPosition(
      ({ coords }) => {
        clearTimeout(timer);
        resolve({ lat: coords.latitude, lng: coords.longitude });
      },
      error => {
        clearTimeout(timer);
        reject(new LocateError(error.code === 1 ? 'denied' : 'unavailable'));
      },
      // A fix from the last 10 minutes is fine; areas don't move.
      { enableHighAccuracy, timeout: ATTEMPT_MS, maximumAge: 600_000 },
    );
  });

export async function locate(): Promise<Position> {
  await askPermission();
  try {
    return await getPosition(false);
  } catch (error) {
    // No network/Wi-Fi fix (e.g. no SIM, emulator): try once with GPS.
    if (error instanceof LocateError && error.reason === 'unavailable')
      return getPosition(true);
    throw error;
  }
}

/** Mutation wrapper so screens get isPending / error for the button. */
export const useLocate = () => useMutation({ mutationFn: locate });

/** i18n key for a locate failure. */
export const locateErrorKey = (error: unknown) =>
  error instanceof LocateError && error.reason === 'denied'
    ? 'location.denied'
    : 'location.unavailable';
