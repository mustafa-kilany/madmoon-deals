import { config } from '@/config';
import { httpAuthService } from './http';
import type { AuthService } from './types';

export type {
  AuthService,
  EmailLogIn,
  EmailSignUp,
  PayoutAccount,
  PayoutAccountInput,
  ProfilePatch,
} from './types';

// Debug builds only: in release __DEV__ is false, so the mock and its demo data aren't even bundled.
export const authService: AuthService =
  __DEV__ && config.mock.auth
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./mock').mockAuthService
    : httpAuthService;
