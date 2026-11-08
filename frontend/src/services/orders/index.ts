import { config } from '@/config';
import { httpOrdersService } from './http';
import type { OrdersService } from './types';

export type { CreateOrderInput, OrdersService } from './types';

// Debug builds only: in release __DEV__ is false, so the mock and its demo data aren't even bundled.
export const ordersService: OrdersService =
  __DEV__ && config.mock.orders
    ? require('./mock').mockOrdersService
    : httpOrdersService;
