import {
    CUSTOM_PROC_ROUTE_NAME,
    TRANSACTION_ROUTE_PREFIX,
    type InferExtQueryArgs,
    type InferExtResult,
    type InferOptions,
    type InferSchema,
    type TransactionOperation,
    type TransactionResults,
} from '@zenstackhq/client-helpers';
import { fetcher, makeUrl, marshal, type FetchFn } from '@zenstackhq/client-helpers/fetch';
import { lowerCaseFirst } from '@zenstackhq/common-helpers';
import type {
    AllModelOperations,
    ClientContract,
    ExtQueryArgsBase,
    ExtResultBase,
    GetProcedure,
    GetProcedureNames,
    GetSlicedModels,
    GetSlicedOperations,
    GetSlicedProcedures,
    ProcedureEnvelope,
    ProcedureFunc,
    QueryOptions,
} from '@zenstackhq/orm';
import type { GetModels, SchemaDef } from '@zenstackhq/schema';

export type { FetchFn } from '@zenstackhq/client-helpers/fetch';
export type { TransactionOperation, TransactionResults };

/**
 * Error codes raised by {@link CrudError}.
 */
export enum CrudErrorCode {
    /** A `*OrThrow` operation found no matching entity. */
    NotFound = 'NotFound',
}

/**
 * Error thrown by CRUD operations on the fetch client.
 */
export class CrudError extends Error {
    readonly code: CrudErrorCode;

    /** Name of the model that caused the error, if applicable. */
    readonly model?: string;

    constructor(code: CrudErrorCode, message: string, model?: string) {
        super(message);
        this.name = 'CrudError';
        this.code = code;
        this.model = model;
    }
}

/**
 * Options for configuring the fetch client.
 */
export type FetchClientOptions = {
    /**
     * The base endpoint for the CRUD API. Must be a fully qualified URL,
     * e.g. `https://example.com/api/model`.
     */
    endpoint: string;

    /**
     * A custom fetch function. Defaults to the global `fetch`.
     */
    fetch?: FetchFn;
};

type ProcedureFn<
    Schema extends SchemaDef,
    ProcName extends GetProcedureNames<Schema>,
    Input = ProcedureEnvelope<Schema, ProcName>,
> = { args: undefined } extends Input
    ? (input?: Input) => Promise<ProcedureReturn<Schema, ProcName>>
    : (input: Input) => Promise<ProcedureReturn<Schema, ProcName>>;

type ProcedureReturn<Schema extends SchemaDef, Name extends GetProcedureNames<Schema>> = Awaited<
    ReturnType<ProcedureFunc<Schema, Name>>
>;

type ProcedureGroup<Schema extends SchemaDef, Options extends QueryOptions<Schema>> = {
    [Name in GetSlicedProcedures<Schema, Options>]: GetProcedure<Schema, Name> extends { mutation: true }
        ? { mutate: ProcedureFn<Schema, Name> }
        : { query: ProcedureFn<Schema, Name> };
};

/**
 * Procedures accessor type. Exists on client only when schema has procedures.
 */
export type ProcedureOperations<Schema extends SchemaDef, Options extends QueryOptions<Schema>> =
    Schema['procedures'] extends Record<string, any>
        ? { $procs: ProcedureGroup<Schema, Options> }
        : Record<never, never>;

/**
 * CRUD operations available on each model. Derived from the ORM's
 * {@link AllModelOperations}, then trimmed by the model's slicing options.
 *
 * The mapped type below uses `T[K]` directly (no `infer A` / `infer R`), which
 * preserves each method's per-call generics intact.
 */
export type ModelOperations<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase = {},
    ExtResult extends ExtResultBase<Schema> = {},
> = {
    [K in keyof AllModelOperations<Schema, Model, Options, ExtQueryArgs, ExtResult> as K extends GetSlicedOperations<
        Schema,
        Model,
        Options
    >
        ? K
        : never]: AllModelOperations<Schema, Model, Options, ExtQueryArgs, ExtResult>[K];
};

/**
 * The full typed client containing per-model operations, optional procedure operations,
 * and sequential transaction support.
 */
export type FetchClient<
    Schema extends SchemaDef,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase = {},
    ExtResult extends ExtResultBase<Schema> = {},
> = {
    [Model in GetSlicedModels<Schema, Options> as `${Uncapitalize<Model>}`]: ModelOperations<
        Schema,
        Model,
        Options,
        ExtQueryArgs,
        ExtResult
    >;
} & ProcedureOperations<Schema, Options> & {
        /**
         * Executes an array of operations atomically as a sequential transaction.
         *
         * Each operation is a typed `{ model, op, args }` object. The result tuple is typed
         * per-position based on each operation's return type.
         *
         * @example
         * ```typescript
         * const [user, post] = await client.$transaction([
         *   { model: 'User', op: 'create', args: { data: { email: 'alice@example.com' } } },
         *   { model: 'Post', op: 'create', args: { data: { title: 'Hello' } } },
         * ]);
         * ```
         */
        $transaction<const Ops extends readonly TransactionOperation<Schema, Options, ExtQueryArgs, ExtResult>[]>(
            operations: Ops,
        ): Promise<TransactionResults<Schema, Ops, Options, ExtResult>>;
    };

function normalizeEndpoint(endpoint: string): string {
    if (typeof endpoint !== 'string' || endpoint.length === 0) {
        throw new Error('`endpoint` is required and must be a non-empty string');
    }
    try {
        new URL(endpoint);
    } catch {
        throw new Error(`\`endpoint\` must be a fully qualified URL, got: ${endpoint}`);
    }
    // strip trailing slash so we can safely concatenate `/model/op`
    return endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
}

function makeGetRequest<R>(endpoint: string, model: string, operation: string, args: unknown, customFetch?: FetchFn) {
    return fetcher<R>(makeUrl(endpoint, model, operation, args), undefined, customFetch);
}

function makeWriteRequest<R>(
    endpoint: string,
    model: string,
    method: 'POST' | 'PUT' | 'DELETE',
    operation: string,
    args: unknown,
    customFetch?: FetchFn,
) {
    const url = method === 'DELETE' ? makeUrl(endpoint, model, operation, args) : makeUrl(endpoint, model, operation);
    const fetchInit: RequestInit = {
        method,
        ...(method !== 'DELETE' && {
            headers: { 'content-type': 'application/json' },
            body: marshal(args),
        }),
    };
    return fetcher<R>(url, fetchInit, customFetch);
}

function buildModelOperations<Schema extends SchemaDef, Model extends GetModels<Schema>>(
    modelName: string,
    endpoint: string,
    customFetch?: FetchFn,
): ModelOperations<Schema, Model, any, any> {
    const get = <R>(op: string, args?: unknown) => makeGetRequest<R>(endpoint, modelName, op, args, customFetch);
    const write = <R>(method: 'POST' | 'PUT' | 'DELETE', op: string, args?: unknown) =>
        makeWriteRequest<R>(endpoint, modelName, method, op, args, customFetch);

    const findUnique = (args: any) => get<unknown>('findUnique', args);
    const findFirst = (args?: any) => get<unknown>('findFirst', args);
    const orThrow = async (op: 'findUnique' | 'findFirst', args: any) => {
        const result = await (op === 'findUnique' ? findUnique(args) : findFirst(args));
        if (result == null) {
            throw new CrudError(CrudErrorCode.NotFound, `No ${modelName} found`, modelName);
        }
        return result;
    };

    return {
        findUnique,
        findUniqueOrThrow: (args: any) => orThrow('findUnique', args),
        findFirst,
        findFirstOrThrow: (args?: any) => orThrow('findFirst', args),
        findMany: (args?: any) => get('findMany', args),
        exists: (args?: any) => get('exists', args),
        count: (args?: any) => get('count', args),
        aggregate: (args: any) => get('aggregate', args),
        groupBy: (args: any) => get('groupBy', args),
        create: (args: any) => write('POST', 'create', args),
        createMany: (args: any) => write('POST', 'createMany', args),
        createManyAndReturn: (args: any) => write('POST', 'createManyAndReturn', args),
        update: (args: any) => write('PUT', 'update', args),
        updateMany: (args: any) => write('PUT', 'updateMany', args),
        updateManyAndReturn: (args: any) => write('PUT', 'updateManyAndReturn', args),
        upsert: (args: any) => write('POST', 'upsert', args),
        delete: (args: any) => write('DELETE', 'delete', args),
        deleteMany: (args?: any) => write('DELETE', 'deleteMany', args),
    } as ModelOperations<Schema, Model, any, any>;
}

/**
 * Creates a fetch-based client that consumes ZenStack's RPC-style auto CRUD API.
 *
 * Accepts either a raw `SchemaDef` or a `ClientContract` type (e.g. `typeof db`) as the
 * generic parameter. When a `ClientContract` type is provided, computed fields from plugins
 * are reflected in the result types.
 *
 * @example
 * ```typescript
 * import { schema } from '~/lib/schema';
 * const client = createClient(schema, { endpoint: 'https://example.com/api/model' });
 *
 * const users = await client.user.findMany();
 * const post = await client.post.create({ data: { title: 'Hello' } });
 *
 * const [user, newPost] = await client.$transaction([
 *   { model: 'User', op: 'create', args: { data: { email: 'alice@example.com' } } },
 *   { model: 'Post', op: 'create', args: { data: { title: 'Hello' } } },
 * ]);
 * ```
 *
 * @param schema The ZModel schema definition.
 * @param options Client configuration options.
 */
export function createClient<SchemaOrClient extends SchemaDef | ClientContract<any, any, any, any, any>>(
    schema: InferSchema<SchemaOrClient>,
    options: FetchClientOptions,
): FetchClient<
    InferSchema<SchemaOrClient>,
    InferOptions<SchemaOrClient, InferSchema<SchemaOrClient>>,
    InferExtQueryArgs<SchemaOrClient> extends ExtQueryArgsBase ? InferExtQueryArgs<SchemaOrClient> : {},
    InferExtResult<SchemaOrClient> extends ExtResultBase<InferSchema<SchemaOrClient>>
        ? InferExtResult<SchemaOrClient>
        : {}
> {
    const endpoint = normalizeEndpoint(options.endpoint);
    const customFetch = options.fetch;

    const result = Object.values(schema.models).reduce((acc, modelDef) => {
        (acc as any)[lowerCaseFirst(modelDef.name)] = buildModelOperations(modelDef.name, endpoint, customFetch);
        return acc;
    }, {} as any);

    const procedures = (schema as any).procedures as Record<string, { mutation?: boolean }> | undefined;
    if (procedures) {
        const procsObj: Record<string, { query?: Function; mutate?: Function }> = {};
        for (const [name, procDef] of Object.entries(procedures)) {
            if (procDef?.mutation) {
                procsObj[name] = {
                    mutate: (input?: any) =>
                        makeWriteRequest(endpoint, CUSTOM_PROC_ROUTE_NAME, 'POST', name, input, customFetch),
                };
            } else {
                procsObj[name] = {
                    query: (input?: any) => makeGetRequest(endpoint, CUSTOM_PROC_ROUTE_NAME, name, input, customFetch),
                };
            }
        }
        result[CUSTOM_PROC_ROUTE_NAME] = procsObj;
    }

    result.$transaction = (operations: readonly TransactionOperation<SchemaDef>[]) => {
        const reqUrl = `${endpoint}/${TRANSACTION_ROUTE_PREFIX}/sequential`;
        return fetcher<unknown[]>(
            reqUrl,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: marshal(operations),
            },
            customFetch,
        );
    };

    return result as any;
}
