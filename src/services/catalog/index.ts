import { config } from '@/config';
import { httpCatalogService } from './http';
import { mockCatalogService } from './mock';
import type { CatalogService } from './types';

export type { CatalogService } from './types';

export const catalogService: CatalogService = config.useMockApi
  ? mockCatalogService
  : httpCatalogService;
