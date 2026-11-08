import { config } from '@/config';
import { httpCourierService } from './http';
import type { CourierService } from './types';

export type { CourierService } from './types';

// Debug builds only: in release __DEV__ is false, so the mock and its demo data aren't even bundled.
export const courierService: CourierService =
  __DEV__ && config.mock.courier
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./mock').mockCourierService
    : httpCourierService;
