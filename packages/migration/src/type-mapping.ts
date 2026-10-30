/**
 * Maps column snapshots to their physical, provider-specific SQL type text — default scalar
 * mappings, `@db.*` native-type overrides, enum representation, serial auto-increment
 * pseudo-types, and arrays.
 */

import type { DataSourceProviderType } from '@zenstackhq/schema';
import { providerTraits } from './provider-traits';
import type { ColumnSnapshot, EnumSnapshot, NativeTypeSnapshot, Snapshot } from './types';

type Provider = DataSourceProviderType;

/** Kysely `ColumnDataType` literals that are safe to emit as a plain quoted string. */
const KYSELY_BUILTIN_TYPES = new Set([
    'text',
    'integer',
    'boolean',
    'bigint',
    'real',
    'decimal',
    'timestamp',
    'json',
    'jsonb',
    'blob',
    'serial',
]);

/** Raw SQL text of the physical column type for a given provider. */
export function sqlTypeText(provider: Provider, column: ColumnSnapshot, snapshot: Snapshot): string {
    const traits = providerTraits(provider);
    let base: string;
    if (column.isEnum) {
        base = enumTypeText(provider, snapshot.enums[column.type]);
    } else if (traits.serialAutoIncrement && column.autoIncrement) {
        base = serialTypeText(column);
    } else if (column.nativeType && traits.supportsNativeTypes) {
        // an explicit `@db.*` native type overrides the default mapping.
        base = renderNativeType(column.nativeType);
    } else if (column.isJson) {
        base = traits.scalarTypes['Json']!;
    } else {
        // fall back to text for unknown/unsupported types
        base = traits.scalarTypes[column.type] ?? 'text';
    }
    return column.array ? `${base}[]` : base;
}

/** Emits the column type as a TypeScript expression (a quoted string or a ``sql`...` `` call). */
export function emitColumnType(provider: Provider, column: ColumnSnapshot, snapshot: Snapshot): string {
    const text = sqlTypeText(provider, column, snapshot);
    if (KYSELY_BUILTIN_TYPES.has(text)) {
        return `'${text}'`;
    }
    return `sql\`${text}\``;
}

/** Serial-family auto-increment pseudo-types (`serialAutoIncrement` providers), honoring a native small/big int type. */
function serialTypeText(column: ColumnSnapshot): string {
    // TODO: the type mapping is pg-specific so not ideal
    const nativeName = column.nativeType?.name;
    if (nativeName === 'SmallInt') {
        return 'smallserial';
    }
    if (nativeName === 'BigInt' || column.type === 'BigInt') {
        return 'bigserial';
    }
    return 'serial';
}

/**
 * Renders a Prisma-style native type to its concrete SQL type text. Most names map by
 * lower-casing and appending arguments (`VarChar(200)` -> `varchar(200)`); a handful need
 * special handling.
 */
function renderNativeType(nativeType: NativeTypeSnapshot): string {
    const special = NATIVE_TYPE_SPECIAL[nativeType.name];
    if (special) {
        return special(nativeType.args);
    }
    const args = nativeType.args.length > 0 ? `(${nativeType.args.join(', ')})` : '';
    return nativeType.name.toLowerCase() + args;
}

/** Native types whose SQL text is not simply `lowercase(name)(args)`. */
const NATIVE_TYPE_SPECIAL: Record<string, (args: Array<string | number>) => string> = {
    DoublePrecision: () => 'double precision',
    UnsignedInt: () => 'int unsigned',
    UnsignedSmallInt: () => 'smallint unsigned',
    UnsignedMediumInt: () => 'mediumint unsigned',
    UnsignedBigInt: () => 'bigint unsigned',
    UnsignedTinyInt: (args) => `tinyint${args.length > 0 ? `(${args.join(', ')})` : ''} unsigned`,
};

/** The type text of an enum column, per the provider's enum representation strategy. */
function enumTypeText(provider: Provider, enumDef: EnumSnapshot | undefined): string {
    const strategy = providerTraits(provider).enumStrategy;
    if (strategy === 'native' && enumDef) {
        return `"${enumDef.name}"`;
    }
    if (strategy === 'inline' && enumDef) {
        return `enum(${enumDef.values.map((v) => `'${v}'`).join(', ')})`;
    }
    return 'text';
}
