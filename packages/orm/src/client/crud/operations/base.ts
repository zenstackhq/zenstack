import { createId as cuid2 } from '@paralleldrive/cuid2';
import { clone, enumerate, invariant, isPlainObject } from '@zenstackhq/common-helpers';
import { default as cuid1 } from 'cuid';
import {
    createQueryId,
    DeleteResult,
    expressionBuilder,
    sql,
    UpdateResult,
    type Compilable,
    type ExpressionBuilder,
    type IsolationLevel,
    type QueryResult,
    type SelectQueryBuilder,
} from 'kysely';
import { nanoid } from 'nanoid';
import { match } from 'ts-pattern';
import { ulid } from 'ulid';
import * as uuid from 'uuid';
import type { BuiltinType, Expression, FieldDef } from '../../../schema';
import { ExpressionUtils, type GetModels, type ModelDef, type SchemaDef } from '../../../schema';
import type { AnyKysely } from '../../../utils/kysely-utils';
import { extractFields, fieldsToSelectObject } from '../../../utils/object-utils';
import { NUMERIC_FIELD_TYPES } from '../../constants';
import { TransactionIsolationLevel, type ClientContract, type CRUD } from '../../contract';
import type { FindArgs, SelectIncludeOmit, WhereInput } from '../../crud-types';
import {
    createDBQueryError,
    createInternalError,
    createInvalidInputError,
    createNotFoundError,
    createNotSupportedError,
    ORMError,
    ORMErrorReason,
} from '../../errors';
import type { ToKysely } from '../../query-builder';
import {
    ensureArray,
    extractIdFields,
    flattenCompoundUniqueFilters,
    getDiscriminatorField,
    getField,
    getIdValues,
    getManyToManyRelation,
    getModel,
    getRelationForeignKeyFieldPairs,
    isForeignKeyField,
    isRelationField,
    isScalarField,
    requireField,
    requireIdFields,
    requireModel,
} from '../../query-utils';
import { getCrudDialect } from '../dialects';
import type { BaseCrudDialect } from '../dialects/base-dialect';
import { InputValidator } from '../validator';

/**
 * List of core CRUD operations. It excludes the 'orThrow' variants.
 */
export const CoreCrudOperations = [
    'findMany',
    'findUnique',
    'findFirst',
    'create',
    'createMany',
    'createManyAndReturn',
    'update',
    'updateMany',
    'updateManyAndReturn',
    'upsert',
    'delete',
    'deleteMany',
    'count',
    'aggregate',
    'groupBy',
    'exists',
] as const;

/**
 * List of core CRUD operations. It excludes the 'orThrow' variants.
 */
export type CoreCrudOperations = (typeof CoreCrudOperations)[number];

/**
 * List of core read operations. It excludes the 'orThrow' variants.
 */
export const CoreReadOperations = [
    'findMany',
    'findUnique',
    'findFirst',
    'count',
    'aggregate',
    'groupBy',
    'exists',
] as const;

/**
 * List of core read operations. It excludes the 'orThrow' variants.
 */
export type CoreReadOperations = (typeof CoreReadOperations)[number];

/**
 * List of core write operations.
 */
export const CoreWriteOperations = [
    'create',
    'createMany',
    'createManyAndReturn',
    'update',
    'updateMany',
    'updateManyAndReturn',
    'upsert',
    'delete',
    'deleteMany',
] as const;

/**
 * List of core write operations.
 */
export type CoreWriteOperations = (typeof CoreWriteOperations)[number];

/**
 * List of core create operations.
 */
export const CoreCreateOperations = ['create', 'createMany', 'createManyAndReturn', 'upsert'] as const;

/**
 * List of core create operations.
 */
export type CoreCreateOperations = (typeof CoreCreateOperations)[number];

/**
 * List of core update operations.
 */
export const CoreUpdateOperations = ['update', 'updateMany', 'updateManyAndReturn', 'upsert'] as const;

/**
 * List of core update operations.
 */
export type CoreUpdateOperations = (typeof CoreUpdateOperations)[number];

/**
 * List of core delete operations.
 */
export const CoreDeleteOperations = ['delete', 'deleteMany'] as const;

/**
 * List of core delete operations.
 */
export type CoreDeleteOperations = (typeof CoreDeleteOperations)[number];

/**
 * List of all CRUD operations, including 'orThrow' variants.
 */
export const AllCrudOperations = [...CoreCrudOperations, 'findUniqueOrThrow', 'findFirstOrThrow'] as const;

/**
 * List of all CRUD operations, including 'orThrow' variants.
 */
export type AllCrudOperations = (typeof AllCrudOperations)[number];

/**
 * List of all read operations, including 'orThrow' variants.
 */
export const AllReadOperations = [...CoreReadOperations, 'findUniqueOrThrow', 'findFirstOrThrow'] as const;

/**
 * List of all read operations, including 'orThrow' variants.
 */
export type AllReadOperations = (typeof AllReadOperations)[number];

/**
 * List of all write operations - simply an alias of CoreWriteOperations.
 */
export const AllWriteOperations = CoreWriteOperations;

/**
 * List of all write operations - simply an alias of CoreWriteOperations.
 */
export type AllWriteOperations = CoreWriteOperations;

// context for nested relation operations
export type FromRelationContext = {
    // the model where the relation field is defined
    model: string;
    // the relation field name
    field: string;
    // the parent entity's id fields and values
    ids: any;
    // for relations owned by model, record the parent updates needed after the relation is processed
    parentUpdates: Record<string, unknown>;
};

export abstract class BaseOperationHandler<Schema extends SchemaDef> {
    protected readonly dialect: BaseCrudDialect<Schema>;

    constructor(
        protected readonly client: ClientContract<Schema>,
        protected readonly model: GetModels<Schema>,
        protected readonly inputValidator: InputValidator<Schema>,
    ) {
        this.dialect = getCrudDialect(this.schema, this.client.$options);
    }

    protected get schema() {
        return this.client.$schema;
    }

    protected get options() {
        return this.client.$options;
    }

    protected get kysely(): AnyKysely {
        return this.client.$qb;
    }

    abstract handle(operation: CoreCrudOperations, args: any): Promise<unknown>;

    withClient(client: ClientContract<Schema>) {
        return new (this.constructor as new (...args: any[]) => this)(client, this.model, this.inputValidator);
    }

    // TODO: this is not clean, needs a better solution
    protected get hasPolicyEnabled() {
        return this.options.plugins?.some((plugin) => plugin.constructor.name === 'PolicyPlugin');
    }

    protected requireModel(model: string) {
        return requireModel(this.schema, model);
    }

    protected getModel(model: string) {
        return getModel(this.schema, model);
    }

    protected requireField(model: string, field: string) {
        return requireField(this.schema, model, field);
    }

    protected getField(model: string, field: string) {
        return getField(this.schema, model, field);
    }

    protected async exists(
        kysely: ToKysely<Schema>,
        model: GetModels<Schema>,
        filter: any,
    ): Promise<unknown | undefined> {
        return this.readUnique(kysely, model, {
            where: filter,
            select: this.makeIdSelect(model),
        });
    }

    protected async existsNonUnique(kysely: ToKysely<Schema>, model: GetModels<Schema>, filter: any): Promise<boolean> {
        const query = kysely
            .selectNoFrom((eb) =>
                eb
                    .exists(
                        this.dialect
                            .buildSelectModel(model, model)
                            .select(sql.lit(1).as('$t'))
                            .where(() => this.dialect.buildFilter(model, model, filter)),
                    )
                    .as('exists'),
            )
            .modifyEnd(this.makeContextComment({ model, operation: 'read' }));

        let result: { exists: number | boolean }[] = [];
        const compiled = kysely.getExecutor().compileQuery(query.toOperationNode(), createQueryId());
        try {
            const r = await kysely.getExecutor().executeQuery(compiled);
            result = r.rows as { exists: number | boolean }[];
        } catch (err) {
            throw createDBQueryError(`Failed to execute query: ${err}`, err, compiled.sql, compiled.parameters);
        }

        return !!result[0]?.exists;
    }

    protected async read(
        kysely: AnyKysely,
        model: string,
        args: FindArgs<Schema, GetModels<Schema>, any, true> | undefined,
    ): Promise<any[]> {
        // table
        let query = this.dialect.buildSelectModel(model, model);

        if (args) {
            query = this.dialect.buildFilterSortTake(model, args, query, model);
        }

        // select
        if (args && 'select' in args && args.select) {
            // select is mutually exclusive with omit
            query = this.buildFieldSelection(model, query, args.select, model);
        } else {
            // include all scalar fields except those in omit
            query = this.dialect.buildSelectAllFields(model, query, (args as any)?.omit, model);
        }

        // include
        if (args && 'include' in args && args.include) {
            // note that 'omit' is handled above already
            query = this.buildFieldSelection(model, query, args.include, model);
        }

        query = query.modifyEnd(this.makeContextComment({ model, operation: 'read' }));

        let result: any[] = [];
        const compiled = kysely.getExecutor().compileQuery(query.toOperationNode(), createQueryId());
        try {
            const r = await kysely.getExecutor().executeQuery(compiled);
            result = r.rows;
        } catch (err) {
            throw createDBQueryError(`Failed to execute query: ${err}`, err, compiled.sql, compiled.parameters);
        }

        return result;
    }

    protected async readUnique(kysely: AnyKysely, model: string, args: FindArgs<Schema, GetModels<Schema>, any, true>) {
        const result = await this.read(kysely, model, { ...args, take: 1 });
        return result[0] ?? null;
    }

    private buildFieldSelection(
        model: string,
        query: SelectQueryBuilder<any, any, any>,
        selectOrInclude: Record<string, any>,
        parentAlias: string,
    ) {
        let result = query;

        for (const [field, payload] of Object.entries(selectOrInclude)) {
            if (!payload) {
                continue;
            }

            if (field === '_count') {
                result = this.buildCountSelection(result, model, parentAlias, payload);
                continue;
            }

            const fieldDef = this.requireField(model, field);
            if (!fieldDef.relation) {
                // scalar field
                result = this.dialect.buildSelectField(result, model, parentAlias, field);
            } else {
                if (!fieldDef.array && !fieldDef.optional && payload.where) {
                    throw createInternalError(`Field "${field}" does not support filtering`, model);
                }
                if (fieldDef.originModel) {
                    result = this.dialect.buildRelationSelection(
                        result,
                        fieldDef.originModel,
                        field,
                        fieldDef.originModel,
                        payload,
                    );
                } else {
                    //  regular relation
                    result = this.dialect.buildRelationSelection(result, model, field, parentAlias, payload);
                }
            }
        }

        return result;
    }

    private buildCountSelection(
        query: SelectQueryBuilder<any, any, any>,
        model: string,
        parentAlias: string,
        payload: any,
    ) {
        return query.select((eb) => this.dialect.buildCountJson(model, eb, parentAlias, payload).as('_count'));
    }

    protected async create(
        kysely: AnyKysely,
        model: string,
        data: any,
        fromRelation?: FromRelationContext,
        creatingForDelegate = false,
        returnFields?: readonly string[],
    ): Promise<unknown> {
        const modelDef = this.requireModel(model);

        // additional validations
        if (modelDef.isDelegate && !creatingForDelegate) {
            throw createNotSupportedError(`Model "${model}" is a delegate and cannot be created directly.`);
        }

        let createFields: any = {};
        let updateParent: ((entity: any) => void) | undefined = undefined;

        let m2m: ReturnType<typeof getManyToManyRelation> = undefined;

        if (fromRelation) {
            m2m = getManyToManyRelation(this.schema, fromRelation.model, fromRelation.field);
            if (!m2m) {
                // many-to-many relations are handled after create
                const { ownedByModel, keyPairs } = getRelationForeignKeyFieldPairs(
                    this.schema,
                    fromRelation?.model ?? '',
                    fromRelation?.field ?? '',
                );

                if (!ownedByModel) {
                    // assign fks from parent
                    const parentFkFields = await this.buildFkAssignments(
                        kysely,
                        fromRelation.model,
                        fromRelation.field,
                        fromRelation.ids,
                    );
                    Object.assign(createFields, parentFkFields);
                } else {
                    // record parent fk update after entity is created
                    updateParent = (entity) => {
                        for (const { fk, pk } of keyPairs) {
                            fromRelation.parentUpdates[fk] = entity[pk];
                        }
                    };
                }
            }
        }

        // process the create and handle relations
        const postCreateRelations: Record<string, object> = {};
        for (const [field, value] of Object.entries(data)) {
            const fieldDef = this.requireField(model, field);
            if (isScalarField(this.schema, model, field) || isForeignKeyField(this.schema, model, field)) {
                if (
                    fieldDef.array &&
                    value &&
                    typeof value === 'object' &&
                    'set' in value &&
                    Array.isArray(value.set)
                ) {
                    // deal with nested "set" for scalar lists
                    createFields[field] = this.dialect.transformInput(value.set, fieldDef.type as BuiltinType, true);
                } else {
                    createFields[field] = this.dialect.transformInput(
                        value,
                        fieldDef.type as BuiltinType,
                        !!fieldDef.array,
                    );
                }
            } else {
                const subM2M = getManyToManyRelation(this.schema, model, field);
                if (!subM2M && fieldDef.relation?.fields && fieldDef.relation?.references) {
                    const fkValues = await this.processOwnedRelationForCreate(kysely, fieldDef, value);
                    for (let i = 0; i < fieldDef.relation.fields.length; i++) {
                        createFields[fieldDef.relation.fields[i]!] = fkValues[fieldDef.relation.references[i]!];
                    }
                } else {
                    const subPayload = value;
                    if (subPayload && typeof subPayload === 'object') {
                        postCreateRelations[field] = subPayload;
                    }
                }
            }
        }

        // create delegate base model entity
        if (modelDef.baseModel) {
            const baseCreateResult = await this.processBaseModelCreate(kysely, modelDef.baseModel, createFields, model);
            createFields = baseCreateResult.remainingFields;
        }

        const updatedData = this.fillGeneratedAndDefaultValues(modelDef, createFields);

        // return id fields if no returnFields specified
        returnFields = returnFields ?? requireIdFields(this.schema, model);

        let createdEntity: any;

        if (this.dialect.supportsReturning) {
            const query = kysely
                .insertInto(model)
                .$if(Object.keys(updatedData).length === 0, (qb) =>
                    qb
                        // case for `INSERT INTO ... DEFAULT VALUES` syntax
                        .$if(this.dialect.supportsInsertDefaultValues, () => qb.defaultValues())
                        // case for `INSERT INTO ... VALUES ({})` syntax
                        .$if(!this.dialect.supportsInsertDefaultValues, () => qb.values({})),
                )
                .$if(Object.keys(updatedData).length > 0, (qb) => qb.values(updatedData))
                .returning(returnFields as any)
                .modifyEnd(
                    this.makeContextComment({
                        model,
                        operation: 'create',
                    }),
                );

            createdEntity = await this.executeQueryTakeFirst(kysely, query, 'create');
        } else {
            // Fallback for databases that don't support RETURNING (e.g., MySQL)
            const insertQuery = kysely
                .insertInto(model)
                .$if(Object.keys(updatedData).length === 0, (qb) =>
                    qb
                        // case for `INSERT INTO ... DEFAULT VALUES` syntax
                        .$if(this.dialect.supportsInsertDefaultValues, () => qb.defaultValues())
                        // case for `INSERT INTO ... VALUES ({})` syntax
                        .$if(!this.dialect.supportsInsertDefaultValues, () => qb.values({})),
                )
                .$if(Object.keys(updatedData).length > 0, (qb) => qb.values(updatedData))
                .modifyEnd(
                    this.makeContextComment({
                        model,
                        operation: 'create',
                    }),
                );

            const insertResult = await this.executeQuery(kysely, insertQuery, 'create');

            // Build WHERE clause to find the inserted record
            const idFields = requireIdFields(this.schema, model);
            const idValues: Record<string, any> = {};

            for (const idField of idFields) {
                if (insertResult.insertId !== undefined && insertResult.insertId !== null) {
                    const fieldDef = this.requireField(model, idField);
                    if (this.isAutoIncrementField(fieldDef)) {
                        // auto-generated id value
                        idValues[idField] = insertResult.insertId;
                        continue;
                    }
                }

                if (updatedData[idField] !== undefined) {
                    // ID was provided in the insert
                    idValues[idField] = updatedData[idField];
                } else {
                    throw createInternalError(
                        `Cannot determine ID field "${idField}" value for created model "${model}"`,
                    );
                }
            }

            // for dialects that don't support RETURNING, the outside logic will always
            // read back the created record, we just return the id fields here
            createdEntity = idValues;
        }

        if (Object.keys(postCreateRelations).length > 0) {
            // process nested creates that need to happen after the current entity is created
            for (const [field, subPayload] of Object.entries(postCreateRelations)) {
                await this.processNoneOwnedRelationForCreate(kysely, model, field, subPayload, createdEntity);
            }
        }

        if (fromRelation && m2m) {
            // connect many-to-many relation
            await this.handleManyToManyRelation(
                kysely,
                'connect',
                fromRelation.model,
                fromRelation.field,
                fromRelation.ids,
                m2m.otherModel,
                m2m.otherField,
                createdEntity,
                m2m.joinTable,
            );
        }

        // finally update parent if needed
        if (updateParent) {
            updateParent(createdEntity);
        }

        return createdEntity;
    }

    private isAutoIncrementField(fieldDef: FieldDef) {
        return (
            fieldDef.default &&
            ExpressionUtils.isCall(fieldDef.default) &&
            fieldDef.default.function === 'autoincrement'
        );
    }

    private async processBaseModelCreate(kysely: ToKysely<Schema>, model: string, createFields: any, forModel: string) {
        const thisCreateFields: any = {};
        const remainingFields: any = {};

        Object.entries(createFields).forEach(([field, value]) => {
            const fieldDef = this.getField(model, field);
            if (fieldDef) {
                thisCreateFields[field] = value;
            } else {
                remainingFields[field] = value;
            }
        });

        const discriminatorField = getDiscriminatorField(this.schema, model);
        invariant(discriminatorField, `Base model "${model}" must have a discriminator field`);
        thisCreateFields[discriminatorField] = forModel;

        // create base model entity
        const baseEntity: any = await this.create(
            kysely,
            model as GetModels<Schema>,
            thisCreateFields,
            undefined,
            true,
        );

        // copy over id fields from base model
        const idValues = extractIdFields(baseEntity, this.schema, model);
        Object.assign(remainingFields, idValues);

        return { baseEntity, remainingFields };
    }

    private async buildFkAssignments(kysely: AnyKysely, model: string, relationField: string, entity: any) {
        const parentFkFields: any = {};

        invariant(relationField, 'parentField must be defined if parentModel is defined');
        invariant(entity, 'parentEntity must be defined if parentModel is defined');

        const { keyPairs } = getRelationForeignKeyFieldPairs(this.schema, model, relationField);

        for (const pair of keyPairs) {
            if (!(pair.pk in entity)) {
                // the relation may be using a non-id field as fk, so we read in-place
                // to fetch that field
                const extraRead = await this.readUnique(kysely, model, {
                    where: entity,
                    select: { [pair.pk]: true },
                } as any);
                if (!extraRead) {
                    throw createInternalError(`Field "${pair.pk}" not found in parent created data`, model);
                } else {
                    // update the parent entity
                    Object.assign(entity, extraRead);
                }
            }
            Object.assign(parentFkFields, {
                [pair.fk]: (entity as any)[pair.pk],
            });
        }
        return parentFkFields;
    }

    private async handleManyToManyRelation<Action extends 'connect' | 'disconnect'>(
        kysely: AnyKysely,
        action: Action,
        leftModel: string,
        leftField: string,
        leftEntity: any,
        rightModel: string,
        rightField: string,
        rightEntity: any,
        joinTable: string,
    ): Promise<Action extends 'connect' ? UpdateResult | undefined : DeleteResult | undefined> {
        const sortedRecords = [
            {
                model: leftModel,
                field: leftField,
                entity: leftEntity,
            },
            {
                model: rightModel,
                field: rightField,
                entity: rightEntity,
            },
        ].sort((a, b) =>
            // the implicit m2m join table's "A", "B" fk fields' order is determined
            // by model name's sort order, and when identical (for self-relations),
            // field name's sort order
            a.model !== b.model ? a.model.localeCompare(b.model) : a.field.localeCompare(b.field),
        );

        const firstIds = requireIdFields(this.schema, sortedRecords[0]!.model);
        const secondIds = requireIdFields(this.schema, sortedRecords[1]!.model);
        invariant(firstIds.length === 1, 'many-to-many relation must have exactly one id field');
        invariant(secondIds.length === 1, 'many-to-many relation must have exactly one id field');

        // Prisma's convention for many-to-many: fk fields are named "A" and "B"
        if (action === 'connect') {
            const result = await kysely
                .insertInto(joinTable as any)
                .values({
                    A: sortedRecords[0]!.entity[firstIds[0]!],
                    B: sortedRecords[1]!.entity[secondIds[0]!],
                } as any)
                // case for `INSERT IGNORE` or `ON CONFLICT DO NOTHING` syntax
                .$if(this.dialect.insertIgnoreMethod === 'onConflict', (qb) =>
                    qb.onConflict((oc) => oc.columns(['A', 'B'] as any).doNothing()),
                )
                // case for `INSERT IGNORE` syntax
                .$if(this.dialect.insertIgnoreMethod === 'ignore', (qb) => qb.ignore())
                .execute();
            return result[0] as any;
        } else {
            const eb = expressionBuilder<any, any>();
            const result = await kysely
                .deleteFrom(joinTable as any)
                .where(eb(`${joinTable}.A`, '=', sortedRecords[0]!.entity[firstIds[0]!]))
                .where(eb(`${joinTable}.B`, '=', sortedRecords[1]!.entity[secondIds[0]!]))
                .execute();
            return result[0] as any;
        }
    }

    private resetManyToManyRelation(kysely: AnyKysely, model: string, field: string, parentIds: any) {
        invariant(Object.keys(parentIds).length === 1, 'parentIds must have exactly one field');
        const parentId = Object.values(parentIds)[0]!;

        const m2m = getManyToManyRelation(this.schema, model, field);
        invariant(m2m, 'not a many-to-many relation');

        const eb = expressionBuilder<any, any>();
        return kysely
            .deleteFrom(m2m.joinTable as any)
            .where(eb(`${m2m.joinTable}.${m2m.parentFkName}`, '=', parentId))
            .execute();
    }

    private async processOwnedRelationForCreate(kysely: ToKysely<Schema>, relationField: FieldDef, payload: any) {
        if (!payload) {
            return;
        }

        let result: any;
        const relationModel = relationField.type as GetModels<Schema>;

        for (const [action, subPayload] of Object.entries<any>(payload)) {
            if (!subPayload) {
                continue;
            }
            switch (action) {
                case 'create': {
                    const created = await this.create(kysely, relationModel, subPayload);
                    // extract id fields and return as foreign key values
                    result = getIdValues(this.schema, relationField.type, created);
                    break;
                }

                case 'connect': {
                    const referencedPkFields = relationField.relation!.references!;
                    invariant(referencedPkFields, 'relation must have fields info');
                    const extractedFks = extractFields(subPayload, referencedPkFields);
                    if (Object.keys(extractedFks).length === referencedPkFields.length) {
                        // payload contains all referenced pk fields, we can
                        // directly use it to connect the relation
                        result = extractedFks;
                    } else {
                        // read the relation entity and fetch the referenced pk fields
                        const relationEntity = await this.readUnique(kysely, relationModel, {
                            where: subPayload,
                            select: fieldsToSelectObject(referencedPkFields) as any,
                        });
                        if (!relationEntity) {
                            throw createNotFoundError(
                                relationModel,
                                `Could not find the entity to connect for the relation "${relationField.name}"`,
                            );
                        }
                        result = relationEntity;
                    }
                    break;
                }

                case 'connectOrCreate': {
                    const found = await this.exists(kysely, relationModel, subPayload.where);
                    if (!found) {
                        // create
                        const created = await this.create(kysely, relationModel, subPayload.create);
                        result = getIdValues(this.schema, relationField.type, created);
                    } else {
                        // connect
                        result = found;
                    }
                    break;
                }

                default:
                    throw createInvalidInputError(`Invalid relation action: ${action}`);
            }
        }

        return result;
    }

    private async processNoneOwnedRelationForCreate(
        kysely: AnyKysely,
        contextModel: string,
        relationFieldName: string,
        payload: any,
        parentEntity: any,
    ) {
        const relationFieldDef = this.requireField(contextModel, relationFieldName);
        const relationModel = relationFieldDef.type as GetModels<Schema>;
        const fromRelationContext: FromRelationContext = {
            model: contextModel,
            field: relationFieldName,
            ids: parentEntity,
            parentUpdates: {},
        };

        for (const [action, subPayload] of Object.entries<any>(payload)) {
            if (!subPayload) {
                continue;
            }
            switch (action) {
                case 'create': {
                    // create with a parent entity
                    for (const item of enumerate(subPayload)) {
                        await this.create(kysely, relationModel, item, fromRelationContext);
                    }
                    break;
                }

                case 'createMany': {
                    invariant(relationFieldDef.array, 'relation must be an array for createMany');
                    await this.createMany(
                        kysely,
                        relationModel,
                        subPayload as { data: any; skipDuplicates: boolean },
                        false,
                        fromRelationContext,
                    );
                    break;
                }

                case 'connect': {
                    await this.connectRelation(kysely, relationModel, subPayload, fromRelationContext);
                    break;
                }

                case 'connectOrCreate': {
                    for (const item of enumerate(subPayload)) {
                        const found = await this.exists(kysely, relationModel, item.where);
                        if (!found) {
                            await this.create(kysely, relationModel, item.create, fromRelationContext);
                        } else {
                            await this.connectRelation(kysely, relationModel, found, fromRelationContext);
                        }
                    }
                    break;
                }

                default:
                    throw createInvalidInputError(`Invalid relation action: ${action}`);
            }
        }
    }

    protected async createMany<
        ReturnData extends boolean,
        Result = ReturnData extends true ? unknown[] : { count: number },
    >(
        kysely: ToKysely<Schema>,
        model: GetModels<Schema>,
        input: { data: any; skipDuplicates?: boolean },
        returnData: ReturnData,
        fromRelation?: FromRelationContext,
        fieldsToReturn?: readonly string[],
    ): Promise<Result> {
        if (!input.data || (Array.isArray(input.data) && input.data.length === 0)) {
            // nothing todo
            return returnData ? ([] as Result) : ({ count: 0 } as Result);
        }

        const modelDef = this.requireModel(model);

        const relationKeyPairs: { fk: string; pk: string }[] = [];
        if (fromRelation) {
            const { ownedByModel, keyPairs } = getRelationForeignKeyFieldPairs(
                this.schema,
                fromRelation.model,
                fromRelation.field,
            );
            if (ownedByModel) {
                throw createInvalidInputError('incorrect relation hierarchy for createMany', model);
            }
            relationKeyPairs.push(...keyPairs);
        }

        let createData = enumerate(input.data).map((item) => {
            const newItem: any = {};
            for (const [name, value] of Object.entries(item)) {
                const fieldDef = this.requireField(model, name);
                invariant(!fieldDef.relation, 'createMany does not support relations');
                newItem[name] = this.dialect.transformInput(value, fieldDef.type as BuiltinType, !!fieldDef.array);
            }
            if (fromRelation) {
                for (const { fk, pk } of relationKeyPairs) {
                    newItem[fk] = fromRelation.ids[pk];
                }
            }
            return this.fillGeneratedAndDefaultValues(modelDef, newItem);
        });

        if (!this.dialect.supportsDefaultAsFieldValue) {
            // if the dialect doesn't support `DEFAULT` as insert field values,
            // we need to double check if data rows have mismatching fields, and
            // if so, make sure all fields have default value filled if not provided
            const allPassedFields = createData.reduce((acc, item) => {
                Object.keys(item).forEach((field) => {
                    if (!acc.includes(field)) {
                        acc.push(field);
                    }
                });
                return acc;
            }, [] as string[]);
            for (const item of createData) {
                if (Object.keys(item).length === allPassedFields.length) {
                    continue;
                }
                for (const field of allPassedFields) {
                    if (!(field in item)) {
                        const fieldDef = this.requireField(model, field);
                        if (
                            fieldDef.default !== undefined &&
                            fieldDef.default !== null &&
                            typeof fieldDef.default !== 'object'
                        ) {
                            item[field] = this.dialect.transformInput(
                                fieldDef.default,
                                fieldDef.type as BuiltinType,
                                !!fieldDef.array,
                            );
                        }
                    }
                }
            }
        }

        if (modelDef.baseModel) {
            if (input.skipDuplicates) {
                // TODO: simulate createMany with create in this case
                throw createNotSupportedError('"skipDuplicates" options is not supported for polymorphic models');
            }
            // create base hierarchy
            const baseCreateResult = await this.processBaseModelCreateMany(
                kysely,
                modelDef.baseModel,
                createData,
                !!input.skipDuplicates,
                model,
            );
            createData = baseCreateResult.remainingFieldRows;
        }

        const query = kysely
            .insertInto(model)
            .values(createData)
            .$if(!!input.skipDuplicates, (qb) =>
                qb
                    // case for `INSERT ... ON CONFLICT DO NOTHING` syntax
                    .$if(this.dialect.insertIgnoreMethod === 'onConflict', () => qb.onConflict((oc) => oc.doNothing()))
                    // case for `INSERT IGNORE` syntax
                    .$if(this.dialect.insertIgnoreMethod === 'ignore', () => qb.ignore()),
            )
            .modifyEnd(
                this.makeContextComment({
                    model,
                    operation: 'create',
                }),
            );

        if (!returnData) {
            const result = await this.executeQuery(kysely, query, 'createMany');
            return { count: Number(result.numAffectedRows) } as Result;
        } else {
            fieldsToReturn = fieldsToReturn ?? requireIdFields(this.schema, model);

            if (this.dialect.supportsReturning) {
                const result = await query.returning(fieldsToReturn as any).execute();
                return result as Result;
            } else {
                // Fallback for databases that don't support RETURNING (e.g., MySQL)
                // For createMany without RETURNING, we can't reliably get all inserted records
                // especially with auto-increment IDs. The best we can do is return the count.
                // If users need the created records, they should use multiple create() calls
                // or the application should query after insertion.
                throw createNotSupportedError(
                    `\`createManyAndReturn\` is not supported for ${this.dialect.provider}. ` +
                        `Use multiple \`create\` calls or query the records after insertion.`,
                );
            }
        }
    }

    private async processBaseModelCreateMany(
        kysely: ToKysely<Schema>,
        model: string,
        createRows: any[],
        skipDuplicates: boolean,
        forModel: GetModels<Schema>,
    ) {
        const thisCreateRows: any[] = [];
        const remainingFieldRows: any[] = [];
        const discriminatorField = getDiscriminatorField(this.schema, model);
        invariant(discriminatorField, `Base model "${model}" must have a discriminator field`);

        for (const createFields of createRows) {
            const thisCreateFields: any = {};
            const remainingFields: any = {};
            Object.entries(createFields).forEach(([field, value]) => {
                const fieldDef = this.getField(model, field);
                if (fieldDef) {
                    thisCreateFields[field] = value;
                } else {
                    remainingFields[field] = value;
                }
            });
            thisCreateFields[discriminatorField] = forModel;
            thisCreateRows.push(thisCreateFields);
            remainingFieldRows.push(remainingFields);
        }

        // create base model entity
        let baseEntities: unknown[];
        if (this.dialect.supportsReturning) {
            baseEntities = await this.createMany(
                kysely,
                model as GetModels<Schema>,
                { data: thisCreateRows, skipDuplicates },
                true,
            );
        } else {
            // fall back to multiple creates if RETURNING is not supported
            baseEntities = [];
            for (const row of thisCreateRows) {
                baseEntities.push(await this.create(kysely, model, row, undefined, true));
            }
        }

        // copy over id fields from base model
        for (let i = 0; i < baseEntities.length; i++) {
            const idValues = extractIdFields(baseEntities[i], this.schema, model);
            Object.assign(remainingFieldRows[i], idValues);
        }
        return { baseEntities, remainingFieldRows };
    }

    private fillGeneratedAndDefaultValues(modelDef: ModelDef, data: object) {
        const fields = modelDef.fields;
        const values: any = clone(data);
        for (const [field, fieldDef] of Object.entries(fields)) {
            if (fieldDef.originModel) {
                // skip fields from delegate base
                continue;
            }
            if (!(field in data)) {
                if (typeof fieldDef?.default === 'object' && 'kind' in fieldDef.default) {
                    const generated = this.evalGenerator(fieldDef.default);
                    if (generated !== undefined) {
                        values[field] = this.dialect.transformInput(
                            generated,
                            fieldDef.type as BuiltinType,
                            !!fieldDef.array,
                        );
                    }
                } else if (fieldDef?.updatedAt) {
                    // TODO: should this work at kysely level instead?
                    values[field] = this.dialect.transformInput(new Date(), 'DateTime', false);
                } else if (fieldDef?.default !== undefined) {
                    let value = fieldDef.default;
                    if (fieldDef.type === 'Json') {
                        // Schema uses JSON string for default value of Json fields
                        if (fieldDef.array && Array.isArray(value)) {
                            value = value.map((v) => (typeof v === 'string' ? JSON.parse(v) : v));
                        } else if (typeof value === 'string') {
                            value = JSON.parse(value);
                        }
                    }
                    values[field] = this.dialect.transformInput(value, fieldDef.type as BuiltinType, !!fieldDef.array);
                }
            }
        }
        return values;
    }

    private evalGenerator(defaultValue: Expression) {
        if (ExpressionUtils.isCall(defaultValue)) {
            const firstArgVal =
                defaultValue.args?.[0] && ExpressionUtils.isLiteral(defaultValue.args[0])
                    ? defaultValue.args[0].value
                    : undefined;
            return match(defaultValue.function)
                .with('cuid', () => {
                    const version = firstArgVal;
                    const generated = version === 2 ? cuid2() : cuid1();
                    return this.formatGeneratedValue(generated, defaultValue.args?.[1]);
                })
                .with('uuid', () => {
                    const version = firstArgVal;
                    const generated = version === 7 ? uuid.v7() : uuid.v4();
                    return this.formatGeneratedValue(generated, defaultValue.args?.[1]);
                })
                .with('nanoid', () => {
                    const length = firstArgVal;
                    const generated = typeof length === 'number' ? nanoid(length) : nanoid();
                    return this.formatGeneratedValue(generated, defaultValue.args?.[1]);
                })
                .with('ulid', () => this.formatGeneratedValue(ulid(), defaultValue.args?.[0]))
                .otherwise(() => undefined);
        } else if (
            ExpressionUtils.isMember(defaultValue) &&
            ExpressionUtils.isCall(defaultValue.receiver) &&
            defaultValue.receiver.function === 'auth'
        ) {
            // `auth()` member access
            let val: any = this.client.$auth;
            for (const member of defaultValue.members) {
                val = val?.[member];
            }
            return val ?? null;
        } else {
            return undefined;
        }
    }

    private formatGeneratedValue(generated: string, formatExpr?: Expression) {
        if (!formatExpr || !ExpressionUtils.isLiteral(formatExpr) || typeof formatExpr.value !== 'string') {
            return generated;
        }

        // Replace non-escaped %s with the generated value, then unescape \%s to %s
        return formatExpr.value.replace(/(?<!\\)%s/g, generated).replace(/\\%s/g, '%s');
    }

    protected async update(
        kysely: AnyKysely,
        model: string,
        where: any,
        data: any,
        fromRelation?: FromRelationContext,
        allowRelationUpdate = true,
        throwIfNotFound = true,
        fieldsToReturn?: readonly string[],
    ): Promise<unknown> {
        if (!data || typeof data !== 'object') {
            throw createInvalidInputError('data must be an object');
        }

        const parentWhere = await this.buildUpdateParentRelationFilter(kysely, fromRelation);

        let combinedWhere: WhereInput<Schema, GetModels<Schema>, any, false> = where ?? {};
        if (Object.keys(parentWhere).length > 0) {
            combinedWhere = Object.keys(combinedWhere).length > 0 ? { AND: [parentWhere, combinedWhere] } : parentWhere;
        }

        const modelDef = this.requireModel(model);
        let finalData = data;

        // fill in automatically updated fields
        const autoUpdatedFields: string[] = [];
        for (const [fieldName, fieldDef] of Object.entries(modelDef.fields)) {
            if (fieldDef.updatedAt && finalData[fieldName] === undefined) {
                const ignoredFields = new Set(typeof fieldDef.updatedAt === 'boolean' ? [] : fieldDef.updatedAt.ignore);
                const hasNonIgnoredFields = Object.keys(data).some(
                    (field) =>
                        (isScalarField(this.schema, modelDef.name, field) ||
                            isForeignKeyField(this.schema, modelDef.name, field)) &&
                        !ignoredFields.has(field),
                );
                if (hasNonIgnoredFields) {
                    if (finalData === data) {
                        finalData = clone(data);
                    }
                    finalData[fieldName] = this.dialect.transformInput(new Date(), 'DateTime', false);
                    autoUpdatedFields.push(fieldName);
                }
            }
        }

        // read pre-update entity with ids so that the caller can use it to identify
        // the entity being updated, the read data is used as return value if no update
        // is made to the entity
        const thisEntity = await this.getEntityIds(kysely, model, combinedWhere);
        if (!thisEntity) {
            if (throwIfNotFound) {
                throw createNotFoundError(model);
            } else {
                return null;
            }
        }

        if (Object.keys(finalData).length === 0) {
            return thisEntity;
        }

        let needIdRead = false;
        if (!this.isIdFilter(model, combinedWhere)) {
            if (modelDef.baseModel) {
                // when updating a model with delegate base, base fields may be referenced in the filter,
                // so we read the id out if the filter is not ready an id filter, and and use it as the
                // update filter instead
                needIdRead = true;
            }
            if (!this.dialect.supportsReturning) {
                // for dialects that don't support RETURNING, we need to read the id fields
                // to identify the updated entity
                needIdRead = true;
            }
        }

        if (needIdRead) {
            const readResult = await this.readUnique(kysely, model, {
                where: combinedWhere,
                select: this.makeIdSelect(model),
            });
            if (!readResult && throwIfNotFound) {
                throw createNotFoundError(model);
            }
            combinedWhere = readResult;
        }

        if (modelDef.baseModel) {
            const baseUpdateResult = await this.processBaseModelUpdate(
                kysely,
                modelDef.baseModel,
                combinedWhere,
                finalData,
                throwIfNotFound,
            );
            // only fields not consumed by base update will be used for this model
            finalData = baseUpdateResult.remainingFields;
            // make sure to include only the id fields from the base entity in the final filter
            combinedWhere = baseUpdateResult.baseEntity
                ? getIdValues(this.schema, modelDef.baseModel!, baseUpdateResult.baseEntity)
                : baseUpdateResult.baseEntity;

            // update this entity with fields in updated base
            if (baseUpdateResult.baseEntity) {
                for (const [key, value] of Object.entries(baseUpdateResult.baseEntity)) {
                    if (key in thisEntity) {
                        thisEntity[key] = value;
                    }
                }
            }
        }

        const updateFields: any = {};

        for (const field in finalData) {
            const fieldDef = this.requireField(model, field);
            if (isScalarField(this.schema, model, field) || isForeignKeyField(this.schema, model, field)) {
                updateFields[field] = this.processScalarFieldUpdateData(model, field, finalData);
            } else {
                if (!allowRelationUpdate) {
                    throw createNotSupportedError(`Relation update not allowed for field "${field}"`);
                }
                const parentUpdates = await this.processRelationUpdates(
                    kysely,
                    model,
                    field,
                    fieldDef,
                    thisEntity,
                    finalData[field],
                );

                if (Object.keys(parentUpdates).length > 0) {
                    // merge field updates propagated from nested relation processing
                    Object.assign(updateFields, parentUpdates);
                }
            }
        }

        let hasFieldUpdate = Object.keys(updateFields).length > 0;
        if (hasFieldUpdate) {
            // check if only updating auto-updated fields, if so, we can skip the update
            hasFieldUpdate = Object.keys(updateFields).some((f) => !autoUpdatedFields.includes(f));
        }

        if (!hasFieldUpdate) {
            // nothing to update, return the existing entity
            return thisEntity;
        } else {
            fieldsToReturn = fieldsToReturn ?? requireIdFields(this.schema, model);

            let updatedEntity: any;

            if (this.dialect.supportsReturning) {
                const query = kysely
                    .updateTable(model)
                    .where(() => this.dialect.buildFilter(model, model, combinedWhere))
                    .set(updateFields)
                    .returning(fieldsToReturn as any)
                    .modifyEnd(
                        this.makeContextComment({
                            model,
                            operation: 'update',
                        }),
                    );

                updatedEntity = await this.executeQueryTakeFirst(kysely, query, 'update');
            } else {
                // Fallback for databases that don't support RETURNING (e.g., MySQL)
                const updateQuery = kysely
                    .updateTable(model)
                    .where(() => this.dialect.buildFilter(model, model, combinedWhere))
                    .set(updateFields)
                    .modifyEnd(
                        this.makeContextComment({
                            model,
                            operation: 'update',
                        }),
                    );

                const updateResult = await this.executeQuery(kysely, updateQuery, 'update');
                if (!updateResult.numAffectedRows) {
                    // no rows updated
                    updatedEntity = null;
                } else {
                    // collect id field/values from the original filter
                    const idFields = requireIdFields(this.schema, model);
                    const filterIdValues: any = {};
                    for (const key of idFields) {
                        if (combinedWhere[key] !== undefined && typeof combinedWhere[key] !== 'object') {
                            filterIdValues[key] = combinedWhere[key];
                        }
                    }

                    // check if we are updating any id fields
                    const updatingIdFields = idFields.some((idField) => idField in updateFields);

                    if (Object.keys(filterIdValues).length === idFields.length && !updatingIdFields) {
                        // if we have all id fields in the original filter and ids are not being updated,
                        // we can simply return the id values as the update result
                        updatedEntity = filterIdValues;
                    } else {
                        // otherwise we need to re-query the updated entity

                        // replace id fields in the filter with updated values if they are being updated
                        const readFilter: any = { ...combinedWhere };
                        for (const idField of idFields) {
                            if (idField in updateFields && updateFields[idField] !== undefined) {
                                // if id fields are being updated, use the new values
                                readFilter[idField] = updateFields[idField];
                            }
                        }
                        const selectQuery = kysely
                            .selectFrom(model)
                            .select(fieldsToReturn as any)
                            .where(() => this.dialect.buildFilter(model, model, readFilter));
                        updatedEntity = await this.executeQueryTakeFirst(kysely, selectQuery, 'update');
                    }
                }
            }

            if (!updatedEntity) {
                if (throwIfNotFound) {
                    throw createNotFoundError(model);
                } else {
                    return null;
                }
            }

            return updatedEntity;
        }
    }

    private async buildUpdateParentRelationFilter(kysely: AnyKysely, fromRelation: FromRelationContext | undefined) {
        const parentWhere: any = {};
        let m2m: ReturnType<typeof getManyToManyRelation> = undefined;
        if (fromRelation) {
            m2m = getManyToManyRelation(this.schema, fromRelation.model, fromRelation.field);
            if (!m2m) {
                // merge foreign key conditions from the relation
                const { ownedByModel, keyPairs } = getRelationForeignKeyFieldPairs(
                    this.schema,
                    fromRelation.model,
                    fromRelation.field,
                );
                if (ownedByModel) {
                    const fromEntity = await this.readUnique(kysely, fromRelation.model, {
                        where: fromRelation.ids,
                    });
                    for (const { fk, pk } of keyPairs) {
                        parentWhere[pk] = fromEntity[fk];
                    }
                } else {
                    for (const { fk, pk } of keyPairs) {
                        parentWhere[fk] = fromRelation.ids[pk];
                    }
                }
            } else {
                // many-to-many relation, filter for parent with "some"
                const fromRelationFieldDef = this.requireField(fromRelation.model, fromRelation.field);
                invariant(fromRelationFieldDef.relation?.opposite);
                parentWhere[fromRelationFieldDef.relation.opposite] = {
                    some: fromRelation.ids,
                };
            }
        }
        return parentWhere;
    }

    private processScalarFieldUpdateData(model: string, field: string, data: any): any {
        const fieldDef = this.requireField(model, field);
        if (this.isNumericIncrementalUpdate(fieldDef, data[field])) {
            // numeric fields incremental updates
            return this.transformIncrementalUpdate(model, field, fieldDef, data[field]);
        }

        if (fieldDef.array && typeof data[field] === 'object' && !Array.isArray(data[field]) && data[field]) {
            // scalar list updates
            return this.transformScalarListUpdate(model, field, fieldDef, data[field]);
        }

        return this.dialect.transformInput(data[field], fieldDef.type as BuiltinType, !!fieldDef.array);
    }

    private isNumericIncrementalUpdate(fieldDef: FieldDef, value: any) {
        if (!this.isNumericField(fieldDef)) {
            return false;
        }
        if (typeof value !== 'object' || !value) {
            return false;
        }
        return ['increment', 'decrement', 'multiply', 'divide', 'set'].some((key) => key in value);
    }

    private isIdFilter(model: string, filter: any) {
        if (!filter || typeof filter !== 'object') {
            return false;
        }
        const idFields = requireIdFields(this.schema, model);
        return idFields.length === Object.keys(filter).length && idFields.every((field) => field in filter);
    }

    private async processBaseModelUpdate(
        kysely: ToKysely<Schema>,
        model: string,
        where: any,
        updateFields: any,
        throwIfNotFound: boolean,
    ) {
        const thisUpdateFields: any = {};
        const remainingFields: any = {};

        Object.entries(updateFields).forEach(([field, value]) => {
            const fieldDef = this.getField(model, field);
            if (fieldDef) {
                thisUpdateFields[field] = value;
            } else {
                remainingFields[field] = value;
            }
        });

        // update base model entity
        const baseEntity: any = await this.update(
            kysely,
            model as GetModels<Schema>,
            where,
            thisUpdateFields,
            undefined,
            undefined,
            throwIfNotFound,
        );
        return { baseEntity, remainingFields };
    }

    private transformIncrementalUpdate(
        model: string,
        field: string,
        fieldDef: FieldDef,
        payload: Record<string, number | null>,
    ) {
        invariant(
            Object.keys(payload).length === 1,
            'Only one of "set", "increment", "decrement", "multiply", or "divide" can be provided',
        );

        const key = Object.keys(payload)[0];
        const value = this.dialect.transformInput(payload[key!], fieldDef.type as BuiltinType, false);
        const eb = expressionBuilder<any, any>();
        const fieldRef = this.dialect.fieldRef(model, field);

        return match(key)
            .with('set', () => value)
            .with('increment', () => eb(fieldRef, '+', value))
            .with('decrement', () => eb(fieldRef, '-', value))
            .with('multiply', () => eb(fieldRef, '*', value))
            .with('divide', () => eb(fieldRef, '/', value))
            .otherwise(() => {
                throw createInvalidInputError(`Invalid incremental update operation: ${key}`);
            });
    }

    private transformScalarListUpdate(
        model: string,
        field: string,
        fieldDef: FieldDef,
        payload: Record<string, unknown>,
    ) {
        invariant(Object.keys(payload).length === 1, 'Only one of "set", "push" can be provided');
        const key = Object.keys(payload)[0];
        const value = this.dialect.transformInput(payload[key!], fieldDef.type as BuiltinType, true);
        const eb = expressionBuilder<any, any>();
        const fieldRef = this.dialect.fieldRef(model, field);

        return match(key)
            .with('set', () => value)
            .with('push', () => {
                return eb(fieldRef, '||', eb.val(ensureArray(value)));
            })
            .otherwise(() => {
                throw createInvalidInputError(`Invalid array update operation: ${key}`);
            });
    }

    private isNumericField(fieldDef: FieldDef) {
        return NUMERIC_FIELD_TYPES.includes(fieldDef.type) && !fieldDef.array;
    }

    private makeContextComment(_context: { model: string; operation: CRUD }) {
        return sql``;
        // return sql.raw(`${CONTEXT_COMMENT_PREFIX}${JSON.stringify(context)}`);
    }

    protected async updateMany<
        ReturnData extends boolean,
        Result = ReturnData extends true ? unknown[] : { count: number },
    >(
        kysely: AnyKysely,
        model: string,
        where: any,
        data: any,
        limit: number | undefined,
        returnData: ReturnData,
        filterModel?: string,
        fromRelation?: FromRelationContext,
        fieldsToReturn?: readonly string[],
    ): Promise<Result> {
        if (typeof data !== 'object') {
            throw createInvalidInputError('data must be an object');
        }

        if (Object.keys(data).length === 0) {
            return (returnData ? [] : { count: 0 }) as Result;
        }

        const modelDef = this.requireModel(model);
        if (modelDef.baseModel && limit !== undefined) {
            throw createNotSupportedError('Updating with a limit is not supported for polymorphic models');
        }

        const parentWhere = await this.buildUpdateParentRelationFilter(kysely, fromRelation);
        let combinedWhere: WhereInput<Schema, GetModels<Schema>, any, false> = where ?? {};
        if (Object.keys(parentWhere).length > 0) {
            combinedWhere = Object.keys(combinedWhere).length > 0 ? { AND: [parentWhere, combinedWhere] } : parentWhere;
        }

        filterModel ??= model;
        let updateFields: any = {};

        for (const field in data) {
            if (isRelationField(this.schema, model, field)) {
                continue;
            }
            updateFields[field] = this.processScalarFieldUpdateData(model, field, data);
        }

        let resultFromBaseModel: any = undefined;
        if (modelDef.baseModel) {
            const baseResult = await this.processBaseModelUpdateMany(
                kysely,
                modelDef.baseModel,
                combinedWhere,
                updateFields,
                filterModel,
            );
            updateFields = baseResult.remainingFields;
            resultFromBaseModel = baseResult.baseResult;
        }

        // check again if we don't have anything to update for this model
        if (Object.keys(updateFields).length === 0) {
            // return result from base model if it exists, otherwise return empty result
            return resultFromBaseModel ?? ((returnData ? [] : { count: 0 }) as Result);
        }

        let shouldFallbackToIdFilter = false;

        if (limit !== undefined && !this.dialect.supportsUpdateWithLimit) {
            // if the dialect doesn't support update with limit natively, we'll
            // simulate it by filtering by id with a limit
            shouldFallbackToIdFilter = true;
        }

        if (modelDef.isDelegate || modelDef.baseModel) {
            // if the model is in a delegate hierarchy, we'll need to filter by
            // id because the filter may involve fields in different models in
            // the hierarchy
            shouldFallbackToIdFilter = true;
        }

        let query = kysely.updateTable(model).set(updateFields);

        if (!shouldFallbackToIdFilter) {
            // simple filter
            query = query
                .where(() => this.dialect.buildFilter(model, model, combinedWhere))
                .$if(limit !== undefined, (qb) => qb.limit(limit!));
        } else {
            query = query.where((eb) =>
                eb(
                    eb.refTuple(
                        // @ts-expect-error
                        ...this.buildIdFieldRefs(kysely, model),
                    ),
                    'in',
                    // the outer "select *" is needed to isolate the sub query (as needed for dialects like mysql)
                    eb
                        .selectFrom(
                            this.dialect
                                .buildSelectModel(filterModel, filterModel)
                                .where(this.dialect.buildFilter(filterModel, filterModel, combinedWhere))
                                .select(this.buildIdFieldRefs(kysely, filterModel))
                                .$if(limit !== undefined, (qb) => qb.limit(limit!))
                                .as('$sub'),
                        )
                        .selectAll(),
                ),
            );
        }

        query = query.modifyEnd(this.makeContextComment({ model, operation: 'update' }));

        if (!returnData) {
            const result = await this.executeQuery(kysely, query, 'update');
            return { count: Number(result.numAffectedRows) } as Result;
        } else {
            fieldsToReturn = fieldsToReturn ?? requireIdFields(this.schema, model);

            if (this.dialect.supportsReturning) {
                const finalQuery = query.returning(fieldsToReturn as any);
                const result = await this.executeQuery(kysely, finalQuery, 'update');
                return result.rows as Result;
            } else {
                // Fallback for databases that don't support RETURNING (e.g., MySQL)
                // First, select the records to be updated
                let selectQuery = kysely.selectFrom(model).selectAll();

                if (!shouldFallbackToIdFilter) {
                    selectQuery = selectQuery
                        .where(() => this.dialect.buildFilter(model, model, combinedWhere))
                        .$if(limit !== undefined, (qb) => qb.limit(limit!));
                } else {
                    selectQuery = selectQuery.where((eb) =>
                        eb(
                            eb.refTuple(
                                // @ts-expect-error
                                ...this.buildIdFieldRefs(kysely, model),
                            ),
                            'in',
                            this.dialect
                                .buildSelectModel(filterModel, filterModel)
                                .where(this.dialect.buildFilter(filterModel, filterModel, combinedWhere))
                                .select(this.buildIdFieldRefs(kysely, filterModel))
                                .$if(limit !== undefined, (qb) => qb.limit(limit!)),
                        ),
                    );
                }

                const recordsToUpdate = await this.executeQuery(kysely, selectQuery, 'update');

                // Execute the update
                await this.executeQuery(kysely, query, 'update');

                // Return the IDs of updated records, then query them back with updated values
                if (recordsToUpdate.rows.length === 0) {
                    return [] as Result;
                }

                const idFields = requireIdFields(this.schema, model);
                const updatedIds = recordsToUpdate.rows.map((row: any) => {
                    const id: Record<string, any> = {};
                    for (const idField of idFields) {
                        id[idField] = row[idField];
                    }
                    return id;
                });

                // Query back the updated records
                const resultQuery = kysely
                    .selectFrom(model)
                    .selectAll()
                    .where((eb) => {
                        const conditions = updatedIds.map((id) => {
                            const idConditions = Object.entries(id).map(([field, value]) => eb.eb(field, '=', value));
                            return eb.and(idConditions);
                        });
                        return eb.or(conditions);
                    });

                const result = await this.executeQuery(kysely, resultQuery, 'update');
                return result.rows as Result;
            }
        }
    }

    private async processBaseModelUpdateMany(
        kysely: AnyKysely,
        model: string,
        where: any,
        updateFields: any,
        filterModel: string,
    ) {
        const thisUpdateFields: any = {};
        const remainingFields: any = {};

        Object.entries(updateFields).forEach(([field, value]) => {
            const fieldDef = this.getField(model, field);
            if (fieldDef) {
                thisUpdateFields[field] = value;
            } else {
                remainingFields[field] = value;
            }
        });

        // update base model entity
        const baseResult: any = await this.updateMany(
            kysely,
            model as GetModels<Schema>,
            where,
            thisUpdateFields,
            undefined,
            false,
            filterModel,
        );
        return { baseResult, remainingFields };
    }

    private buildIdFieldRefs(kysely: AnyKysely, model: string) {
        const idFields = requireIdFields(this.schema, model);
        return idFields.map((f) => kysely.dynamic.ref(`${model}.${f}`));
    }

    private async processRelationUpdates(
        kysely: AnyKysely,
        model: string,
        field: string,
        fieldDef: FieldDef,
        parentIds: any,
        args: any,
    ) {
        const fieldModel = fieldDef.type as GetModels<Schema>;
        const fromRelationContext: FromRelationContext = {
            model,
            field,
            ids: parentIds,
            parentUpdates: {},
        };

        for (const [key, value] of Object.entries(args)) {
            switch (key) {
                case 'create': {
                    invariant(
                        !Array.isArray(value) || fieldDef.array,
                        'relation must be an array if create is an array',
                    );
                    for (const item of enumerate(value)) {
                        await this.create(kysely, fieldModel, item, fromRelationContext);
                    }
                    break;
                }

                case 'createMany': {
                    invariant(fieldDef.array, 'relation must be an array for createMany');
                    await this.createMany(
                        kysely,
                        fieldModel,
                        value as { data: any; skipDuplicates: boolean },
                        false,
                        fromRelationContext,
                    );
                    break;
                }

                case 'connect': {
                    await this.connectRelation(kysely, fieldModel, value, fromRelationContext);
                    break;
                }

                case 'connectOrCreate': {
                    await this.connectOrCreateRelation(kysely, fieldModel, value, fromRelationContext);
                    break;
                }

                case 'disconnect': {
                    await this.disconnectRelation(kysely, fieldModel, value, fromRelationContext);
                    break;
                }

                case 'set': {
                    invariant(fieldDef.array, 'relation must be an array');
                    await this.setRelation(kysely, fieldModel, value, fromRelationContext);
                    break;
                }

                case 'update': {
                    for (const _item of enumerate(value)) {
                        const item = _item as { where: any; data: any };
                        let where;
                        let data;
                        if ('data' in item && typeof item.data === 'object') {
                            where = item.where;
                            data = item.data;
                        } else {
                            where = undefined;
                            data = item;
                        }
                        // update should throw if:
                        // - to-many: there's a where clause and no entity is found
                        // - to-one: always throw if no entity is found
                        const throwIfNotFound = !fieldDef.array || !!where;
                        await this.update(kysely, fieldModel, where, data, fromRelationContext, true, throwIfNotFound);
                    }
                    break;
                }

                case 'upsert': {
                    for (const _item of enumerate(value)) {
                        const item = _item as {
                            where: any;
                            create: any;
                            update: any;
                        };

                        const updated = await this.update(
                            kysely,
                            fieldModel,
                            item.where,
                            item.update,
                            fromRelationContext,
                            true,
                            false,
                        );
                        if (!updated) {
                            await this.create(kysely, fieldModel, item.create, fromRelationContext);
                        }
                    }
                    break;
                }

                case 'updateMany': {
                    for (const _item of enumerate(value)) {
                        const item = _item as { where: any; data: any; limit: number | undefined };
                        await this.updateMany(
                            kysely,
                            fieldModel,
                            item.where,
                            item.data,
                            item.limit,
                            false,
                            fieldModel,
                            fromRelationContext,
                        );
                    }
                    break;
                }

                case 'delete': {
                    await this.deleteRelation(kysely, fieldModel, value, fromRelationContext, true);
                    break;
                }

                case 'deleteMany': {
                    await this.deleteRelation(kysely, fieldModel, value, fromRelationContext, false);
                    break;
                }

                default: {
                    throw createInvalidInputError(`Invalid relation update operation: ${key}`);
                }
            }
        }

        return fromRelationContext.parentUpdates;
    }

    // #region relation manipulation

    protected async connectRelation(kysely: AnyKysely, model: string, data: any, fromRelation: FromRelationContext) {
        const _data = this.normalizeRelationManipulationInput(model, data);
        if (_data.length === 0) {
            return;
        }

        const m2m = getManyToManyRelation(this.schema, fromRelation.model, fromRelation.field);
        if (m2m) {
            // handle many-to-many relation
            const results: (unknown | undefined)[] = [];
            for (const d of _data) {
                const ids = await this.getEntityIds(kysely, model, d);
                if (!ids) {
                    throw createNotFoundError(model);
                }
                const r = await this.handleManyToManyRelation(
                    kysely,
                    'connect',
                    fromRelation.model,
                    fromRelation.field,
                    fromRelation.ids,
                    m2m.otherModel!,
                    m2m.otherField!,
                    ids,
                    m2m.joinTable,
                );
                results.push(r);
            }

            // validate connect result
            if (_data.length > results.filter((r) => !!r).length) {
                throw createNotFoundError(model);
            }
        } else {
            const { ownedByModel, keyPairs } = getRelationForeignKeyFieldPairs(
                this.schema,
                fromRelation.model,
                fromRelation.field,
            );

            if (ownedByModel) {
                // record parent fk update
                invariant(_data.length === 1, 'only one entity can be connected');
                const target = await this.readUnique(kysely, model, {
                    where: _data[0],
                });
                if (!target) {
                    throw createNotFoundError(model);
                }

                for (const { fk, pk } of keyPairs) {
                    fromRelation.parentUpdates[fk] = target[pk];
                }
            } else {
                // disconnect current if it's a one-one relation
                const relationFieldDef = this.requireField(fromRelation.model, fromRelation.field);

                if (!relationFieldDef.array) {
                    const query = kysely
                        .updateTable(model)
                        .where((eb) => eb.and(keyPairs.map(({ fk, pk }) => eb(eb.ref(fk), '=', fromRelation.ids[pk]))))
                        .set(keyPairs.reduce((acc, { fk }) => ({ ...acc, [fk]: null }), {} as any))
                        .modifyEnd(
                            this.makeContextComment({
                                model: fromRelation.model,
                                operation: 'update',
                            }),
                        );
                    await this.executeQuery(kysely, query, 'disconnect');
                }

                // connect
                const query = kysely
                    .updateTable(model)
                    .where((eb) => eb.or(_data.map((d) => eb.and(d))))
                    .set(
                        keyPairs.reduce(
                            (acc, { fk, pk }) => ({
                                ...acc,
                                [fk]: fromRelation.ids[pk],
                            }),
                            {} as any,
                        ),
                    )
                    .modifyEnd(
                        this.makeContextComment({
                            model,
                            operation: 'update',
                        }),
                    );
                const updateResult = await this.executeQuery(kysely, query, 'connect');

                // validate connect result
                if (!updateResult.numAffectedRows || _data.length > updateResult.numAffectedRows) {
                    // some entities were not connected
                    throw createNotFoundError(model);
                }
            }
        }
    }

    protected async connectOrCreateRelation(
        kysely: ToKysely<Schema>,
        model: GetModels<Schema>,
        data: any,
        fromRelation: FromRelationContext,
    ) {
        const _data = enumerate(data);
        if (_data.length === 0) {
            return;
        }

        for (const { where, create } of _data) {
            const existing = await this.exists(kysely, model, where);
            if (existing) {
                await this.connectRelation(kysely, model, [where], fromRelation);
            } else {
                await this.create(kysely, model, create, fromRelation);
            }
        }
    }

    protected async disconnectRelation(kysely: AnyKysely, model: string, data: any, fromRelation: FromRelationContext) {
        let disconnectConditions: any[] = [];
        if (typeof data === 'boolean') {
            if (data === false) {
                return;
            } else {
                disconnectConditions = [true];
            }
        } else {
            disconnectConditions = this.normalizeRelationManipulationInput(model, data);

            if (disconnectConditions.length === 0) {
                return;
            }
        }

        if (disconnectConditions.length === 0) {
            return;
        }

        const m2m = getManyToManyRelation(this.schema, fromRelation.model, fromRelation.field);
        if (m2m) {
            // handle many-to-many relation
            for (const d of disconnectConditions) {
                const ids = await this.getEntityIds(kysely, model, d);
                if (!ids) {
                    // not found
                    return;
                }
                await this.handleManyToManyRelation(
                    kysely,
                    'disconnect',
                    fromRelation.model,
                    fromRelation.field,
                    fromRelation.ids,
                    m2m.otherModel,
                    m2m.otherField,
                    ids,
                    m2m.joinTable,
                );
            }
        } else {
            const { ownedByModel, keyPairs } = getRelationForeignKeyFieldPairs(
                this.schema,
                fromRelation.model,
                fromRelation.field,
            );

            const eb = expressionBuilder<any, any>();
            if (ownedByModel) {
                // record parent fk update
                invariant(disconnectConditions.length === 1, 'only one entity can be disconnected');
                const condition = disconnectConditions[0];

                if (condition === true) {
                    // just disconnect, record parent fk update
                    for (const { fk } of keyPairs) {
                        fromRelation.parentUpdates[fk] = null;
                    }
                } else {
                    // disconnect with a filter

                    // read parent's fk
                    const fromEntity = await this.readUnique(kysely, fromRelation.model, {
                        where: fromRelation.ids,
                        select: fieldsToSelectObject(keyPairs.map(({ fk }) => fk)),
                    });
                    if (!fromEntity || keyPairs.some(({ fk }) => fromEntity[fk] == null)) {
                        return;
                    }

                    // check if the disconnect target exists under parent fk and the filter condition
                    const relationFilter = {
                        AND: [condition, Object.fromEntries(keyPairs.map(({ fk, pk }) => [pk, fromEntity[fk]]))],
                    };

                    // if the target exists, record parent fk update, otherwise do nothing
                    const targetExists = await this.read(kysely, model, {
                        where: relationFilter,
                        take: 1,
                        select: this.makeIdSelect(model),
                    } as any);
                    if (targetExists.length > 0) {
                        for (const { fk } of keyPairs) {
                            fromRelation.parentUpdates[fk] = null;
                        }
                    }
                }
            } else {
                // disconnect
                const query = kysely
                    .updateTable(model)
                    .where(
                        eb.and([
                            // fk filter
                            eb.and(Object.fromEntries(keyPairs.map(({ fk, pk }) => [fk, fromRelation.ids[pk]]))),
                            // merge extra disconnect conditions
                            eb.or(disconnectConditions.map((d) => eb.and(d))),
                        ]),
                    )
                    .set(keyPairs.reduce((acc, { fk }) => ({ ...acc, [fk]: null }), {} as any))
                    .modifyEnd(
                        this.makeContextComment({
                            model,
                            operation: 'update',
                        }),
                    );
                await this.executeQuery(kysely, query, 'disconnect');
            }
        }
    }

    protected async setRelation(kysely: AnyKysely, model: string, data: any, fromRelation: FromRelationContext) {
        const _data = this.normalizeRelationManipulationInput(model, data);

        const m2m = getManyToManyRelation(this.schema, fromRelation.model, fromRelation.field);

        if (m2m) {
            // handle many-to-many relation

            // reset for the parent
            await this.resetManyToManyRelation(kysely, fromRelation.model, fromRelation.field, fromRelation.ids);

            // connect new entities
            const results: (unknown | undefined)[] = [];
            for (const d of _data) {
                const ids = await this.getEntityIds(kysely, model, d);
                if (!ids) {
                    throw createNotFoundError(model);
                }
                results.push(
                    await this.handleManyToManyRelation(
                        kysely,
                        'connect',
                        fromRelation.model,
                        fromRelation.field,
                        fromRelation.ids,
                        m2m.otherModel,
                        m2m.otherField,
                        ids,
                        m2m.joinTable,
                    ),
                );
            }

            // validate connect result
            if (_data.length > results.filter((r) => !!r).length) {
                throw createNotFoundError(model);
            }
        } else {
            const { ownedByModel, keyPairs } = getRelationForeignKeyFieldPairs(
                this.schema,
                fromRelation.model,
                fromRelation.field,
            );

            if (ownedByModel) {
                throw createInternalError('relation can only be set from the non-owning side', fromRelation.model);
            }

            const fkConditions = keyPairs.reduce(
                (acc, { fk, pk }) => ({
                    ...acc,
                    [fk]: fromRelation.ids[pk],
                }),
                {} as any,
            );

            // disconnect
            const query = kysely
                .updateTable(model)
                .where((eb) =>
                    eb.and([
                        // match parent
                        eb.and(fkConditions),
                        // exclude entities to be connected
                        eb.not(eb.or(_data.map((d) => eb.and(d)))),
                    ]),
                )
                .set(keyPairs.reduce((acc, { fk }) => ({ ...acc, [fk]: null }), {} as any))
                .modifyEnd(
                    this.makeContextComment({
                        model,
                        operation: 'update',
                    }),
                );
            await this.executeQuery(kysely, query, 'disconnect');

            // connect
            if (_data.length > 0) {
                const query = kysely
                    .updateTable(model)
                    .where((eb) => eb.or(_data.map((d) => eb.and(d))))
                    .set(
                        keyPairs.reduce(
                            (acc, { fk, pk }) => ({
                                ...acc,
                                [fk]: fromRelation.ids[pk],
                            }),
                            {} as any,
                        ),
                    )
                    .modifyEnd(
                        this.makeContextComment({
                            model,
                            operation: 'update',
                        }),
                    );
                const r = await this.executeQuery(kysely, query, 'connect');

                // validate result
                if (!r.numAffectedRows || _data.length > r.numAffectedRows) {
                    // some entities were not connected
                    throw createNotFoundError(model);
                }
            }
        }
    }

    protected async deleteRelation(
        kysely: ToKysely<Schema>,
        model: GetModels<Schema>,
        data: any,
        fromRelation: FromRelationContext,
        throwForNotFound: boolean,
    ) {
        let deleteConditions: any[] = [];
        let expectedDeleteCount: number;
        if (typeof data === 'boolean') {
            if (data === false) {
                return;
            } else {
                deleteConditions = [true];
                expectedDeleteCount = 1;
            }
        } else {
            deleteConditions = this.normalizeRelationManipulationInput(model, data);
            if (deleteConditions.length === 0) {
                return;
            }
            expectedDeleteCount = deleteConditions.length;
        }

        let deleteResult: Awaited<ReturnType<typeof this.delete>>;
        let deleteFromModel: string;
        const m2m = getManyToManyRelation(this.schema, fromRelation.model, fromRelation.field);

        if (m2m) {
            deleteFromModel = model;

            // handle many-to-many relation
            const fieldDef = this.requireField(fromRelation.model, fromRelation.field);
            invariant(fieldDef.relation?.opposite);

            deleteResult = await this.delete(kysely, model, {
                AND: [
                    {
                        [fieldDef.relation.opposite]: {
                            some: fromRelation.ids,
                        },
                    },
                    {
                        OR: deleteConditions,
                    },
                ],
            });
        } else {
            const { ownedByModel, keyPairs } = getRelationForeignKeyFieldPairs(
                this.schema,
                fromRelation.model,
                fromRelation.field,
            );

            if (ownedByModel) {
                deleteFromModel = fromRelation.model;

                const fromEntity = await this.readUnique(kysely, fromRelation.model as GetModels<Schema>, {
                    where: fromRelation.ids,
                });
                if (!fromEntity) {
                    throw createNotFoundError(fromRelation.model);
                }

                const fieldDef = this.requireField(fromRelation.model, fromRelation.field);
                invariant(fieldDef.relation?.opposite);
                deleteResult = await this.delete(kysely, model, {
                    AND: [
                        // filter for parent
                        Object.fromEntries(keyPairs.map(({ fk, pk }) => [pk, fromEntity[fk]])),
                        {
                            OR: deleteConditions,
                        },
                    ],
                });
            } else {
                deleteFromModel = model;
                deleteResult = await this.delete(kysely, model, {
                    AND: [
                        Object.fromEntries(keyPairs.map(({ fk, pk }) => [fk, fromRelation.ids[pk]])),
                        {
                            OR: deleteConditions,
                        },
                    ],
                });
            }
        }

        // validate result
        if (throwForNotFound && expectedDeleteCount > (deleteResult.numAffectedRows ?? 0)) {
            // some entities were not deleted
            throw createNotFoundError(deleteFromModel);
        }
    }

    private normalizeRelationManipulationInput(model: string, data: any) {
        return enumerate(data).map((item) => flattenCompoundUniqueFilters(this.schema, model, item));
    }

    // #endregion

    protected async delete(
        kysely: AnyKysely,
        model: string,
        where: any,
        limit?: number,
        filterModel?: string,
        fieldsToReturn?: readonly string[],
    ): Promise<QueryResult<unknown>> {
        filterModel ??= model;

        const modelDef = this.requireModel(model);

        if (modelDef.baseModel) {
            if (limit !== undefined) {
                throw createNotSupportedError('Deleting with a limit is not supported for polymorphic models');
            }
            // just delete base and it'll cascade back to this model
            return this.processBaseModelDelete(kysely, modelDef.baseModel, where, limit, filterModel);
        }

        fieldsToReturn = fieldsToReturn ?? requireIdFields(this.schema, model);

        let needIdFilter = false;

        if (limit !== undefined && !this.dialect.supportsDeleteWithLimit) {
            // if the dialect doesn't support delete with limit natively, we'll
            // simulate it by filtering by id with a limit
            needIdFilter = true;
        }

        if (modelDef.isDelegate || modelDef.baseModel) {
            // if the model is in a delegate hierarchy, we'll need to filter by
            // id because the filter may involve fields in different models in
            // the hierarchy
            needIdFilter = true;
        }

        const deleteFilter = needIdFilter
            ? (eb: ExpressionBuilder<any, any>) =>
                  eb(
                      eb.refTuple(
                          // @ts-expect-error
                          ...this.buildIdFieldRefs(kysely, model),
                      ),
                      'in',
                      // the outer "select *" is needed to isolate the sub query (as needed for dialects like mysql)
                      eb
                          .selectFrom(
                              this.dialect
                                  .buildSelectModel(filterModel, filterModel)
                                  .where(() => this.dialect.buildFilter(filterModel, filterModel, where))
                                  .select(this.buildIdFieldRefs(kysely, filterModel))
                                  .$if(limit !== undefined, (qb) => qb.limit(limit!))
                                  .as('$sub'),
                          )
                          .selectAll(),
                  )
            : () => this.dialect.buildFilter(model, model, where);

        // if the model being deleted has a relation to a model that extends a delegate model, and if that
        // relation is set to trigger a cascade delete from this model, the deletion will not automatically
        // clean up the base hierarchy of the relation side (because polymorphic model's cascade deletion
        // works downward not upward). We need to take care of the base deletions manually here.

        await this.processDelegateRelationDelete(kysely, modelDef, where, limit);

        const query = kysely
            .deleteFrom(model)
            .where(deleteFilter)
            .$if(this.dialect.supportsReturning, (qb) => qb.returning(fieldsToReturn))
            .$if(limit !== undefined && this.dialect.supportsDeleteWithLimit, (qb) => qb.limit(limit!))
            .modifyEnd(this.makeContextComment({ model, operation: 'delete' }));

        return this.executeQuery(kysely, query, 'delete');
    }

    private async processDelegateRelationDelete(
        kysely: ToKysely<Schema>,
        modelDef: ModelDef,
        where: any,
        limit: number | undefined,
    ) {
        for (const fieldDef of Object.values(modelDef.fields)) {
            if (fieldDef.relation && fieldDef.relation.opposite) {
                const oppositeModelDef = this.requireModel(fieldDef.type);
                const oppositeRelation = this.requireField(fieldDef.type, fieldDef.relation.opposite);
                if (oppositeModelDef.baseModel && oppositeRelation.relation?.onDelete === 'Cascade') {
                    if (limit !== undefined) {
                        throw createNotSupportedError('Deleting with a limit is not supported for polymorphic models');
                    }
                    // the deletion will propagate upward to the base model chain
                    await this.delete(
                        kysely,
                        fieldDef.type as GetModels<Schema>,
                        {
                            [fieldDef.relation.opposite]: where,
                        },
                        undefined,
                    );
                }
            }
        }
    }

    private async processBaseModelDelete(
        kysely: AnyKysely,
        model: string,
        where: any,
        limit: number | undefined,
        filterModel: string,
    ) {
        return this.delete(kysely, model, where, limit, filterModel);
    }

    protected makeIdSelect(model: string) {
        const modelDef = this.requireModel(model);
        return modelDef.idFields.reduce((acc, f) => {
            acc[f] = true;
            return acc;
        }, {} as any);
    }

    protected trimResult(data: any, args: SelectIncludeOmit<Schema, GetModels<Schema>, boolean>) {
        if (!('select' in args) || !args.select) {
            return data;
        }
        return Object.keys(args.select).reduce((acc, field) => {
            acc[field] = data[field];
            return acc;
        }, {} as any);
    }

    protected needReturnRelations(model: string, args: SelectIncludeOmit<Schema, GetModels<Schema>, boolean>) {
        let returnRelation = false;

        if ('include' in args && args.include) {
            returnRelation = Object.keys(args.include).length > 0;
        } else if ('select' in args && args.select) {
            returnRelation = Object.entries(args.select).some(([K, v]) => {
                const fieldDef = this.requireField(model, K);
                return fieldDef.relation && v;
            });
        }
        return returnRelation;
    }

    protected async safeTransaction<T>(callback: (tx: AnyKysely) => Promise<T>, isolationLevel?: IsolationLevel) {
        if (this.kysely.isTransaction) {
            // proceed directly if already in a transaction
            return callback(this.kysely);
        } else {
            // otherwise, create a new transaction and execute the callback
            let txBuilder = this.kysely.transaction();
            txBuilder = txBuilder.setIsolationLevel(isolationLevel ?? TransactionIsolationLevel.ReadCommitted);
            return txBuilder.execute(callback);
        }
    }

    // Given a unique filter of a model, load the entity and return its id fields
    private getEntityIds(kysely: AnyKysely, model: string, uniqueFilter: any) {
        return this.readUnique(kysely, model, {
            where: uniqueFilter,
            select: this.makeIdSelect(model),
        });
    }

    /**
     * Normalize input args to strip `undefined` fields
     */
    protected normalizeArgs(args: unknown) {
        if (!args) {
            return;
        }
        const newArgs = clone(args);
        this.doNormalizeArgs(newArgs);
        return newArgs;
    }

    private doNormalizeArgs(args: unknown) {
        if (args && typeof args === 'object') {
            for (const [key, value] of Object.entries(args)) {
                if (value === undefined) {
                    delete args[key as keyof typeof args];
                } else if (value && isPlainObject(value)) {
                    this.doNormalizeArgs(value);
                }
            }
        }
    }

    protected executeQuery(kysely: ToKysely<Schema>, query: Compilable, _operation: string) {
        return kysely.executeQuery(query.compile());
    }

    protected async executeQueryTakeFirst(kysely: ToKysely<Schema>, query: Compilable, _operation: string) {
        const result = await kysely.executeQuery(query.compile());
        return result.rows[0];
    }

    protected async executeQueryTakeFirstOrThrow(kysely: ToKysely<Schema>, query: Compilable, _operation: string) {
        const result = await kysely.executeQuery(query.compile());
        if (result.rows.length === 0) {
            throw new ORMError(ORMErrorReason.NOT_FOUND, 'No rows found');
        }
        return result.rows[0];
    }

    protected mutationNeedsReadBack(model: string, args: any) {
        if (this.hasPolicyEnabled) {
            // TODO: refactor this check
            // policy enforcement always requires read back
            return { needReadBack: true, selectedFields: undefined };
        }

        if (!this.dialect.supportsReturning) {
            // if the dialect doesn't support RETURNING, we always need read back
            return { needReadBack: true, selectedFields: undefined };
        }

        if (args.include && typeof args.include === 'object' && Object.keys(args.include).length > 0) {
            // includes present, need read back to fetch relations
            return { needReadBack: true, selectedFields: undefined };
        }

        const modelDef = this.requireModel(model);

        if (modelDef.baseModel || modelDef.isDelegate) {
            // polymorphic model, need read back
            return { needReadBack: true, selectedFields: undefined };
        }

        const allFields = Object.keys(modelDef.fields);
        const relationFields = Object.values(modelDef.fields)
            .filter((f) => f.relation)
            .map((f) => f.name);
        const computedFields = Object.values(modelDef.fields)
            .filter((f) => f.computed)
            .map((f) => f.name);

        const allFieldsSelected: string[] = [];

        if (!args.select || typeof args.select !== 'object') {
            // all non-relation fields selected
            allFieldsSelected.push(
                ...allFields.filter(
                    (f) => !relationFields.includes(f) && !this.dialect.shouldOmitField(args.omit, model, f),
                ),
            );
        } else {
            // explicit select
            allFieldsSelected.push(
                ...Object.entries(args.select)
                    .filter(([k, v]) => v && !this.dialect.shouldOmitField(args.omit, model, k))
                    .map(([k]) => k),
            );
        }

        if (allFieldsSelected.some((f) => relationFields.includes(f) || computedFields.includes(f))) {
            // relation or computed field selected, need read back
            return { needReadBack: true, selectedFields: undefined };
        } else {
            return { needReadBack: false, selectedFields: allFieldsSelected };
        }
    }
}
