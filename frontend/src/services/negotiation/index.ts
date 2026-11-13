import { config } from '@/config';
import { httpNegotiationService } from './http';
import type { NegotiationService } from './types';

export type { NegotiationService } from './types';

// Debug builds only: in release __DEV__ is false, so the mock and its demo data aren't even bundled.
export const negotiationService: NegotiationService =
  __DEV__ && config.mock.negotiation
    ? require('./mock').mockNegotiationService
    : httpNegotiationService;
