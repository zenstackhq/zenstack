import type { OperationNode, QueryId, QueryResult, RootOperationNode, UnknownRow } from 'kysely';
import type { ZodType } from 'zod';
import type { ClientContract, ZModelFunction } from '.';
import type { GetModelFields, GetModels, NonRelationFields, SchemaDef } from '../schema';
import type { MaybePromise } from '../utils/type-utils';
import type { MapModelFieldType } from './crud-types';
import type { AllCrudOperations, CoreCrudOperations } from './crud/operations/base';

type AllowedExtQueryArgKeys = CoreCrudOperations | '$create' | '$read' | '$update' | '$delete' | '$all';

/**
 * Base shape of plugin-extended query args.
 */
export type ExtQueryArgsBase = {
    [K in AllowedExtQueryArgKeys]?: object;
};

/**
 * Base type for plugin-extended client members (methods and properties).
 * Member names should start with '$' to avoid model name conflicts.
 */
export type ExtClientMembersBase = Record<string, unknown>;

/**
 * Base shape of plugin-extended result fields.
 * Keyed by model name, each value maps field names to their definitions.
 * `needs` keys are constrained to non-relation fields of the corresponding model.
 */
export type ExtResultBase<Schema extends SchemaDef = SchemaDef> = {
    [M in GetModels<Schema> as Uncapitalize<M>]?: Record<
        string,
        {
            needs: Partial<Record<NonRelationFields<Schema, M>, true>>;
            compute: (...args: any[]) => any;
        }
    >;
};

/**
 * Mapped type that provides per-field contextual typing for `compute` callbacks
 * based on the `needs` declaration. Uses a separate type parameter `R_` that captures
 * the needs shape (model → field → { neededField: true }), then links each field's
 * `compute` parameter to exactly the keys declared in its `needs`.
 */
export type ExtResultInferenceArgs<Schema extends SchemaDef, R_> = {
    [K in keyof R_ & string]: {
        [P in keyof R_[K]]?: {
            needs?: {
                // constraint for `needs` keys
                [F in keyof R_[K][P]]: F extends NonRelationFields<Schema, ModelNameFromKey<Schema, K>> ? true : never;
            } & Partial<Record<NonRelationFields<Schema, ModelNameFromKey<Schema, K>>, true>>; // further intersects with all possible keys for intellisense

            // refine `computes`'s parameter type based on the inferred type of `needs`
            compute: (data: ExtResultComputeData<Schema, ModelNameFromKey<Schema, K>, R_[K][P]>) => unknown;
        };
    };
};

/**
 * Reverse-maps an uncapitalized key back to the original model name in the schema.
 * E.g., for a schema with model `myModel`, the key `myModel` maps back to `myModel`
 * (not `MyModel` as `Capitalize` would produce).
 */
type ModelNameFromKey<Schema extends SchemaDef, K extends string> = {
    [M in GetModels<Schema>]: Uncapitalize<M> extends K ? M : never;
}[GetModels<Schema>];

/**
 * Maps the needs shape `S` to an object with actual schema field types.
 * For each key in `S` that is a valid non-relation field of model `M`,
 * resolves the TypeScript type from the schema field definition.
 */
type ExtResultComputeData<Schema extends SchemaDef, M extends GetModels<Schema>, S> = {
    [F in keyof S & GetModelFields<Schema, M>]: MapModelFieldType<Schema, M, F>;
};

/**
 * ZenStack runtime plugin.
 */
export interface RuntimePlugin<
    Schema extends SchemaDef,
    ExtQueryArgs extends ExtQueryArgsBase,
    ExtClientMembers extends Record<string, unknown>,
    ExtResult extends ExtResultBase<Schema>,
> {
    /**
     * Plugin ID.
     */
    id: string;

    /**
     * Plugin display name.
     */
    name?: string;

    /**
     * Plugin description.
     */
    description?: string;

    // TODO: revisit
    /**
     * Custom function implementations.
     * @private
     */
    functions?: Record<string, ZModelFunction<Schema>>;

    /**
     * Intercepts an ORM query.
     */
    onQuery?: OnQueryCallback<Schema>;

    /**
     * Intercepts a procedure invocation.
     */
    onProcedure?: OnProcedureCallback<Schema>;

    /**
     * Intercepts an entity mutation.
     */
    onEntityMutation?: EntityMutationHooksDef<Schema>;

    /**
     * Intercepts a Kysely query.
     */
    onKyselyQuery?: OnKyselyQueryCallback<Schema>;

    /**
     * Extended query args configuration.
     */
    queryArgs?: {
        [K in keyof ExtQueryArgs]: ZodType<ExtQueryArgs[K]>;
    };

    /**
     * Extended client members (methods and properties).
     */
    client?: ExtClientMembers;

    /**
     * Extended result fields on query results.
     * Keyed by model name, each value defines computed fields with `needs` and `compute`.
     */
    result?: ExtResult;
}

export type AnyPlugin = RuntimePlugin<any, any, any, any>;

/**
 * Defines a ZenStack runtime plugin based on type of the given schema.
 *
 * @see {@link https://zenstack.dev/docs/orm/plugins/|Plugin Documentation}
 *
 * @example
 * ```typescript
 * definePlugin(schema, {
 *     id: 'my-plugin',
 *     result: {
 *         user: {
 *             fullName: {
 *                 needs: { firstName: true, lastName: true },
 *                 compute: (user) => `${user.firstName} ${user.lastName}`,
 *             },
 *         },
 *     },
 * });
 * ```
 */
export function definePlugin<
    Schema extends SchemaDef,
    const ExtQueryArgs extends ExtQueryArgsBase = {},
    const ExtClientMembers extends Record<string, unknown> = {},
    const ExtResult extends ExtResultBase<Schema> = {},
    R_ = {},
>(
    schema: Schema,
    plugin: RuntimePlugin<Schema, ExtQueryArgs, ExtClientMembers, ExtResult> & {
        result?: ExtResultInferenceArgs<Schema, R_>;
    },
): RuntimePlugin<Schema, ExtQueryArgs, ExtClientMembers, ExtResult>;

/**
 * Defines a ZenStack runtime plugin.
 *
 * @see {@link https://zenstack.dev/docs/orm/plugins/|Plugin Documentation}
 *
 * @example
 * ```typescript
 * definePlugin(schema, {
 *     id: 'my-plugin',
 *     result: {
 *         user: {
 *             fullName: {
 *                 needs: { firstName: true, lastName: true },
 *                 compute: (user) => `${user.firstName} ${user.lastName}`,
 *             },
 *         },
 *     },
 * });
 * ```
 *  */
export function definePlugin<
    Schema extends SchemaDef,
    const ExtQueryArgs extends ExtQueryArgsBase = {},
    const ExtClientMembers extends Record<string, unknown> = {},
    const ExtResult extends ExtResultBase<Schema> = {},
>(
    plugin: RuntimePlugin<Schema, ExtQueryArgs, ExtClientMembers, ExtResult>,
): RuntimePlugin<Schema, ExtQueryArgs, ExtClientMembers, ExtResult>;

export function definePlugin(...args: unknown[]) {
    return args.length === 2 ? args[1] : args[0];
}

// #region OnProcedure hooks

type OnProcedureCallback<Schema extends SchemaDef> = (ctx: OnProcedureHookContext<Schema>) => Promise<unknown>;

export type OnProcedureHookContext<Schema extends SchemaDef> = {
    /**
     * The procedure name.
     */
    name: string;

    /**
     * Whether the procedure is a mutation.
     */
    mutation: boolean;

    /**
     * Procedure invocation input (envelope).
     *
     * The canonical shape is `{ args?: Record<string, unknown> }`.
     * When a procedure has required params, `args` is required.
     */
    input: unknown;

    /**
     * Continues the invocation. The input passed here is forwarded to the next handler.
     */
    proceed: (input: unknown) => Promise<unknown>;

    /**
     * The ZenStack client that is invoking the procedure.
     */
    client: ClientContract<Schema>;
};

// #endregion

// #region OnQuery hooks

type OnQueryCallback<Schema extends SchemaDef> = (ctx: OnQueryHookContext<Schema>) => Promise<unknown>;

type OnQueryHookContext<Schema extends SchemaDef> = {
    /**
     * The model that is being queried.
     */
    model: GetModels<Schema>;

    /**
     * The operation that is being performed.
     */
    operation: AllCrudOperations;

    /**
     * The query arguments.
     */
    args: Record<string, unknown> | undefined;

    /**
     * The function to proceed with the original query.
     * It takes the same arguments as the operation method.
     *
     * @param args The query arguments.
     */
    proceed: (args: Record<string, unknown> | undefined) => Promise<unknown>;

    /**
     * The ZenStack client that is performing the operation.
     */
    client: ClientContract<Schema>;
};

// #endregion

// #region OnEntityMutation hooks

export type EntityMutationHooksDef<Schema extends SchemaDef> = {
    /**
     * Called before entities are mutated.
     */
    beforeEntityMutation?: BeforeEntityMutationCallback<Schema>;

    /**
     * Called after entities are mutated.
     */
    afterEntityMutation?: AfterEntityMutationCallback<Schema>;

    /**
     * Whether to run after-mutation hooks within the transaction that performs the mutation.
     *
     * If set to `true`, if the mutation already runs inside a transaction, the callbacks are
     * executed immediately after the mutation within the transaction boundary. If the mutation
     * is not running inside a transaction, a new transaction is created to run both the mutation
     * and the callbacks.
     *
     * If set to `false`, the callbacks are executed after the mutation transaction is committed.
     *
     * Defaults to `false`.
     */
    runAfterMutationWithinTransaction?: boolean;
};

type MutationHooksArgs<Schema extends SchemaDef> = {
    /**
     * The model that is being mutated.
     */
    model: GetModels<Schema>;

    /**
     * The mutation action that is being performed.
     */
    action: 'create' | 'update' | 'delete';

    /**
     * The mutation data. Only available for create and update actions.
     */
    queryNode: OperationNode;

    /**
     * A query ID that uniquely identifies the mutation operation. You can use it to correlate
     * data between the before and after mutation hooks.
     */
    queryId: QueryId;
};

export type BeforeEntityMutationCallback<Schema extends SchemaDef> = (
    args: PluginBeforeEntityMutationArgs<Schema>,
) => MaybePromise<void>;

export type AfterEntityMutationCallback<Schema extends SchemaDef> = (
    args: PluginAfterEntityMutationArgs<Schema>,
) => MaybePromise<void>;

export type PluginBeforeEntityMutationArgs<Schema extends SchemaDef> = MutationHooksArgs<Schema> & {
    /**
     * Loads the entities that are about to be mutated. The db operation that loads the entities is executed
     * within the same transaction context as the mutation.
     */
    loadBeforeMutationEntities(): Promise<Record<string, unknown>[] | undefined>;

    /**
     * The ZenStack client you can use to perform additional operations. The database operations initiated
     * from this client are executed within the same transaction as the mutation if the mutation is running
     * inside a transaction.
     *
     * Mutations initiated from this client will NOT trigger entity mutation hooks to avoid infinite loops.
     */
    client: ClientContract<Schema>;
};

export type PluginAfterEntityMutationArgs<Schema extends SchemaDef> = MutationHooksArgs<Schema> & {
    /**
     * Loads the entities that have been mutated.
     */
    loadAfterMutationEntities(): Promise<Record<string, unknown>[] | undefined>;

    /**
     * The entities before mutation. Only available if `beforeEntityMutation` hook is provided and
     * the `loadBeforeMutationEntities` function is called in that hook.
     */
    beforeMutationEntities?: Record<string, unknown>[];

    /**
     * The ZenStack client you can use to perform additional operations.
     * See {@link EntityMutationHooksDef.runAfterMutationWithinTransaction} for detailed transaction behavior.
     *
     * Mutations initiated from this client will NOT trigger entity mutation hooks to avoid infinite loops.
     */
    client: ClientContract<Schema>;
};

// #endregion

// #region OnKyselyQuery hooks

export type OnKyselyQueryArgs<Schema extends SchemaDef> = {
    schema: SchemaDef;
    client: ClientContract<Schema>;
    query: RootOperationNode;
    proceed: ProceedKyselyQueryFunction;
};

export type ProceedKyselyQueryFunction = (query: RootOperationNode) => Promise<QueryResult<any>>;

export type OnKyselyQueryCallback<Schema extends SchemaDef> = (
    args: OnKyselyQueryArgs<Schema>,
) => Promise<QueryResult<UnknownRow>>;

// #endregion
