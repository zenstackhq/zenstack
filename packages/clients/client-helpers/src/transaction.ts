import type {
    CoreCrudOperations,
    CrudArgsMap,
    CrudReturnMap,
    ExtQueryArgsBase,
    ExtResultBase,
    GetSlicedOperations,
    ModelAllowsCreate,
    OperationsRequiringCreate,
    QueryOptions,
} from '@zenstackhq/orm';
import type { GetModels, SchemaDef } from '@zenstackhq/schema';

/**
 * Operations available in a sequential transaction.
 */
type AllowedTransactionOps<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
> =
    ModelAllowsCreate<Schema, Model> extends true
        ? GetSlicedOperations<Schema, Model, Options> & CoreCrudOperations
        : Exclude<GetSlicedOperations<Schema, Model, Options> & CoreCrudOperations, OperationsRequiringCreate>;

/**
 * Represents a single operation to execute within a sequential transaction.
 *
 * The `model`, `op`, and `args` fields are correlated: `op` is constrained to
 * the CRUD operations available on `model` (respecting `Options['slicing']`), and
 * `args` is typed accordingly.
 */
export type TransactionOperation<
    Schema extends SchemaDef,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase = {},
    ExtResult extends ExtResultBase<Schema> = {},
> = {
    [Model in GetModels<Schema>]: {
        [Op in AllowedTransactionOps<Schema, Model, Options>]: {} extends CrudArgsMap<
            Schema,
            Model,
            Options,
            ExtQueryArgs,
            ExtResult
        >[Op]
            ? { model: Model; op: Op; args?: CrudArgsMap<Schema, Model, Options, ExtQueryArgs, ExtResult>[Op] }
            : { model: Model; op: Op; args: CrudArgsMap<Schema, Model, Options, ExtQueryArgs, ExtResult>[Op] };
    }[AllowedTransactionOps<Schema, Model, Options>];
}[GetModels<Schema>];

/**
 * Maps each operation in a transaction tuple to its precise result type, preserving
 * per-position typing.
 */
export type TransactionResults<
    Schema extends SchemaDef,
    Ops extends readonly TransactionOperation<Schema, any, any, any>[],
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    ExtResult extends ExtResultBase<Schema> = {},
> = {
    [K in keyof Ops]: Ops[K] extends { model: infer M; op: infer O; args?: infer A }
        ? M extends GetModels<Schema>
            ? O extends keyof CrudReturnMap<Schema, M, A, Options, ExtResult>
                ? CrudReturnMap<Schema, M, A, Options, ExtResult>[O]
                : never
            : never
        : never;
};

