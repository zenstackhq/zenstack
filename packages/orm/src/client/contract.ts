import {
    type FieldIsArray,
    type GetModels,
    type GetTypeDefs,
    type IsDelegateModel,
    type ProcedureDef,
    type RelationFields,
    type RelationFieldType,
    type SchemaDef,
} from '../schema';
import type { AnyKysely } from '../utils/kysely-utils';
import type { Simplify, UnwrapTuplePromises } from '../utils/type-utils';
import type { TRANSACTION_UNSUPPORTED_METHODS } from './constants';
import type {
    AggregateArgs,
    AggregateResult,
    BatchResult,
    CountArgs,
    CountResult,
    CreateArgs,
    CreateManyAndReturnArgs,
    CreateManyArgs,
    DefaultModelResult,
    DeleteArgs,
    DeleteManyArgs,
    ExistsArgs,
    FindFirstArgs,
    FindManyArgs,
    FindUniqueArgs,
    GroupByArgs,
    GroupByResult,
    ProcedureFunc,
    SelectSubset,
    SimplifiedPlainResult,
    Subset,
    TypeDefResult,
    UpdateArgs,
    UpdateManyAndReturnArgs,
    UpdateManyArgs,
    UpsertArgs,
} from './crud-types';
import type {
    CoreCreateOperations,
    CoreCrudOperations,
    CoreDeleteOperations,
    CoreReadOperations,
    CoreUpdateOperations,
} from './crud/operations/base';
import type { ClientOptions, QueryOptions } from './options';
import type { ExtClientMembersBase, ExtQueryArgsBase, RuntimePlugin } from './plugin';
import type { ZenStackPromise } from './promise';
import type { ToKysely } from './query-builder';
import type { GetSlicedModels, GetSlicedOperations, GetSlicedProcedures } from './type-utils';

type TransactionUnsupportedMethods = (typeof TRANSACTION_UNSUPPORTED_METHODS)[number];

/**
 * Extracts extended query args for a specific operation.
 */
type ExtractExtQueryArgs<ExtQueryArgs, Operation extends CoreCrudOperations> = (Operation extends keyof ExtQueryArgs
    ? ExtQueryArgs[Operation]
    : {}) &
    ('$create' extends keyof ExtQueryArgs
        ? Operation extends CoreCreateOperations
            ? ExtQueryArgs['$create']
            : {}
        : {}) &
    ('$read' extends keyof ExtQueryArgs ? (Operation extends CoreReadOperations ? ExtQueryArgs['$read'] : {}) : {}) &
    ('$update' extends keyof ExtQueryArgs
        ? Operation extends CoreUpdateOperations
            ? ExtQueryArgs['$update']
            : {}
        : {}) &
    ('$delete' extends keyof ExtQueryArgs
        ? Operation extends CoreDeleteOperations
            ? ExtQueryArgs['$delete']
            : {}
        : {}) &
    ('$all' extends keyof ExtQueryArgs ? ExtQueryArgs['$all'] : {});

/**
 * Transaction isolation levels.
 */
export enum TransactionIsolationLevel {
    ReadUncommitted = 'read uncommitted',
    ReadCommitted = 'read committed',
    RepeatableRead = 'repeatable read',
    Serializable = 'serializable',
    Snapshot = 'snapshot',
}

/**
 * ZenStack client interface.
 */
export type ClientContract<
    Schema extends SchemaDef,
    Options extends ClientOptions<Schema> = ClientOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase = {},
    ExtClientMembers extends ExtClientMembersBase = {},
> = {
    /**
     * The schema definition.
     */
    readonly $schema: Schema;

    /**
     * The client options.
     */
    readonly $options: Options;

    /**
     * Executes a prepared raw query and returns the number of affected rows.
     * @example
     * ```
     * const result = await db.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
     * ```
     */
    $executeRaw(query: TemplateStringsArray, ...values: any[]): ZenStackPromise<Schema, number>;

    /**
     * Executes a raw query and returns the number of affected rows.
     * This method is susceptible to SQL injections.
     * @example
     * ```
     * const result = await db.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
     * ```
     */
    $executeRawUnsafe(query: string, ...values: any[]): ZenStackPromise<Schema, number>;

    /**
     * Performs a prepared raw query and returns the `SELECT` data.
     * @example
     * ```
     * const result = await db.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
     * ```
     */
    $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: any[]): ZenStackPromise<Schema, T>;

    /**
     * Performs a raw query and returns the `SELECT` data.
     * This method is susceptible to SQL injections.
     * @example
     * ```
     * const result = await db.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
     * ```
     */
    $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): ZenStackPromise<Schema, T>;

    /**
     * The current user identity.
     */
    get $auth(): AuthType<Schema> | undefined;

    /**
     * Sets the current user identity.
     */
    $setAuth(auth: AuthType<Schema> | undefined): ClientContract<Schema, Options, ExtQueryArgs, ExtClientMembers>;

    /**
     * Returns a new client with new options applied.
     * @example
     * ```
     * const dbNoValidation = db.$setOptions({ ...db.$options, validateInput: false });
     * ```
     */
    $setOptions<NewOptions extends ClientOptions<Schema>>(
        options: NewOptions,
    ): ClientContract<Schema, NewOptions, ExtQueryArgs, ExtClientMembers>;

    /**
     * Returns a new client enabling/disabling input validations expressed with attributes like
     * `@email`, `@regex`, `@@validate`, etc.
     *
     * @deprecated Use {@link $setOptions} instead.
     */
    $setInputValidation(enable: boolean): ClientContract<Schema, Options, ExtQueryArgs, ExtClientMembers>;

    /**
     * The Kysely query builder instance.
     */
    readonly $qb: ToKysely<Schema>;

    /**
     * The raw Kysely query builder without any ZenStack enhancements.
     */
    readonly $qbRaw: AnyKysely;

    /**
     * Starts an interactive transaction.
     */
    $transaction<T>(
        callback: (tx: TransactionClientContract<Schema, Options, ExtQueryArgs, ExtClientMembers>) => Promise<T>,
        options?: { isolationLevel?: TransactionIsolationLevel },
    ): Promise<T>;

    /**
     * Starts a sequential transaction.
     */
    $transaction<P extends ZenStackPromise<Schema, any>[]>(
        arg: [...P],
        options?: { isolationLevel?: TransactionIsolationLevel },
    ): Promise<UnwrapTuplePromises<P>>;

    /**
     * Returns a new client with the specified plugin installed.
     */
    $use<
        PluginSchema extends SchemaDef = Schema,
        PluginExtQueryArgs extends ExtQueryArgsBase = {},
        PluginExtClientMembers extends ExtClientMembersBase = {},
    >(
        plugin: RuntimePlugin<PluginSchema, PluginExtQueryArgs, PluginExtClientMembers>,
    ): ClientContract<Schema, Options, ExtQueryArgs & PluginExtQueryArgs, ExtClientMembers & PluginExtClientMembers>;

    /**
     * Returns a new client with the specified plugin removed.
     */
    $unuse(pluginId: string): ClientContract<Schema, Options, ExtQueryArgs, ExtClientMembers>;

    /**
     * Returns a new client with all plugins removed.
     */
    $unuseAll(): ClientContract<Schema, Options>;

    /**
     * Eagerly connects to the database.
     */
    $connect(): Promise<void>;

    /**
     * Explicitly disconnects from the database.
     */
    $disconnect(): Promise<void>;

    /**
     * Pushes the schema to the database. For testing purposes only.
     * @private
     */
    $pushSchema(): Promise<void>;
} & {
    [Key in GetSlicedModels<Schema, Options> as Uncapitalize<Key>]: ModelOperations<Schema, Key, Options, ExtQueryArgs>;
} & ProcedureOperations<Schema, Options> &
    ExtClientMembers;

/**
 * The contract for a client in a transaction.
 */
export type TransactionClientContract<
    Schema extends SchemaDef,
    Options extends ClientOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase,
    ExtClientMembers extends ExtClientMembersBase,
> = Omit<ClientContract<Schema, Options, ExtQueryArgs, ExtClientMembers>, TransactionUnsupportedMethods>;

export type ProcedureOperations<
    Schema extends SchemaDef,
    Options extends ClientOptions<Schema> = ClientOptions<Schema>,
> =
    Schema['procedures'] extends Record<string, ProcedureDef>
        ? {
              /**
               * Custom procedures.
               */
              $procs: {
                  [Key in GetSlicedProcedures<Schema, Options>]: ProcedureFunc<Schema, Key>;
              };
          }
        : {};

/**
 * Creates a new ZenStack client instance.
 */
export interface ClientConstructor {
    new <Schema extends SchemaDef, Options extends ClientOptions<Schema> = ClientOptions<Schema>>(
        schema: Schema,
        options: Options,
    ): ClientContract<Schema, Options>;
}

/**
 * CRUD operations.
 */
export type CRUD = 'create' | 'read' | 'update' | 'delete';

/**
 * Extended CRUD operations including 'post-update'.
 */
export type CRUD_EXT = CRUD | 'post-update';

/**
 * CRUD operations.
 */
export const CRUD = ['create', 'read', 'update', 'delete'] as const;

/**
 * Extended CRUD operations including 'post-update'.
 */
export const CRUD_EXT = [...CRUD, 'post-update'] as const;

// #region Model operations

type SliceOperations<
    T extends Record<string, unknown>,
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends ClientOptions<Schema>,
> = Omit<
    {
        // keep only operations included by slicing options
        [Key in keyof T as Key extends GetSlicedOperations<Schema, Model, Options> ? Key : never]: T[Key];
    },
    // exclude operations not applicable to delegate models
    IsDelegateModel<Schema, Model> extends true ? OperationsIneligibleForDelegateModels : never
>;

export type AllModelOperations<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema>,
    ExtQueryArgs,
> = CommonModelOperations<Schema, Model, Options, ExtQueryArgs> &
    // provider-specific operations
    (Schema['provider']['type'] extends 'mysql'
        ? {}
        : {
              /**
               * Creates multiple entities and returns them.
               * @param args - create args. See {@link createMany} for input. Use
               * `select` and `omit` to control the fields returned.
               * @returns the created entities
               *
               * @example
               * ```ts
               * // create multiple entities and return selected fields
               * await db.user.createManyAndReturn({
               *     data: [
               *         { name: 'Alex', email: 'alex@zenstack.dev' },
               *         { name: 'John', email: 'john@zenstack.dev' }
               *     ],
               *     select: { id: true, email: true }
               * });
               * ```
               */
              createManyAndReturn<
                  T extends CreateManyAndReturnArgs<Schema, Model, Options> &
                      ExtractExtQueryArgs<ExtQueryArgs, 'createManyAndReturn'>,
              >(
                  args?: SelectSubset<
                      T,
                      CreateManyAndReturnArgs<Schema, Model, Options> &
                          ExtractExtQueryArgs<ExtQueryArgs, 'createManyAndReturn'>
                  >,
              ): ZenStackPromise<Schema, SimplifiedPlainResult<Schema, Model, T, Options>[]>;

              /**
               * Updates multiple entities and returns them.
               * @param args - update args. Only scalar fields are allowed for data.
               * @returns the updated entities
               *
               * @example
               * ```ts
               * // update many entities and return selected fields
               * await db.user.updateManyAndReturn({
               *     where: { email: { endsWith: '@zenstack.dev' } },
               *     data: { role: 'ADMIN' },
               *     select: { id: true, email: true }
               * }); // result: `Array<{ id: string; email: string }>`
               *
               * // limit the number of updated entities
               * await db.user.updateManyAndReturn({
               *     where: { email: { endsWith: '@zenstack.dev' } },
               *     data: { role: 'ADMIN' },
               *     limit: 10
               * });
               * ```
               */
              updateManyAndReturn<
                  T extends UpdateManyAndReturnArgs<Schema, Model, Options> &
                      ExtractExtQueryArgs<ExtQueryArgs, 'updateManyAndReturn'>,
              >(
                  args: Subset<
                      T,
                      UpdateManyAndReturnArgs<Schema, Model, Options> &
                          ExtractExtQueryArgs<ExtQueryArgs, 'updateManyAndReturn'>
                  >,
              ): ZenStackPromise<Schema, SimplifiedPlainResult<Schema, Model, T, Options>[]>;
          });

type CommonModelOperations<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema>,
    ExtQueryArgs,
> = {
    /**
     * Returns a list of entities.
     * @param args - query args
     * @returns a list of entities
     *
     * @example
     * ```ts
     * // find all users and return all scalar fields
     * await db.user.findMany();
     *
     * // find all users with name 'Alex'
     * await db.user.findMany({
     *     where: {
     *         name: 'Alex'
     *     }
     * });
     *
     * // select fields
     * await db.user.findMany({
     *     select: {
     *         name: true,
     *         email: true,
     *     }
     * }); // result: `Array<{ name: string, email: string }>`
     *
     * // omit fields
     * await db.user.findMany({
     *     omit: {
     *         name: true,
     *     }
     * }); // result: `Array<{ id: number; email: string; ... }>`
     *
     * // include relations (and all scalar fields)
     * await db.user.findMany({
     *     include: {
     *         posts: true,
     *     }
     * }); // result: `Array<{ ...; posts: Post[] }>`
     *
     * // include relations with filter
     * await db.user.findMany({
     *     include: {
     *         posts: {
     *             where: {
     *                 published: true
     *             }
     *         }
     *     }
     * });
     *
     * // pagination and sorting
     * await db.user.findMany({
     *     skip: 10,
     *     take: 10,
     *     orderBy: [{ name: 'asc' }, { email: 'desc' }],
     * });
     *
     * // pagination with cursor (https://www.prisma.io/docs/orm/prisma-client/queries/pagination#cursor-based-pagination)
     * await db.user.findMany({
     *     cursor: { id: 10 },
     *     skip: 1,
     *     take: 10,
     *     orderBy: { id: 'asc' },
     * });
     *
     * // distinct
     * await db.user.findMany({
     *     distinct: ['name']
     * });
     *
     * // count all relations
     * await db.user.findMany({
     *     _count: true,
     * }); // result: `{ _count: { posts: number; ... } }`
     *
     * // count selected relations
     * await db.user.findMany({
     *     _count: { select: { posts: true } },
     * }); // result: `{ _count: { posts: number } }`
     * ```
     */
    findMany<T extends FindManyArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'findMany'>>(
        args?: SelectSubset<T, FindManyArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'findMany'>>,
    ): ZenStackPromise<Schema, SimplifiedPlainResult<Schema, Model, T, Options>[]>;

    /**
     * Returns a uniquely identified entity.
     * @param args - query args
     * @returns a single entity or null if not found
     * @see {@link findMany}
     */
    findUnique<T extends FindUniqueArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'findUnique'>>(
        args: SelectSubset<T, FindUniqueArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'findUnique'>>,
    ): ZenStackPromise<Schema, SimplifiedPlainResult<Schema, Model, T, Options> | null>;

    /**
     * Returns a uniquely identified entity or throws `NotFoundError` if not found.
     * @param args - query args
     * @returns a single entity
     * @see {@link findMany}
     */
    findUniqueOrThrow<
        T extends FindUniqueArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'findUnique'>,
    >(
        args: SelectSubset<T, FindUniqueArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'findUnique'>>,
    ): ZenStackPromise<Schema, SimplifiedPlainResult<Schema, Model, T, Options>>;

    /**
     * Returns the first entity.
     * @param args - query args
     * @returns a single entity or null if not found
     * @see {@link findMany}
     */
    findFirst<T extends FindFirstArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'findFirst'>>(
        args?: SelectSubset<T, FindFirstArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'findFirst'>>,
    ): ZenStackPromise<Schema, SimplifiedPlainResult<Schema, Model, T, Options> | null>;

    /**
     * Returns the first entity or throws `NotFoundError` if not found.
     * @param args - query args
     * @returns a single entity
     * @see {@link findMany}
     */
    findFirstOrThrow<T extends FindFirstArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'findFirst'>>(
        args?: SelectSubset<T, FindFirstArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'findFirst'>>,
    ): ZenStackPromise<Schema, SimplifiedPlainResult<Schema, Model, T, Options>>;

    /**
     * Creates a new entity.
     * @param args - create args
     * @returns the created entity
     *
     * @example
     * ```ts
     * // simple create
     * await db.user.create({
     *    data: { name: 'Alex', email: 'alex@zenstack.dev' }
     * });
     *
     * // nested create with relation
     * await db.user.create({
     *    data: {
     *        email: 'alex@zenstack.dev',
     *        posts: { create: { title: 'Hello World' } }
     *    }
     * });
     *
     * // you can use `select`, `omit`, and `include` to control
     * // the fields returned by the query, as with `findMany`
     * await db.user.create({
     *    data: {
     *        email: 'alex@zenstack.dev',
     *        posts: { create: { title: 'Hello World' } }
     *    },
     *    include: { posts: true }
     * }); // result: `{ id: number; posts: Post[] }`
     *
     * // connect relations
     * await db.user.create({
     *    data: {
     *        email: 'alex@zenstack.dev',
     *        posts: { connect: { id: 1 } }
     *    }
     * });
     *
     * // connect relations, and create if not found
     * await db.user.create({
     *    data: {
     *        email: 'alex@zenstack.dev',
     *        posts: {
     *            connectOrCreate: {
     *                where: { id: 1 },
     *                create: { title: 'Hello World' }
     *            }
     *        }
     *    }
     * });
     * ```
     */
    create<T extends CreateArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'create'>>(
        args: SelectSubset<T, CreateArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'create'>>,
    ): ZenStackPromise<Schema, SimplifiedPlainResult<Schema, Model, T, Options>>;

    /**
     * Creates multiple entities. Only scalar fields are allowed.
     * @param args - create args
     * @returns count of created entities: `{ count: number }`
     *
     * @example
     * ```ts
     * // create multiple entities
     * await db.user.createMany({
     *     data: [
     *         { name: 'Alex', email: 'alex@zenstack.dev' },
     *         { name: 'John', email: 'john@zenstack.dev' }
     *     ]
     * });
     *
     * // skip items that cause unique constraint violation
     * await db.user.createMany({
     *     data: [
     *         { name: 'Alex', email: 'alex@zenstack.dev' },
     *         { name: 'John', email: 'john@zenstack.dev' }
     *     ],
     *     skipDuplicates: true
     * });
     * ```
     */
    createMany<T extends CreateManyArgs<Schema, Model> & ExtractExtQueryArgs<ExtQueryArgs, 'createMany'>>(
        args?: SelectSubset<T, CreateManyArgs<Schema, Model> & ExtractExtQueryArgs<ExtQueryArgs, 'createMany'>>,
    ): ZenStackPromise<Schema, BatchResult>;

    /**
     * Updates a uniquely identified entity.
     * @param args - update args. See {@link findMany} for how to control
     * fields and relations returned.
     * @returns the updated entity. Throws `NotFoundError` if the entity is not found.
     *
     * @example
     * ```ts
     * // update fields
     * await db.user.update({
     *     where: { id: 1 },
     *     data: { name: 'Alex' }
     * });
     *
     * // connect a relation
     * await db.user.update({
     *     where: { id: 1 },
     *     data: { posts: { connect: { id: 1 } } }
     * });
     *
     * // connect relation, and create if not found
     * await db.user.update({
     *     where: { id: 1 },
     *     data: {
     *         posts: {
     *            connectOrCreate: {
     *                where: { id: 1 },
     *                create: { title: 'Hello World' }
     *            }
     *         }
     *     }
     * });
     *
     * // create many related entities (only available for one-to-many relations)
     * await db.user.update({
     *     where: { id: 1 },
     *     data: {
     *         posts: {
     *             createMany: {
     *                 data: [{ title: 'Hello World' }, { title: 'Hello World 2' }],
     *             }
     *         }
     *     }
     * });
     *
     * // disconnect a one-to-many relation
     * await db.user.update({
     *     where: { id: 1 },
     *     data: { posts: { disconnect: { id: 1 } } }
     * });
     *
     * // disconnect a one-to-one relation
     * await db.user.update({
     *     where: { id: 1 },
     *     data: { profile: { disconnect: true } }
     * });
     *
     * // replace a relation (only available for one-to-many relations)
     * await db.user.update({
     *     where: { id: 1 },
     *     data: {
     *         posts: {
     *             set: [{ id: 1 }, { id: 2 }]
     *         }
     *     }
     * });
     *
     * // update a relation
     * await db.user.update({
     *     where: { id: 1 },
     *     data: {
     *         posts: {
     *             update: { where: { id: 1 }, data: { title: 'Hello World' } }
     *         }
     *     }
     * });
     *
     * // upsert a relation
     * await db.user.update({
     *     where: { id: 1 },
     *     data: {
     *         posts: {
     *             upsert: {
     *                 where: { id: 1 },
     *                 create: { title: 'Hello World' },
     *                 update: { title: 'Hello World' }
     *             }
     *         }
     *     }
     * });
     *
     * // update many related entities (only available for one-to-many relations)
     * await db.user.update({
     *     where: { id: 1 },
     *     data: {
     *         posts: {
     *             updateMany: {
     *                 where: { published: true },
     *                 data: { title: 'Hello World' }
     *             }
     *         }
     *     }
     * });
     *
     * // delete a one-to-many relation
     * await db.user.update({
     *     where: { id: 1 },
     *     data: { posts: { delete: { id: 1 } } }
     * });
     *
     * // delete a one-to-one relation
     * await db.user.update({
     *     where: { id: 1 },
     *     data: { profile: { delete: true } }
     * });
     * ```
     */
    update<T extends UpdateArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'update'>>(
        args: SelectSubset<T, UpdateArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'update'>>,
    ): ZenStackPromise<Schema, SimplifiedPlainResult<Schema, Model, T, Options>>;

    /**
     * Updates multiple entities.
     * @param args - update args. Only scalar fields are allowed for data.
     * @returns count of updated entities: `{ count: number }`
     *
     * @example
     * ```ts
     * // update many entities
     * await db.user.updateMany({
     *     where: { email: { endsWith: '@zenstack.dev' } },
     *     data: { role: 'ADMIN' }
     * });
     *
     * // limit the number of updated entities
     * await db.user.updateMany({
     *     where: { email: { endsWith: '@zenstack.dev' } },
     *     data: { role: 'ADMIN' },
     *     limit: 10
     * });
     */
    updateMany<T extends UpdateManyArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'updateMany'>>(
        args: Subset<T, UpdateManyArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'updateMany'>>,
    ): ZenStackPromise<Schema, BatchResult>;

    /**
     * Creates or updates an entity.
     * @param args - upsert args
     * @returns the upserted entity
     *
     * @example
     * ```ts
     * // upsert an entity
     * await db.user.upsert({
     *     // `where` clause is used to find the entity
     *     where: { id: 1 },
     *     // `create` clause is used if the entity is not found
     *     create: { email: 'alex@zenstack.dev', name: 'Alex' },
     *     // `update` clause is used if the entity is found
     *     update: { name: 'Alex-new' },
     *     // `select` and `omit` can be used to control the returned fields
     *     ...
     * });
     * ```
     */
    upsert<T extends UpsertArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'upsert'>>(
        args: SelectSubset<T, UpsertArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'upsert'>>,
    ): ZenStackPromise<Schema, SimplifiedPlainResult<Schema, Model, T, Options>>;

    /**
     * Deletes a uniquely identifiable entity.
     * @param args - delete args
     * @returns the deleted entity. Throws `NotFoundError` if the entity is not found.
     *
     * @example
     * ```ts
     * // delete an entity
     * await db.user.delete({
     *     where: { id: 1 }
     * });
     *
     * // delete an entity and return selected fields
     * await db.user.delete({
     *     where: { id: 1 },
     *     select: { id: true, email: true }
     * }); // result: `{ id: string; email: string }`
     * ```
     */
    delete<T extends DeleteArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'delete'>>(
        args: SelectSubset<T, DeleteArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'delete'>>,
    ): ZenStackPromise<Schema, SimplifiedPlainResult<Schema, Model, T, Options>>;

    /**
     * Deletes multiple entities.
     * @param args - delete args
     * @returns count of deleted entities: `{ count: number }`
     *
     * @example
     * ```ts
     * // delete many entities
     * await db.user.deleteMany({
     *     where: { email: { endsWith: '@zenstack.dev' } }
     * });
     *
     * // limit the number of deleted entities
     * await db.user.deleteMany({
     *     where: { email: { endsWith: '@zenstack.dev' } },
     *     limit: 10
     * });
     * ```
     */
    deleteMany<T extends DeleteManyArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'deleteMany'>>(
        args?: Subset<T, DeleteManyArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'deleteMany'>>,
    ): ZenStackPromise<Schema, BatchResult>;

    /**
     * Counts rows or field values.
     * @param args - count args
     * @returns `number`, or an object containing count of selected relations
     *
     * @example
     * ```ts
     * // count all
     * await db.user.count();
     *
     * // count with a filter
     * await db.user.count({ where: { email: { endsWith: '@zenstack.dev' } } });
     *
     * // count rows and field values
     * await db.user.count({
     *     select: { _all: true, email: true }
     * }); // result: `{ _all: number, email: number }`
     */
    count<T extends CountArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'count'>>(
        args?: Subset<T, CountArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'count'>>,
    ): ZenStackPromise<Schema, Simplify<CountResult<Schema, Model, T>>>;

    /**
     * Aggregates rows.
     * @param args - aggregation args
     * @returns an object containing aggregated values
     *
     * @example
     * ```ts
     * // aggregate rows
     * await db.profile.aggregate({
     *     where: { email: { endsWith: '@zenstack.dev' } },
     *     _count: true,
     *     _avg: { age: true },
     *     _sum: { age: true },
     *     _min: { age: true },
     *     _max: { age: true }
     * }); // result: `{ _count: number, _avg: { age: number }, ... }`
     */
    aggregate<T extends AggregateArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'aggregate'>>(
        args: Subset<T, AggregateArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'aggregate'>>,
    ): ZenStackPromise<Schema, Simplify<AggregateResult<Schema, Model, T>>>;

    /**
     * Groups rows by columns.
     * @param args - groupBy args
     * @returns an object containing grouped values
     *
     * @example
     * ```ts
     * // group by a field
     * await db.profile.groupBy({
     *     by: 'country',
     *     _count: true
     * }); // result: `Array<{ country: string, _count: number }>`
     *
     * // group by multiple fields
     * await db.profile.groupBy({
     *     by: ['country', 'city'],
     *     _count: true
     * }); // result: `Array<{ country: string, city: string, _count: number }>`
     *
     * // group by with sorting, the `orderBy` fields must be either an aggregation
     * // or a field used in the `by` list
     * await db.profile.groupBy({
     *     by: 'country',
     *     orderBy: { country: 'desc' }
     * });
     *
     * // group by with having (post-aggregation filter), the fields used in `having` must
     * // be either an aggregation, or a field used in the `by` list
     * await db.profile.groupBy({
     *     by: 'country',
     *     having: { country: 'US', age: { _avg: { gte: 18 } } }
     * });
     */
    groupBy<T extends GroupByArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'groupBy'>>(
        args: Subset<T, GroupByArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'groupBy'>>,
    ): ZenStackPromise<Schema, Simplify<GroupByResult<Schema, Model, T>>>;

    /**
     * Checks if an entity exists.
     * @param args - exists args
     * @returns whether a matching entity was found
     *
     * @example
     * ```ts
     * // check if a user exists
     * await db.user.exists({
     *     where: { id: 1 },
     * }); // result: `boolean`
     *
     * // check with a relation
     * await db.user.exists({
     *     where: { posts: { some: { published: true } } },
     * }); // result: `boolean`
     */
    exists<T extends ExistsArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'exists'>>(
        args?: Subset<T, ExistsArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'exists'>>,
    ): ZenStackPromise<Schema, boolean>;
};

export type OperationsIneligibleForDelegateModels = 'create' | 'createMany' | 'createManyAndReturn' | 'upsert';

export type ModelOperations<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends ClientOptions<Schema> = ClientOptions<Schema>,
    ExtQueryArgs = {},
> = SliceOperations<AllModelOperations<Schema, Model, Options, ExtQueryArgs>, Schema, Model, Options>;

//#endregion

//#region Supporting types

/**
 * Type for auth context that includes both scalar and relation fields.
 * Relations are recursively included to allow nested auth data like { user: { profile: { ... } } }
 */
type AuthModelType<Schema extends SchemaDef, Model extends GetModels<Schema>> = Partial<
    DefaultModelResult<Schema, Model>
> & {
    [Key in RelationFields<Schema, Model>]?: FieldIsArray<Schema, Model, Key> extends true
        ? AuthModelType<Schema, RelationFieldType<Schema, Model, Key>>[]
        : AuthModelType<Schema, RelationFieldType<Schema, Model, Key>>;
};

export type AuthType<Schema extends SchemaDef> =
    Schema['authType'] extends GetModels<Schema>
        ? AuthModelType<Schema, Schema['authType']>
        : Schema['authType'] extends GetTypeDefs<Schema>
          ? TypeDefResult<Schema, Schema['authType'], true>
          : Record<string, unknown>;

//#endregion
