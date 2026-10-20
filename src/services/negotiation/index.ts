import { config } from '@/config';
import { httpNegotiationService } from './http';
import { mockNegotiationService } from './mock';
import type { NegotiationService } from './types';

export type { NegotiationService } from './types';

export const negotiationService: NegotiationService = config.mock.negotiation
  ? mockNegotiationService
  : httpNegotiationService;
