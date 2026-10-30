import type { DataSourceProviderType } from '@zenstackhq/schema';
import { introspectMysql } from './mysql';
import { introspectPostgresql } from './postgresql';
import { introspectSqlite } from './sqlite';
import type { IntrospectedSchema, IntrospectOptions } from './types';

export * from './casing';
export * from './types';

/** Introspects a live database into an {@link IntrospectedSchema} for the given provider. */
export function introspect(
    provider: DataSourceProviderType,
    connectionString: string,
    options: IntrospectOptions,
): Promise<IntrospectedSchema> {
    switch (provider) {
        case 'postgresql':
            return introspectPostgresql(connectionString, options);
        case 'mysql':
            return introspectMysql(connectionString, options);
        case 'sqlite':
            return introspectSqlite(connectionString, options);
    }
}
