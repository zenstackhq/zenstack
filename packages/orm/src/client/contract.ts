import {
    type FieldIsArray,
    type GetModels,
    type GetTypeDefs,
    type ProcedureDef,
    type RelationFields,
    type RelationFieldType,
    type SchemaDef,
} from '@zenstackhq/schema';
import type { AnyKysely } from '../utils/kysely-utils';
import type { Simplify, UnwrapTuplePromises } from '../utils/type-utils';
import type { TRANSACTION_UNSUPPORTED_METHODS } from './constants';
import type {
    CrudArgsType,
    CrudReturnType,
    DefaultModelResult,
    ProcedureFunc,
    SelectSubset,
    Subset,
    TypeDefResult,
} from './crud-types';
import type { Diagnostics } from './diagnostics';
import type { ClientOptions, QueryOptions, QueryRelevantOptions } from './options';
import type {
    ExtClientMembersBase,
    ExtQueryArgsBase,
    ExtResultBase,
    ExtResultInferenceArgs,
    RuntimePlugin,
} from './plugin';
import type { ZenStackPromise } from './promise';
import type { ToKysely } from './query-builder';
import type { GetSlicedModels, GetSlicedOperations, GetSlicedProcedures, ModelAllowsCreate } from './type-utils';
import type { ZodSchemaFactory } from './zod/factory';

type TransactionUnsupportedMethods = (typeof TRANSACTION_UNSUPPORTED_METHODS)[number];

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
 * Symbol used as a type-only key on `ClientContract` to brand the `ExtQueryArgs`
 * generic slot. Hidden from member-access autocomplete since symbol keys are
 * not surfaced. Consumed by `InferExtQueryArgs` to recover the slot.
 * @internal
 */
export const ExtQueryArgsMarker: unique symbol = Symbol('zenstack.client.extQueryArgs');

/**
 * Symbol used as a type-only key on `ClientContract` to brand the `ExtResult`
 * generic slot. Consumed by `InferExtResult` to recover the slot.
 * @internal
 */
export const ExtResultMarker: unique symbol = Symbol('zenstack.client.extResult');

/**
 * ZenStack client interface.
 *
 * Note: this alias resolves to an intersection, so it cannot carry variance annotations itself
 * (TS2637). It doesn't need them - measuring its variance recurses into {@link ModelOperations},
 * whose annotations short-circuit the expensive cascade. See {@link CommonModelOperations}.
 */
export type ClientContract<
    Schema extends SchemaDef,
    Options extends ClientOptions<Schema> = ClientOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase = {},
    ExtClientMembers extends ExtClientMembersBase = {},
    ExtResult extends ExtResultBase<Schema> = {},
> = {
    /**
     * The schema definition.
     */
    readonly $schema: Schema;

    /**
     * The client options.
     */
    readonly $options: Options;

    /** @internal type-only brand carrying the `ExtQueryArgs` slot for inference. */
    readonly [ExtQueryArgsMarker]?: ExtQueryArgs;

    /** @internal type-only brand carrying the `ExtResult` slot for inference. */
    readonly [ExtResultMarker]?: ExtResult;

    /**
     * Executes a prepared raw query and returns the number of affected rows.
     * @example
     * ```
     * const result = await db.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
     * ```
     */
    $executeRaw(query: TemplateStringsArray, ...values: any[]): ZenStackPromise<number>;

    /**
     * Executes a raw query and returns the number of affected rows.
     * This method is susceptible to SQL injections.
     * @example
     * ```
     * const result = await db.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
     * ```
     */
    $executeRawUnsafe(query: string, ...values: any[]): ZenStackPromise<number>;

    /**
     * Performs a prepared raw query and returns the `SELECT` data.
     * @example
     * ```
     * const result = await db.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
     * ```
     */
    $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: any[]): ZenStackPromise<T>;

    /**
     * Performs a raw query and returns the `SELECT` data.
     * This method is susceptible to SQL injections.
     * @example
     * ```
     * const result = await db.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
     * ```
     */
    $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): ZenStackPromise<T>;

    /**
     * The current user identity. If the client is not bound to any user context, returns `undefined`.
     */
    get $auth(): AuthType<Schema> | undefined;

    /**
     * Returns a new client bound to the specified user identity. The original client remains unchanged.
     * Pass `undefined` to return a client without any user context.
     *
     * @example
     * ```
     * const userClient = db.$setAuth({ id: 'user-id' });
     * ```
     */
    $setAuth(
        auth: AuthType<Schema> | undefined,
    ): ClientContract<Schema, Options, ExtQueryArgs, ExtClientMembers, ExtResult>;

    /**
     * Returns a new client with new options applied. The original client remains unchanged.
     *
     * @example
     * ```
     * const dbNoValidation = db.$setOptions({ ...db.$options, validateInput: false });
     * ```
     */
    $setOptions<NewOptions extends ClientOptions<Schema>>(
        options: NewOptions,
    ): ClientContract<Schema, NewOptions, ExtQueryArgs, ExtClientMembers, ExtResult>;

    /**
     * Returns a new client enabling/disabling query args validation. The original client remains unchanged.
     *
     * @deprecated Use {@link $setOptions} instead.
     */
    $setInputValidation(enable: boolean): ClientContract<Schema, Options, ExtQueryArgs, ExtClientMembers, ExtResult>;

    /**
     * The Kysely query builder instance.
     *
     * @example
     * ```
     * db.$qb.selectFrom('User').selectAll().where('id', '=', 1).execute();
     * ```
     */
    readonly $qb: ToKysely<Schema>;

    /**
     * The raw Kysely query builder without any ZenStack enhancements.
     */
    readonly $qbRaw: AnyKysely;

    /**
     * Starts an interactive transaction.
     *
     * @example
     * ```
     * await db.$transaction(async (tx) => {
     *   const user = await tx.user.update({ where: { id: 1 }, data: { name: 'Alice' } });
     *   const post = await tx.post.create({ data: { title: 'Hello World', authorId: user.id } });
     *   return { user, posts: [post] };
     * ```
     */
    $transaction<T>(
        callback: (
            tx: TransactionClientContract<Schema, Options, ExtQueryArgs, ExtClientMembers, ExtResult>,
        ) => Promise<T>,
        options?: { isolationLevel?: TransactionIsolationLevel },
    ): Promise<T>;

    /**
     * Starts a sequential transaction that runs the provided operations in order.
     *
     * @example
     * ```
     * await db.$transaction([
     *   db.user.update({ where: { id: 1 }, data: { name: 'Alice' } }),
     *   db.post.create({ data: { title: 'Hello World', authorId: 1 } }),
     * ]);
     */
    $transaction<P extends ZenStackPromise<any>[]>(
        arg: [...P],
        options?: { isolationLevel?: TransactionIsolationLevel },
    ): Promise<UnwrapTuplePromises<P>>;

    /**
     * Returns a new client with the specified plugin installed. The original client remains unchanged.
     *
     * @see {@link https://zenstack.dev/docs/orm/plugins/|Plugin Documentation}
     */
    $use<
        PluginSchema extends SchemaDef = Schema,
        PluginExtQueryArgs extends ExtQueryArgsBase = {},
        PluginExtClientMembers extends ExtClientMembersBase = {},
        PluginExtResult extends ExtResultBase<PluginSchema> = {},
        _R = {}, // auxiliary type for inferring precise typing for `PluginExtResult`
    >(
        plugin: RuntimePlugin<PluginSchema, PluginExtQueryArgs, PluginExtClientMembers, PluginExtResult> & {
            // intersect with the `result` extension field for precise typing
            result?: ExtResultInferenceArgs<Schema, _R>;
        },
    ): ClientContract<
        Schema,
        Options,
        ExtQueryArgs & PluginExtQueryArgs,
        ExtClientMembers & PluginExtClientMembers,
        ExtResult & PluginExtResult
    >;

    /**
     * Returns a new client with the specified plugin removed. The original client remains unchanged.
     */
    $unuse(pluginId: string): ClientContract<Schema, Options, ExtQueryArgs, ExtClientMembers, ExtResult>;

    /**
     * Returns a new client with all plugins removed. The original client remains unchanged.
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
     * Factory for creating zod schemas to validate query args.
     */
    get $zod(): ZodSchemaFactory<Schema, QueryRelevantOptions<Schema, Options>, ExtQueryArgs>;

    /**
     * Pushes the schema to the database. For testing purposes only.
     * @private
     */
    $pushSchema(): Promise<void>;

    /**
     * Returns diagnostics information such as cache and slow query statistics.
     */
    get $diagnostics(): Promise<Diagnostics>;
} & {
    // Project `Options` to its query-relevant subset before fanning out across every model. This
    // strips the heavy `computedFields`/`procedures` function types (never read by these types) so
    // the 30+ `ModelOperations` instantiations stay cheap. See {@link QueryRelevantOptions}.
    [Key in GetSlicedModels<Schema, QueryRelevantOptions<Schema, Options>> as Uncapitalize<Key>]: ModelOperations<
        Schema,
        Key,
        QueryRelevantOptions<Schema, Options>,
        ExtQueryArgs,
        ExtResult
    >;
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
    ExtResult extends ExtResultBase<Schema> = {},
> = Omit<ClientContract<Schema, Options, ExtQueryArgs, ExtClientMembers, ExtResult>, TransactionUnsupportedMethods>;

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
    Options extends QueryOptions<Schema>,
> = Omit<
    {
        // keep only operations included by slicing options
        [Key in keyof T as Key extends GetSlicedOperations<Schema, Model, Options> ? Key : never]: T[Key];
    },
    // exclude create operations for models that don't allow create (delegate models, required Unsupported fields)
    ModelAllowsCreate<Schema, Model> extends true ? never : OperationsRequiringCreate
>;

export type AllModelOperations<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase,
    ExtResult extends ExtResultBase<Schema> = {},
> = CommonModelOperations<Schema, Model, Options, ExtQueryArgs, ExtResult> &
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
                  T extends CrudArgsType<Schema, Model, 'createManyAndReturn', Options, ExtQueryArgs, ExtResult>,
              >(
                  args?: SelectSubset<
                      T,
                      CrudArgsType<Schema, Model, 'createManyAndReturn', Options, ExtQueryArgs, ExtResult>
                  >,
              ): ZenStackPromise<CrudReturnType<Schema, Model, 'createManyAndReturn', T, Options, ExtResult>>;

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
                  T extends CrudArgsType<Schema, Model, 'updateManyAndReturn', Options, ExtQueryArgs, ExtResult>,
              >(
                  args: Subset<T, CrudArgsType<Schema, Model, 'updateManyAndReturn', Options, ExtQueryArgs, ExtResult>>,
              ): ZenStackPromise<CrudReturnType<Schema, Model, 'updateManyAndReturn', T, Options, ExtResult>>;
          });

// Explicit variance annotations bypass TypeScript's structural variance *measurement* for this
// large, deeply-recursive generic. Measurement here comes back "unreliable" (the type recurses
// across related models) and is pure wasted work - it dominated type-check time. The annotations
// below match the measured variance and let the checker skip that probing entirely.
type CommonModelOperations<
    in out Schema extends SchemaDef,
    in out Model extends GetModels<Schema>,
    // `Options` is invariant (it is read for `omit`/`slicing` in both arg and result positions).
    // Annotating it keeps the variance-measurement skip. Note: a client built with an explicit
    // `omit`/`slicing` literal is then no longer assignable to the bare `ClientContract<Schema>`
    // (default options) - schema-agnostic call sites that take `ClientContract<SchemaDef>` should
    // accept the client via a cast. This is a rare pattern and worth the type-check speedup.
    in out Options extends QueryOptions<Schema>,
    in out ExtQueryArgs extends ExtQueryArgsBase,
    out ExtResult extends ExtResultBase<Schema> = {},
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
    findMany<T extends CrudArgsType<Schema, Model, 'findMany', Options, ExtQueryArgs, ExtResult>>(
        args?: SelectSubset<T, CrudArgsType<Schema, Model, 'findMany', Options, ExtQueryArgs, ExtResult>>,
    ): ZenStackPromise<CrudReturnType<Schema, Model, 'findMany', T, Options, ExtResult>>;

    /**
     * Returns a uniquely identified entity.
     * @param args - query args
     * @returns a single entity or null if not found
     * @see {@link findMany}
     */
    findUnique<T extends CrudArgsType<Schema, Model, 'findUnique', Options, ExtQueryArgs, ExtResult>>(
        args: SelectSubset<T, CrudArgsType<Schema, Model, 'findUnique', Options, ExtQueryArgs, ExtResult>>,
    ): ZenStackPromise<CrudReturnType<Schema, Model, 'findUnique', T, Options, ExtResult>>;

    /**
     * Returns a uniquely identified entity or throws `NotFoundError` if not found.
     * @param args - query args
     * @returns a single entity
     * @see {@link findMany}
     */
    findUniqueOrThrow<T extends CrudArgsType<Schema, Model, 'findUniqueOrThrow', Options, ExtQueryArgs, ExtResult>>(
        args: SelectSubset<T, CrudArgsType<Schema, Model, 'findUniqueOrThrow', Options, ExtQueryArgs, ExtResult>>,
    ): ZenStackPromise<CrudReturnType<Schema, Model, 'findUniqueOrThrow', T, Options, ExtResult>>;

    /**
     * Returns the first entity.
     * @param args - query args
     * @returns a single entity or null if not found
     * @see {@link findMany}
     */
    findFirst<T extends CrudArgsType<Schema, Model, 'findFirst', Options, ExtQueryArgs, ExtResult>>(
        args?: SelectSubset<T, CrudArgsType<Schema, Model, 'findFirst', Options, ExtQueryArgs, ExtResult>>,
    ): ZenStackPromise<CrudReturnType<Schema, Model, 'findFirst', T, Options, ExtResult>>;

    /**
     * Returns the first entity or throws `NotFoundError` if not found.
     * @param args - query args
     * @returns a single entity
     * @see {@link findMany}
     */
    findFirstOrThrow<T extends CrudArgsType<Schema, Model, 'findFirstOrThrow', Options, ExtQueryArgs, ExtResult>>(
        args?: SelectSubset<T, CrudArgsType<Schema, Model, 'findFirstOrThrow', Options, ExtQueryArgs, ExtResult>>,
    ): ZenStackPromise<CrudReturnType<Schema, Model, 'findFirstOrThrow', T, Options, ExtResult>>;

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
    create<T extends CrudArgsType<Schema, Model, 'create', Options, ExtQueryArgs, ExtResult>>(
        args: SelectSubset<T, CrudArgsType<Schema, Model, 'create', Options, ExtQueryArgs, ExtResult>>,
    ): ZenStackPromise<CrudReturnType<Schema, Model, 'create', T, Options, ExtResult>>;

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
    createMany<T extends CrudArgsType<Schema, Model, 'createMany', Options, ExtQueryArgs, ExtResult>>(
        args?: SelectSubset<T, CrudArgsType<Schema, Model, 'createMany', Options, ExtQueryArgs, ExtResult>>,
    ): ZenStackPromise<CrudReturnType<Schema, Model, 'createMany', T, Options, ExtResult>>;

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
    update<T extends CrudArgsType<Schema, Model, 'update', Options, ExtQueryArgs, ExtResult>>(
        args: SelectSubset<T, CrudArgsType<Schema, Model, 'update', Options, ExtQueryArgs, ExtResult>>,
    ): ZenStackPromise<CrudReturnType<Schema, Model, 'update', T, Options, ExtResult>>;

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
    updateMany<T extends CrudArgsType<Schema, Model, 'updateMany', Options, ExtQueryArgs, ExtResult>>(
        args: Subset<T, CrudArgsType<Schema, Model, 'updateMany', Options, ExtQueryArgs, ExtResult>>,
    ): ZenStackPromise<CrudReturnType<Schema, Model, 'updateMany', T, Options, ExtResult>>;

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
    upsert<T extends CrudArgsType<Schema, Model, 'upsert', Options, ExtQueryArgs, ExtResult>>(
        args: SelectSubset<T, CrudArgsType<Schema, Model, 'upsert', Options, ExtQueryArgs, ExtResult>>,
    ): ZenStackPromise<CrudReturnType<Schema, Model, 'upsert', T, Options, ExtResult>>;

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
    delete<T extends CrudArgsType<Schema, Model, 'delete', Options, ExtQueryArgs, ExtResult>>(
        args: SelectSubset<T, CrudArgsType<Schema, Model, 'delete', Options, ExtQueryArgs, ExtResult>>,
    ): ZenStackPromise<CrudReturnType<Schema, Model, 'delete', T, Options, ExtResult>>;

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
    deleteMany<T extends CrudArgsType<Schema, Model, 'deleteMany', Options, ExtQueryArgs, ExtResult>>(
        args?: Subset<T, CrudArgsType<Schema, Model, 'deleteMany', Options, ExtQueryArgs, ExtResult>>,
    ): ZenStackPromise<CrudReturnType<Schema, Model, 'deleteMany', T, Options, ExtResult>>;

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
    count<T extends CrudArgsType<Schema, Model, 'count', Options, ExtQueryArgs, ExtResult>>(
        args?: Subset<T, CrudArgsType<Schema, Model, 'count', Options, ExtQueryArgs, ExtResult>>,
    ): ZenStackPromise<Simplify<CrudReturnType<Schema, Model, 'count', T, Options, ExtResult>>>;

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
    aggregate<T extends CrudArgsType<Schema, Model, 'aggregate', Options, ExtQueryArgs, ExtResult>>(
        args: Subset<T, CrudArgsType<Schema, Model, 'aggregate', Options, ExtQueryArgs, ExtResult>>,
    ): ZenStackPromise<Simplify<CrudReturnType<Schema, Model, 'aggregate', T, Options, ExtResult>>>;

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
    groupBy<T extends CrudArgsType<Schema, Model, 'groupBy', Options, ExtQueryArgs, ExtResult>>(
        args: Subset<T, CrudArgsType<Schema, Model, 'groupBy', Options, ExtQueryArgs, ExtResult>>,
    ): ZenStackPromise<Simplify<CrudReturnType<Schema, Model, 'groupBy', T, Options, ExtResult>>>;

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
    exists<T extends CrudArgsType<Schema, Model, 'exists', Options, ExtQueryArgs, ExtResult>>(
        args?: Subset<T, CrudArgsType<Schema, Model, 'exists', Options, ExtQueryArgs, ExtResult>>,
    ): ZenStackPromise<CrudReturnType<Schema, Model, 'exists', T, Options, ExtResult>>;
};

export type OperationsRequiringCreate = 'create' | 'createMany' | 'createManyAndReturn' | 'upsert';

// See the note on `CommonModelOperations` - explicit variance annotations skip the expensive,
// "unreliable" variance measurement of this recursive type.
export type ModelOperations<
    in out Schema extends SchemaDef,
    in out Model extends GetModels<Schema>,
    // `Options` is invariant - see the note on {@link CommonModelOperations}.
    in out Options extends QueryOptions<Schema> = ClientOptions<Schema>,
    in out ExtQueryArgs extends ExtQueryArgsBase = {},
    out ExtResult extends ExtResultBase<Schema> = {},
> = SliceOperations<AllModelOperations<Schema, Model, Options, ExtQueryArgs, ExtResult>, Schema, Model, Options>;

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
