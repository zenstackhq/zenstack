import type { SchemaDef } from '@zenstackhq/schema';
import { match } from 'ts-pattern';
import type { ClientContract } from '../../contract';
import type { ClientOptions } from '../../options';
import type { BaseCrudDialect, CrudDialectArgs } from './base-dialect';
import { MySqlCrudDialect } from './mysql';
import { PostgresCrudDialect } from './postgresql';
import { SqliteCrudDialect } from './sqlite';

/**
 * Creates a CRUD dialect for the client's provider. Schema and options are taken from the
 * client, which is also handed to computed field implementations, so prefer this overload
 * whenever a client is available.
 */
export function getCrudDialect<Schema extends SchemaDef>(client: ClientContract<Schema>): BaseCrudDialect<Schema>;

/**
 * Creates a CRUD dialect from a standalone schema/options pair, for uses that have no client
 * (e.g. output transformation). Such a dialect cannot evaluate computed fields.
 */
export function getCrudDialect<Schema extends SchemaDef>(
    schema: Schema,
    options: ClientOptions<Schema>,
): BaseCrudDialect<Schema>;

export function getCrudDialect<Schema extends SchemaDef>(...args: CrudDialectArgs<Schema>): BaseCrudDialect<Schema> {
    const schema = args.length === 1 ? args[0].$schema : args[0];
    return match(schema.provider.type)
        .with('sqlite', () => new SqliteCrudDialect(...args))
        .with('postgresql', () => new PostgresCrudDialect(...args))
        .with('mysql', () => new MySqlCrudDialect(...args))
        .exhaustive();
}
