import { config } from '@/config';
import { httpCourierService } from './http';
import { mockCourierService } from './mock';
import type { CourierService } from './types';

export type { CourierService } from './types';

export const courierService: CourierService = config.mock.courier
  ? mockCourierService
  : httpCourierService;
