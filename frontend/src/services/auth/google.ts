// Google sign-in on the phone (BACKEND_PLAN B10.3). Google's own account picker
// gives us an ID token; POST /auth/google sends it to our server, which checks
// it with Google's keys. The token is made for the WEB client id (config), so
// that's the id the server lists in GOOGLE_CLIENT_IDS. Android finds the app by
// its package name + signing fingerprint, registered in Firebase.

import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { config } from '@/config';
import { ApiError } from '../api/errors';

let configured = false;
function setUp() {
  if (configured) return;
  GoogleSignin.configure({ webClientId: config.googleWebClientId });
  configured = true;
}

/**
 * Show Google's account picker. Returns the ID token, or null when the user
 * closed the picker (nothing to report). Other failures throw an ApiError.
 */
export async function pickGoogleAccount(): Promise<string | null> {
  setUp();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) return null;
    if (!response.data.idToken) throw new ApiError('UNKNOWN', 'Google gave no ID token');
    return response.data.idToken;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // A second tap while the picker is open is not an error either.
    if (
      isErrorWithCode(error) &&
      (error.code === statusCodes.SIGN_IN_CANCELLED ||
        error.code === statusCodes.IN_PROGRESS)
    )
      return null;
    throw new ApiError(
      'UNKNOWN',
      `Google sign-in failed: ${isErrorWithCode(error) ? error.code : String(error)}`,
    );
  }
}

/**
 * Forget the chosen Google account on this phone (on log-out), so the next
 * "Continue with Google" asks which account again instead of reusing it.
 */
export async function forgetGoogleAccount(): Promise<void> {
  setUp();
  if (!GoogleSignin.hasPreviousSignIn()) return;
  await GoogleSignin.signOut().catch(() => {});
}
