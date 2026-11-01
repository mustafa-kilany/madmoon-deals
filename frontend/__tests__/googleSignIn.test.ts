// Google sign-in (B10.3): the account picker's answers → ID token, nothing
// (picker closed), or an error the screen can show. The native library is the
// test double in jest.setup.js.

import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { ApiError } from '@/services/api/errors';
import {
  forgetGoogleAccount,
  pickGoogleAccount,
} from '@/services/auth/google';
import { config } from '@/config';

const signIn = GoogleSignin.signIn as jest.Mock;

afterEach(() => jest.clearAllMocks());

it('returns the ID token of the picked account, made for our web client id', async () => {
  await expect(pickGoogleAccount()).resolves.toBe(
    'test-google-id-token-0123456789',
  );
  expect(GoogleSignin.configure).toHaveBeenCalledWith({
    webClientId: config.googleWebClientId,
  });
  expect(config.googleWebClientId).toMatch(/\.apps\.googleusercontent\.com$/);
});

it('returns null when the user closes the picker', async () => {
  signIn.mockResolvedValueOnce({ type: 'cancelled', data: null });
  await expect(pickGoogleAccount()).resolves.toBeNull();

  signIn.mockRejectedValueOnce({ code: 'SIGN_IN_CANCELLED' });
  await expect(pickGoogleAccount()).resolves.toBeNull();

  signIn.mockRejectedValueOnce({ code: 'IN_PROGRESS' }); // double tap
  await expect(pickGoogleAccount()).resolves.toBeNull();
});

it('turns other failures into an ApiError', async () => {
  signIn.mockRejectedValueOnce({ code: 'PLAY_SERVICES_NOT_AVAILABLE' });
  await expect(pickGoogleAccount()).rejects.toBeInstanceOf(ApiError);

  signIn.mockResolvedValueOnce({ type: 'success', data: { idToken: null } });
  await expect(pickGoogleAccount()).rejects.toBeInstanceOf(ApiError);
});

it('forgets the account on log-out so the next sign-in asks again', async () => {
  await forgetGoogleAccount();
  expect(GoogleSignin.signOut).toHaveBeenCalled();
});
