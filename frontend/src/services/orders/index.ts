import { config } from '@/config';
import { httpOrdersService } from './http';
import { mockOrdersService } from './mock';
import type { OrdersService } from './types';

export type { CreateOrderInput, OrdersService } from './types';

export const ordersService: OrdersService = config.mock.orders
  ? mockOrdersService
  : httpOrdersService;
