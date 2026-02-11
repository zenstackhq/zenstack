import type { DataSourceProviderType } from '@zenstackhq/schema';
export * from './provider';

import { mysql } from './mysql';
import { postgresql } from './postgresql';
import type { IntrospectionProvider } from './provider';
import { sqlite } from './sqlite';

export const providers: Record<DataSourceProviderType, IntrospectionProvider> = {
    mysql,
    postgresql,
    sqlite,
};
