import { config } from '@/config';
import { httpCatalogService } from './http';
import type { CatalogService } from './types';

export type { CatalogService } from './types';

// Debug builds only: in release __DEV__ is false, so the mock and its demo data aren't even bundled.
export const catalogService: CatalogService =
  __DEV__ && config.mock.catalog
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./mock').mockCatalogService
    : httpCatalogService;
