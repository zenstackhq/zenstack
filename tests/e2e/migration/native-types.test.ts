import { ExpressionUtils, type AttributeApplication, type FieldDef, type SchemaDef } from '@zenstackhq/schema';
import { describe, expect, it } from 'vitest';
import { buildSnapshot, diffSnapshots, emptySnapshot, generateMigrateBody } from '@zenstackhq/migration';

type Provider = 'sqlite' | 'postgresql' | 'mysql';

function nativeAttr(name: string, ...args: Array<string | number>): AttributeApplication {
    return { name: `@db.${name}`, args: args.map((a) => ({ value: ExpressionUtils.literal(a) })) };
}

/** Builds the `migrate` body for a single-model schema with the given fields. */
function migrateSql(provider: Provider, fields: Record<string, FieldDef>): string {
    const schema: SchemaDef = {
        provider: { type: provider },
        plugins: {},
        models: {
            M: { name: 'M', fields, idFields: ['id'], uniqueFields: {} },
        },
    };
    const snapshot = buildSnapshot(schema);
    const changes = diffSnapshots(emptySnapshot(provider), snapshot);
    return generateMigrateBody(changes, provider, snapshot);
}

const id = (extra?: Partial<FieldDef>): FieldDef => ({
    name: 'id',
    type: 'Int',
    id: true,
    default: ExpressionUtils.call('autoincrement'),
    ...extra,
});

describe('native @db.* type mapping', () => {
    it('maps PostgreSQL native types', () => {
        const sql = migrateSql('postgresql', {
            id: id(),
            title: { name: 'title', type: 'String', attributes: [nativeAttr('VarChar', 200)] },
            uid: { name: 'uid', type: 'String', attributes: [nativeAttr('Uuid')] },
            price: { name: 'price', type: 'Decimal', attributes: [nativeAttr('Decimal', 10, 2)] },
            ts: { name: 'ts', type: 'DateTime', attributes: [nativeAttr('Timestamptz', 6)] },
            note: { name: 'note', type: 'String', attributes: [nativeAttr('Citext')] },
            small: { name: 'small', type: 'Int', attributes: [nativeAttr('SmallInt')] },
            big: { name: 'big', type: 'Float', attributes: [nativeAttr('DoublePrecision')] },
        });
        expect(sql).toContain('varchar(200)');
        expect(sql).toContain('uuid');
        expect(sql).toContain('decimal(10, 2)');
        expect(sql).toContain('timestamptz(6)');
        expect(sql).toContain('citext');
        expect(sql).toContain('smallint');
        expect(sql).toContain('double precision');
    });

    it('maps MySQL native types including unsigned variants', () => {
        const sql = migrateSql('mysql', {
            id: id(),
            count: { name: 'count', type: 'Int', attributes: [nativeAttr('UnsignedInt')] },
            flag: { name: 'flag', type: 'Int', attributes: [nativeAttr('TinyInt', 1)] },
            body: { name: 'body', type: 'String', attributes: [nativeAttr('LongText')] },
        });
        expect(sql).toContain('int unsigned');
        expect(sql).toContain('tinyint(1)');
        expect(sql).toContain('longtext');
    });

    it('uses smallserial/bigserial for PG auto-increment with a native int size', () => {
        expect(migrateSql('postgresql', { id: id({ attributes: [nativeAttr('SmallInt')] }) })).toContain('smallserial');
        expect(migrateSql('postgresql', { id: id({ type: 'BigInt' }) })).toContain('bigserial');
    });

    it('falls back to the default mapping without @db, and ignores native types on SQLite', () => {
        // no @db on PG -> default String is `text`
        expect(migrateSql('postgresql', { id: id(), name: { name: 'name', type: 'String' } })).toContain("'text'");

        // SQLite is dynamically typed: native types are ignored, default applies
        const sqlite = migrateSql('sqlite', {
            id: id(),
            title: { name: 'title', type: 'String', attributes: [nativeAttr('VarChar', 200)] },
        });
        expect(sqlite).not.toContain('varchar');
        expect(sqlite).toContain("'text'");
    });
});
