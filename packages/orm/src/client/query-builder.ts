import type Decimal from 'decimal.js';
import type { Generated, Kysely } from 'kysely';
import type {
    FieldHasDefault,
    ForeignKeyFields,
    GetModelField,
    GetModelFields,
    GetModelFieldType,
    GetModels,
    ModelFieldIsOptional,
    ScalarFields,
    SchemaDef,
} from '@zenstackhq/schema';

export type ToKyselySchema<Schema extends SchemaDef> = {
    [Model in GetModels<Schema>]: ToKyselyTable<Schema, Model>;
};

export type ToKysely<Schema extends SchemaDef> = Kysely<ToKyselySchema<Schema>>;

type ToKyselyTable<Schema extends SchemaDef, Model extends GetModels<Schema>> = {
    [Field in ScalarFields<Schema, Model, false> | ForeignKeyFields<Schema, Model> as GetModelField<
        Schema,
        Model,
        Field
    >['originModel'] extends string
        ? // query builder should not see fields inherited from delegate base model
          never
        : Field]: toKyselyFieldType<Schema, Model, Field>;
};

export type MapBaseType<T> = T extends 'String'
    ? string
    : T extends 'Boolean'
      ? boolean
      : T extends 'Int' | 'Float'
        ? number
        : T extends 'BigInt'
          ? bigint
          : T extends 'Decimal'
            ? Decimal
            : T extends 'DateTime'
              ? string
              : unknown;

type WrapNull<T, Null> = Null extends true ? T | null : T;

type MapType<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends GetModelFields<Schema, Model>,
> = WrapNull<MapBaseType<GetModelFieldType<Schema, Model, Field>>, ModelFieldIsOptional<Schema, Model, Field>>;

type toKyselyFieldType<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends GetModelFields<Schema, Model>,
> =
    FieldHasDefault<Schema, Model, Field> extends true
        ? Generated<MapType<Schema, Model, Field>>
        : MapType<Schema, Model, Field>;
