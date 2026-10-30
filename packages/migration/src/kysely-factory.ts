import path from 'node:path';
import type { DataSourceProviderType } from '@zenstackhq/schema';
import { Kysely, MysqlDialect, PostgresDialect, SqliteDialect, type Dialect } from 'kysely';
import { MigrationError, MigrationErrorReason } from './error';

/**
 * Builds a bare Kysely instance for the given provider and connection URL. Database
 * drivers (`better-sqlite3` / `pg` / `mysql2`) are imported lazily so they remain
 * optional peer dependencies.
 *
 * Relative SQLite `file:` paths are resolved against the current working directory.
 */
export async function createKysely(provider: DataSourceProviderType, url: string): Promise<Kysely<any>> {
    const dialect = await createDialect(provider, url);
    return new Kysely<any>({ dialect });
}

/**
 * Builds a Kysely {@link Dialect} for the given provider and connection URL, importing the
 * database driver lazily. Used both for bare Kysely instances and for constructing a
 * ZenStack client.
 */
export async function createDialect(provider: DataSourceProviderType, url: string): Promise<Dialect> {
    switch (provider) {
        case 'sqlite': {
            let SQLite: typeof import('better-sqlite3');
            try {
                SQLite = (await import('better-sqlite3')).default as unknown as typeof import('better-sqlite3');
            } catch {
                throw new MigrationError(
                    MigrationErrorReason.DRIVER_NOT_FOUND,
                    'Package "better-sqlite3" is required for SQLite support. Install it with: npm install better-sqlite3',
                );
            }
            let resolved = url.trim();
            if (resolved.startsWith('file:')) {
                resolved = path.resolve(resolved.substring('file:'.length));
            }
            return new SqliteDialect({ database: new (SQLite as any)(resolved) });
        }
        case 'postgresql': {
            let Pool: typeof import('pg').Pool;
            try {
                Pool = (await import('pg')).Pool;
            } catch {
                throw new MigrationError(
                    MigrationErrorReason.DRIVER_NOT_FOUND,
                    'Package "pg" is required for PostgreSQL support. Install it with: npm install pg',
                );
            }
            return new PostgresDialect({ pool: new Pool({ connectionString: url }) });
        }
        case 'mysql': {
            let createPool: typeof import('mysql2').createPool;
            try {
                createPool = (await import('mysql2')).createPool;
            } catch {
                throw new MigrationError(
                    MigrationErrorReason.DRIVER_NOT_FOUND,
                    'Package "mysql2" is required for MySQL support. Install it with: npm install mysql2',
                );
            }
            return new MysqlDialect({ pool: createPool(url) });
        }
        default:
            throw new MigrationError(
                MigrationErrorReason.UNSUPPORTED_PROVIDER,
                `Unsupported database provider: ${provider}`,
            );
    }
}
