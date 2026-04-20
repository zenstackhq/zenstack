import type { SchemaDef } from '@zenstackhq/schema';
import { match } from 'ts-pattern';
import type { ClientOptions } from '../../options';
import type { BaseCrudDialect } from './base-dialect';
import { MySqlCrudDialect } from './mysql';
import { PostgresCrudDialect } from './postgresql';
import { SqliteCrudDialect } from './sqlite';

export function getCrudDialect<Schema extends SchemaDef>(
    schema: Schema,
    options: ClientOptions<Schema>,
): BaseCrudDialect<Schema> {
    return match(schema.provider.type)
        .with('sqlite', () => new SqliteCrudDialect(schema, options))
        .with('postgresql', () => new PostgresCrudDialect(schema, options))
        .with('mysql', () => new MySqlCrudDialect(schema, options))
        .exhaustive();
}
