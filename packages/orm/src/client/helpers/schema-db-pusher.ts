import { invariant } from '@zenstackhq/common-helpers';
import { CreateTableBuilder, sql, type ColumnDataType, type OnModifyForeignAction, type RawBuilder } from 'kysely';
import toposort from 'toposort';
import { match } from 'ts-pattern';
import {
    ExpressionUtils,
    type BuiltinType,
    type CascadeAction,
    type EnumDef,
    type FieldDef,
    type ModelDef,
    type SchemaDef,
} from '../../schema';
import type { ToKysely } from '../query-builder';
import { isUnsupportedField, requireModel } from '../query-utils';

/**
 * This class is for testing purposes only. It should never be used in production.
 *
 * @private
 */
export class SchemaDbPusher<Schema extends SchemaDef> {
    constructor(
        private readonly schema: Schema,
        private readonly kysely: ToKysely<Schema>,
    ) {}

    async push() {
        await this.kysely.transaction().execute(async (tx) => {
            if (this.schema.enums && this.providerSupportsNativeEnum) {
                for (const enumDef of Object.values(this.schema.enums)) {
                    let enumValues: string[];
                    if (enumDef.fields) {
                        enumValues = Object.values(enumDef.fields).map((f) => {
                            const mapAttr = f.attributes?.find((a) => a.name === '@map');
                            if (!mapAttr || !mapAttr.args?.[0]) {
                                return f.name;
                            } else {
                                const mappedName = ExpressionUtils.getLiteralValue(mapAttr.args[0].value);
                                invariant(
                                    mappedName && typeof mappedName === 'string',
                                    `Invalid @map attribute for enum field ${f.name}`,
                                );
                                return mappedName;
                            }
                        });
                    } else {
                        enumValues = Object.values(enumDef.values);
                    }

                    const createEnum = tx.schema.createType(this.getEnumName(enumDef)).asEnum(enumValues);
                    await createEnum.execute();
                }
            }

            // sort models so that target of fk constraints are created first
            const models = Object.values(this.schema.models).filter((m) => !m.isView);
            const sortedModels = this.sortModels(models);
            for (const modelDef of sortedModels) {
                const createTable = this.createModelTable(tx, modelDef);
                await createTable.execute();
            }
        });
    }

    private get providerSupportsNativeEnum() {
        return ['postgresql'].includes(this.schema.provider.type);
    }

    private sortModels(models: ModelDef[]): ModelDef[] {
        const graph: [ModelDef, ModelDef | undefined][] = [];

        for (const model of models) {
            let added = false;

            if (model.baseModel) {
                // base model should be created before concrete model
                const baseDef = requireModel(this.schema, model.baseModel);
                // edge: concrete model -> base model
                graph.push([model, baseDef]);
                added = true;
            }

            for (const field of Object.values(model.fields)) {
                // relation order
                if (field.relation && field.relation.fields && field.relation.references) {
                    // skip self-referential relations to avoid false cycle in toposort
                    if (field.type === model.name) {
                        continue;
                    }
                    const targetModel = requireModel(this.schema, field.type);
                    // edge: fk side -> target model
                    graph.push([model, targetModel]);
                    added = true;
                }
            }

            if (!added) {
                // no relations, add self to graph to ensure it is included in the result
                graph.push([model, undefined]);
            }
        }

        return toposort(graph)
            .reverse()
            .filter((m) => !!m);
    }

    private createModelTable(kysely: ToKysely<Schema>, modelDef: ModelDef) {
        let table: CreateTableBuilder<string, any> = kysely.schema
            .createTable(this.getTableName(modelDef))
            .ifNotExists();

        for (const [fieldName, fieldDef] of Object.entries(modelDef.fields)) {
            if (fieldDef.originModel && !fieldDef.id) {
                // skip non-id fields inherited from base model
                continue;
            }

            if (isUnsupportedField(fieldDef)) {
                // Unsupported fields cannot be represented in the ORM's schema pusher
                continue;
            }

            if (fieldDef.relation) {
                table = this.addForeignKeyConstraint(table, modelDef.name, fieldName, fieldDef);
            } else if (!this.isComputedField(fieldDef)) {
                table = this.createModelField(table, fieldDef, modelDef);
            }
        }

        if (modelDef.baseModel) {
            // create fk constraint
            const baseModelDef = requireModel(this.schema, modelDef.baseModel);
            table = table.addForeignKeyConstraint(
                `fk_${modelDef.baseModel}_${modelDef.name}_delegate`,
                baseModelDef.idFields as string[],
                modelDef.baseModel,
                baseModelDef.idFields as string[],
                (cb) => cb.onDelete('cascade').onUpdate('cascade'),
            );
        }

        table = this.addPrimaryKeyConstraint(table, modelDef);
        table = this.addUniqueConstraint(table, modelDef);

        return table;
    }

    private getTableName(modelDef: ModelDef) {
        const mapAttr = modelDef.attributes?.find((a) => a.name === '@@map');
        if (mapAttr && mapAttr.args?.[0]) {
            const mappedName = ExpressionUtils.getLiteralValue(mapAttr.args[0].value);
            if (mappedName) {
                return mappedName as string;
            }
        }
        return modelDef.name;
    }

    private getEnumName(enumDef: EnumDef) {
        const mapAttr = enumDef.attributes?.find((a) => a.name === '@@map');
        if (mapAttr && mapAttr.args?.[0]) {
            const mappedName = ExpressionUtils.getLiteralValue(mapAttr.args[0].value);
            if (mappedName) {
                return mappedName as string;
            }
        }
        return enumDef.name;
    }

    private getColumnName(fieldDef: FieldDef) {
        const mapAttr = fieldDef.attributes?.find((a) => a.name === '@map');
        if (mapAttr && mapAttr.args?.[0]) {
            const mappedName = ExpressionUtils.getLiteralValue(mapAttr.args[0].value);
            if (mappedName) {
                return mappedName as string;
            }
        }
        return fieldDef.name;
    }

    private isComputedField(fieldDef: FieldDef) {
        return fieldDef.attributes?.some((a) => a.name === '@computed');
    }

    private addPrimaryKeyConstraint(table: CreateTableBuilder<string, any>, modelDef: ModelDef) {
        if (modelDef.idFields.length === 1) {
            if (Object.values(modelDef.fields).some((f) => f.id)) {
                // @id defined at field level
                return table;
            }
        }

        if (modelDef.idFields.length > 0) {
            table = table.addPrimaryKeyConstraint(
                `pk_${modelDef.name}`,
                modelDef.idFields.map((f) => this.getColumnName(modelDef.fields[f]!)),
            );
        }

        return table;
    }

    private addUniqueConstraint(table: CreateTableBuilder<string, any>, modelDef: ModelDef) {
        for (const [key, value] of Object.entries(modelDef.uniqueFields)) {
            invariant(typeof value === 'object', 'expecting an object');
            if ('type' in value) {
                // uni-field constraint, check if it's already defined at field level
                const fieldDef = modelDef.fields[key]!;
                if (fieldDef.unique) {
                    continue;
                }
                if (fieldDef.originModel && fieldDef.originModel !== modelDef.name) {
                    // field is inherited from a base model, skip
                    continue;
                }
                table = table.addUniqueConstraint(`unique_${modelDef.name}_${key}`, [this.getColumnName(fieldDef)]);
            } else {
                // multi-field constraint, if any field is inherited from base model, skip
                if (
                    Object.keys(value).some((f) => {
                        const fDef = modelDef.fields[f]!;
                        return fDef.originModel && fDef.originModel !== modelDef.name;
                    })
                ) {
                    continue;
                }
                table = table.addUniqueConstraint(
                    `unique_${modelDef.name}_${key}`,
                    Object.keys(value).map((f) => this.getColumnName(modelDef.fields[f]!)),
                );
            }
        }
        return table;
    }

    private createModelField(table: CreateTableBuilder<any>, fieldDef: FieldDef, modelDef: ModelDef) {
        return table.addColumn(this.getColumnName(fieldDef), this.mapFieldType(fieldDef), (col) => {
            // @id
            if (fieldDef.id && modelDef.idFields.length === 1) {
                col = col.primaryKey();
            }

            // @default
            if (fieldDef.default !== undefined && this.isDefaultValueSupportedForType(fieldDef.type)) {
                if (typeof fieldDef.default === 'object' && 'kind' in fieldDef.default) {
                    if (ExpressionUtils.isCall(fieldDef.default) && fieldDef.default.function === 'now') {
                        col =
                            this.schema.provider.type === 'mysql'
                                ? col.defaultTo(sql`CURRENT_TIMESTAMP(3)`)
                                : col.defaultTo(sql`CURRENT_TIMESTAMP`);
                    }
                } else {
                    if (
                        this.schema.provider.type === 'mysql' &&
                        fieldDef.type === 'DateTime' &&
                        typeof fieldDef.default === 'string'
                    ) {
                        const defaultValue = new Date(fieldDef.default).toISOString().replace('Z', '+00:00');
                        col = col.defaultTo(defaultValue);
                    } else {
                        col = col.defaultTo(fieldDef.default);
                    }
                }
            }

            // @unique
            if (fieldDef.unique) {
                col = col.unique();
            }

            // nullable
            if (!fieldDef.optional && !fieldDef.array) {
                col = col.notNull();
            }

            if (this.isAutoIncrement(fieldDef) && this.columnSupportsAutoIncrement()) {
                col = col.autoIncrement();
            }

            return col;
        });
    }

    private isDefaultValueSupportedForType(type: string) {
        return match(this.schema.provider.type)
            .with('postgresql', () => true)
            .with('sqlite', () => true)
            .with('mysql', () => !['Json', 'Bytes'].includes(type))
            .exhaustive();
    }

    private mapFieldType(fieldDef: FieldDef) {
        if (this.schema.enums?.[fieldDef.type]) {
            if (this.schema.provider.type === 'postgresql') {
                return sql.ref(fieldDef.type);
            } else if (this.schema.provider.type === 'mysql') {
                // MySQL requires inline ENUM definition
                const enumDef = this.schema.enums[fieldDef.type]!;
                let enumValues: string[];
                if (enumDef.fields) {
                    enumValues = Object.values(enumDef.fields).map((f) => {
                        const mapAttr = f.attributes?.find((a) => a.name === '@map');
                        if (!mapAttr || !mapAttr.args?.[0]) {
                            return f.name;
                        } else {
                            const mappedName = ExpressionUtils.getLiteralValue(mapAttr.args[0].value);
                            invariant(
                                mappedName && typeof mappedName === 'string',
                                `Invalid @map attribute for enum field ${f.name}`,
                            );
                            return mappedName;
                        }
                    });
                } else {
                    enumValues = Object.values(enumDef.values);
                }
                return sql.raw(`enum(${enumValues.map((v) => `'${v}'`).join(', ')})`);
            } else {
                return 'text';
            }
        }

        if (this.isAutoIncrement(fieldDef) && this.schema.provider.type === 'postgresql') {
            return 'serial';
        }

        if (this.isCustomType(fieldDef.type)) {
            return this.jsonType;
        }

        const type = fieldDef.type as BuiltinType;
        const result = match<BuiltinType, ColumnDataType | RawBuilder<unknown>>(type)
            .with('String', () => this.stringType)
            .with('Boolean', () => this.booleanType)
            .with('Int', () => this.intType)
            .with('Float', () => this.floatType)
            .with('BigInt', () => this.bigIntType)
            .with('Decimal', () => this.decimalType)
            .with('DateTime', () => this.dateTimeType)
            .with('Bytes', () => this.bytesType)
            .with('Json', () => this.jsonType)
            .otherwise(() => {
                throw new Error(`Unsupported field type: ${type}`);
            });

        if (fieldDef.array) {
            // Kysely doesn't support array type natively
            return sql.raw(`${result}[]`);
        } else {
            return result as ColumnDataType;
        }
    }

    private isCustomType(type: string) {
        return this.schema.typeDefs && Object.values(this.schema.typeDefs).some((def) => def.name === type);
    }

    private isAutoIncrement(fieldDef: FieldDef) {
        return (
            fieldDef.default &&
            ExpressionUtils.isCall(fieldDef.default) &&
            fieldDef.default.function === 'autoincrement'
        );
    }

    private addForeignKeyConstraint(
        table: CreateTableBuilder<string, any>,
        model: string,
        fieldName: string,
        fieldDef: FieldDef,
    ) {
        invariant(fieldDef.relation, 'field must be a relation');

        if (!fieldDef.relation.fields || !fieldDef.relation.references) {
            // not fk side
            return table;
        }

        const modelDef = requireModel(this.schema, model);
        const relationModelDef = requireModel(this.schema, fieldDef.type);

        table = table.addForeignKeyConstraint(
            `fk_${model}_${fieldName}`,
            fieldDef.relation.fields.map((f) => this.getColumnName(modelDef.fields[f]!)),
            this.getTableName(relationModelDef),
            fieldDef.relation.references.map((f) => this.getColumnName(relationModelDef.fields[f]!)),
            (cb) => {
                if (fieldDef.relation?.onDelete) {
                    cb = cb.onDelete(this.mapCascadeAction(fieldDef.relation.onDelete));
                } else if (fieldDef.optional) {
                    cb = cb.onDelete('set null');
                } else {
                    cb = cb.onDelete('restrict');
                }

                if (fieldDef.relation?.onUpdate) {
                    cb = cb.onUpdate(this.mapCascadeAction(fieldDef.relation.onUpdate));
                } else {
                    cb = cb.onUpdate('cascade');
                }
                return cb;
            },
        );
        return table;
    }

    private mapCascadeAction(action: CascadeAction) {
        return match<CascadeAction, OnModifyForeignAction>(action)
            .with('SetNull', () => 'set null')
            .with('Cascade', () => 'cascade')
            .with('Restrict', () => 'restrict')
            .with('NoAction', () => 'no action')
            .with('SetDefault', () => 'set default')
            .exhaustive();
    }

    // #region Type mappings and capabilities

    private get jsonType(): ColumnDataType {
        return match<string, ColumnDataType>(this.schema.provider.type)
            .with('mysql', () => 'json')
            .otherwise(() => 'jsonb');
    }

    private get bytesType(): ColumnDataType {
        return match<string, ColumnDataType>(this.schema.provider.type)
            .with('postgresql', () => 'bytea')
            .with('mysql', () => 'blob')
            .otherwise(() => 'blob');
    }

    private get stringType() {
        return match<string, ColumnDataType | RawBuilder<unknown>>(this.schema.provider.type)
            .with('mysql', () => sql.raw('varchar(255)'))
            .otherwise(() => 'text');
    }

    private get booleanType() {
        return match<string, ColumnDataType | RawBuilder<unknown>>(this.schema.provider.type)
            .with('mysql', () => sql.raw('tinyint(1)'))
            .otherwise(() => 'boolean');
    }

    private get intType(): ColumnDataType {
        return 'integer';
    }

    private get floatType() {
        return match<string, ColumnDataType | RawBuilder<unknown>>(this.schema.provider.type)
            .with('postgresql', () => 'double precision')
            .with('mysql', () => sql.raw('double'))
            .otherwise(() => 'real');
    }

    private get bigIntType(): ColumnDataType {
        return 'bigint';
    }

    private get decimalType() {
        return match<string, ColumnDataType | RawBuilder<unknown>>(this.schema.provider.type)
            .with('mysql', () => sql.raw('decimal(65, 30)'))
            .otherwise(() => 'decimal');
    }

    private get dateTimeType() {
        return match<string, ColumnDataType | RawBuilder<unknown>>(this.schema.provider.type)
            .with('mysql', () => sql.raw('datetime(3)'))
            .otherwise(() => 'timestamp');
    }

    private columnSupportsAutoIncrement() {
        return ['sqlite', 'mysql'].includes(this.schema.provider.type);
    }

    // #endregion
}
