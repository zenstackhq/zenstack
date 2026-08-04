import type { SchemaDef } from '@zenstackhq/schema';
import { match } from 'ts-pattern';
import type { ClientContract } from '../../contract';
import type { ClientOptions } from '../../options';
import type { BaseCrudDialect } from './base-dialect';
import { MySqlCrudDialect } from './mysql';
import { PostgresCrudDialect } from './postgresql';
import { SqliteCrudDialect } from './sqlite';

export function getCrudDialect<Schema extends SchemaDef>(
    schema: Schema,
    options: ClientOptions<Schema>,
    client?: ClientContract<Schema>,
): BaseCrudDialect<Schema> {
    return match(schema.provider.type)
        .with('sqlite', () => new SqliteCrudDialect(schema, options, client))
        .with('postgresql', () => new PostgresCrudDialect(schema, options, client))
        .with('mysql', () => new MySqlCrudDialect(schema, options, client))
        .exhaustive();
}
