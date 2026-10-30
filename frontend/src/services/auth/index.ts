import { config } from '@/config';
import { httpAuthService } from './http';
import { mockAuthService } from './mock';
import type { AuthService } from './types';

export type {
  AuthService,
  EmailLogIn,
  EmailSignUp,
  ProfilePatch,
} from './types';

export const authService: AuthService = config.mock.auth
  ? mockAuthService
  : httpAuthService;
