// What the app needs for accounts, whoever answers (mock or API).

import type { LocalPhoto, Session, User } from '@/lib/types';

export type EmailSignUp = { name: string; email: string; password: string };
export type EmailLogIn = { email: string; password: string };
export type IdSignUpInput = {
  idPhoto: LocalPhoto;
  name: string;
  email: string;
  password?: string;
};
export type SendOtpInput = { email: string };
export type VerifyOtpInput = { email: string; code: string };
export type ProfilePatch = Partial<Pick<User, 'name' | 'cityId'>>;

export interface AuthService {
  signUpWithEmail(input: EmailSignUp): Promise<Session>;
  logInWithEmail(input: EmailLogIn): Promise<Session>;
  /** Create a verified account from a photo of the national ID and user's email. */
  signUpWithId(input: IdSignUpInput | LocalPhoto): Promise<Session>;
  /** Social log-in with Google. */
  logInWithGoogle(idToken?: string): Promise<Session>;
  /** Social log-in with Apple. */
  logInWithApple(idToken?: string): Promise<Session>;
  /** Request an OTP code to be sent to the user's email. */
  sendOtp(input: SendOtpInput): Promise<void>;
  /** Verify OTP code and sign in. */
  verifyOtp(input: VerifyOtpInput): Promise<Session>;
  /** Verify the signed-in (email) account with a photo of the national ID. */
  verifyId(idPhoto: LocalPhoto): Promise<User>;
  /** The signed-in account, fresh from the server. */
  getMe(): Promise<User>;
  updateProfile(patch: ProfilePatch): Promise<User>;
  /** Upload a new profile photo. */
  changeAvatar(photo: LocalPhoto): Promise<User>;
  /**
   * Attach a card to the account. Takes the payment provider's token
   * (services/payments), never the card number.
   */
  savePaymentCard(cardToken: string): Promise<User>;
  removePaymentCard(): Promise<User>;
  logOut(): Promise<void>;
}
