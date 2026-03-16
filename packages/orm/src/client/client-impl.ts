import { invariant, lowerCaseFirst } from '@zenstackhq/common-helpers';
import type { QueryExecutor } from 'kysely';
import {
    CompiledQuery,
    DefaultConnectionProvider,
    DefaultQueryExecutor,
    Kysely,
    Log,
    sql,
    Transaction,
    type KyselyProps,
} from 'kysely';
import z from 'zod';
import type { ProcedureDef, SchemaDef } from '../schema';
import type { AnyKysely } from '../utils/kysely-utils';
import type { UnwrapTuplePromises } from '../utils/type-utils';
import { formatError } from '../utils/zod-utils';
import type {
    AuthType,
    ClientConstructor,
    ClientContract,
    ModelOperations,
    TransactionIsolationLevel,
} from './contract';
import { AggregateOperationHandler } from './crud/operations/aggregate';
import type { AllCrudOperations, CoreCrudOperations } from './crud/operations/base';
import { BaseOperationHandler } from './crud/operations/base';
import { CountOperationHandler } from './crud/operations/count';
import { CreateOperationHandler } from './crud/operations/create';
import { DeleteOperationHandler } from './crud/operations/delete';
import { ExistsOperationHandler } from './crud/operations/exists';
import { FindOperationHandler } from './crud/operations/find';
import { GroupByOperationHandler } from './crud/operations/group-by';
import { UpdateOperationHandler } from './crud/operations/update';
import { InputValidator } from './crud/validator';
import type { Diagnostics, QueryInfo } from './diagnostics';
import { createConfigError, createNotFoundError, createNotSupportedError } from './errors';
import { ZenStackDriver } from './executor/zenstack-driver';
import { ZenStackQueryExecutor } from './executor/zenstack-query-executor';
import * as BuiltinFunctions from './functions';
import { SchemaDbPusher } from './helpers/schema-db-pusher';
import type { ClientOptions, ProceduresOptions } from './options';
import type { AnyPlugin } from './plugin';

type ExtResultFieldDef = {
    needs: Record<string, true>;
    compute: (data: Record<string, any>) => unknown;
};
import { getField } from './query-utils';
import { createZenStackPromise, type ZenStackPromise } from './promise';
import { ResultProcessor } from './result-processor';

/**
 * ZenStack ORM client.
 */
export const ZenStackClient = function <Schema extends SchemaDef>(
    this: any,
    schema: Schema,
    options: ClientOptions<Schema>,
) {
    return new ClientImpl(schema, options as ClientOptions<SchemaDef>);
} as unknown as ClientConstructor;

export class ClientImpl {
    private kysely: AnyKysely;
    private kyselyRaw: AnyKysely;
    public readonly $options: ClientOptions<SchemaDef>;
    public readonly $schema: SchemaDef;
    readonly kyselyProps: KyselyProps;
    private auth: AuthType<SchemaDef> | undefined;
    inputValidator: InputValidator<SchemaDef>;
    readonly slowQueries: QueryInfo[] = [];

    constructor(
        private readonly schema: SchemaDef,
        private options: ClientOptions<SchemaDef>,
        baseClient?: ClientImpl,
        executor?: QueryExecutor,
    ) {
        this.$schema = schema;
        this.$options = options;

        this.$options.functions = {
            ...BuiltinFunctions,
            ...this.$options.functions,
        };

        this.validateOptions(baseClient, options);

        // here we use kysely's props constructor so we can pass a custom query executor
        if (baseClient) {
            this.kyselyProps = {
                ...baseClient.kyselyProps,
                executor:
                    executor ??
                    new ZenStackQueryExecutor(
                        this,
                        baseClient.kyselyProps.driver as ZenStackDriver,
                        baseClient.kyselyProps.dialect.createQueryCompiler(),
                        baseClient.kyselyProps.dialect.createAdapter(),
                        new DefaultConnectionProvider(baseClient.kyselyProps.driver),
                    ),
            };
            this.kyselyRaw = baseClient.kyselyRaw;
            this.auth = baseClient.auth;
            this.slowQueries = baseClient.slowQueries;
        } else {
            const driver = new ZenStackDriver(options.dialect.createDriver(), new Log(this.$options.log ?? []));
            const compiler = options.dialect.createQueryCompiler();
            const adapter = options.dialect.createAdapter();
            const connectionProvider = new DefaultConnectionProvider(driver);

            this.kyselyProps = {
                config: {
                    dialect: options.dialect,
                    log: this.$options.log,
                },
                dialect: options.dialect,
                driver,
                executor: executor ?? new ZenStackQueryExecutor(this, driver, compiler, adapter, connectionProvider),
            };

            // raw kysely instance with default executor
            this.kyselyRaw = new Kysely({
                ...this.kyselyProps,
                executor: new DefaultQueryExecutor(compiler, adapter, connectionProvider, []),
            });
        }

        this.kysely = new Kysely(this.kyselyProps);
        this.inputValidator =
            baseClient?.inputValidator ??
            new InputValidator(this as any, { enabled: this.$options.validateInput !== false });

        return createClientProxy(this);
    }

    private validateOptions(baseClient: ClientImpl | undefined, options: ClientOptions<SchemaDef>) {
        if (!baseClient && !options.skipValidationForComputedFields) {
            // validate computed fields configuration once for the root client
            this.validateComputedFieldsConfig(options);
        }

        if (options.diagnostics) {
            const diagnosticsSchema = z.object({
                slowQueryThresholdMs: z.number().nonnegative().optional(),
                slowQueryMaxRecords: z.int().nonnegative().or(z.literal(Infinity)).optional(),
            });
            const parseResult = diagnosticsSchema.safeParse(options.diagnostics);
            if (!parseResult.success) {
                throw createConfigError(`Invalid diagnostics configuration: ${formatError(parseResult.error)}`);
            }
        }
    }

    /**
     * Validates that all computed fields in the schema have corresponding configurations.
     */
    private validateComputedFieldsConfig(options: ClientOptions<SchemaDef>) {
        const computedFieldsConfig =
            'computedFields' in options ? (options.computedFields as Record<string, any> | undefined) : undefined;

        for (const [modelName, modelDef] of Object.entries(this.$schema.models)) {
            if (modelDef.computedFields) {
                for (const fieldName of Object.keys(modelDef.computedFields)) {
                    const modelConfig = computedFieldsConfig?.[modelName];
                    const fieldConfig = modelConfig?.[fieldName];
                    // Check if the computed field has a configuration
                    if (fieldConfig === null || fieldConfig === undefined) {
                        throw createConfigError(
                            `Computed field "${fieldName}" in model "${modelName}" does not have a configuration. ` +
                                `Please provide an implementation in the computedFields option.`,
                        );
                    }
                    // Check that the configuration is a function
                    if (typeof fieldConfig !== 'function') {
                        throw createConfigError(
                            `Computed field "${fieldName}" in model "${modelName}" has an invalid configuration: ` +
                                `expected a function but received ${typeof fieldConfig}.`,
                        );
                    }
                }
            }
        }
    }

    get $qb() {
        return this.kysely;
    }

    get $qbRaw() {
        return this.kyselyRaw;
    }

    get $zod() {
        return this.inputValidator.zodFactory;
    }

    get isTransaction() {
        return this.kysely.isTransaction;
    }

    /**
     * Create a new client with a new query executor.
     */
    withExecutor(executor: QueryExecutor) {
        return new ClientImpl(this.schema, this.$options, this, executor);
    }

    // overload for interactive transaction
    $transaction<T>(
        callback: (tx: ClientContract<SchemaDef>) => Promise<T>,
        options?: { isolationLevel?: TransactionIsolationLevel },
    ): Promise<T>;

    // overload for sequential transaction
    $transaction<P extends ZenStackPromise<SchemaDef, any>[]>(
        arg: [...P],
        options?: { isolationLevel?: TransactionIsolationLevel },
    ): Promise<UnwrapTuplePromises<P>>;

    // implementation
    async $transaction(input: any, options?: { isolationLevel?: TransactionIsolationLevel }) {
        invariant(
            typeof input === 'function' || (Array.isArray(input) && input.every((p) => p.then && p.cb)),
            'Invalid transaction input, expected a function or an array of ZenStackPromise',
        );
        if (typeof input === 'function') {
            return this.interactiveTransaction(input, options);
        } else {
            return this.sequentialTransaction(input, options);
        }
    }

    forceTransaction() {
        if (!this.kysely.isTransaction) {
            this.kysely = new Transaction(this.kyselyProps);
        }
    }

    private async interactiveTransaction(
        callback: (tx: ClientContract<SchemaDef>) => Promise<any>,
        options?: { isolationLevel?: TransactionIsolationLevel },
    ): Promise<any> {
        if (this.kysely.isTransaction) {
            // proceed directly if already in a transaction
            return callback(this as unknown as ClientContract<SchemaDef>);
        } else {
            // otherwise, create a new transaction, clone the client, and execute the callback
            let txBuilder = this.kysely.transaction();
            if (options?.isolationLevel) {
                txBuilder = txBuilder.setIsolationLevel(options.isolationLevel);
            }
            return txBuilder.execute((tx) => {
                const txClient = new ClientImpl(this.schema, this.$options, this);
                txClient.kysely = tx;
                return callback(txClient as unknown as ClientContract<SchemaDef>);
            });
        }
    }

    private async sequentialTransaction(
        arg: ZenStackPromise<SchemaDef, any>[],
        options?: { isolationLevel?: TransactionIsolationLevel },
    ) {
        const execute = async (tx: AnyKysely) => {
            const txClient = new ClientImpl(this.schema, this.$options, this);
            txClient.kysely = tx;
            const result: any[] = [];
            for (const promise of arg) {
                result.push(await promise.cb(txClient as unknown as ClientContract<SchemaDef>));
            }
            return result;
        };
        if (this.kysely.isTransaction) {
            // proceed directly if already in a transaction
            return execute(this.kysely);
        } else {
            // otherwise, create a new transaction, clone the client, and execute the callback
            let txBuilder = this.kysely.transaction();
            if (options?.isolationLevel) {
                txBuilder = txBuilder.setIsolationLevel(options.isolationLevel);
            }
            return txBuilder.execute((tx) => execute(tx as AnyKysely));
        }
    }

    get $procs() {
        return Object.keys(this.$schema.procedures ?? {}).reduce((acc, name) => {
            // Filter procedures based on slicing configuration
            if (!isProcedureIncluded(this.$options, name)) {
                return acc;
            }
            acc[name] = (input?: unknown) => this.handleProc(name, input);
            return acc;
        }, {} as any);
    }

    private async handleProc(name: string, input: unknown) {
        if (!('procedures' in this.$options) || !this.$options || typeof this.$options.procedures !== 'object') {
            throw createConfigError('Procedures are not configured for the client.');
        }

        const procDef = (this.$schema.procedures ?? {})[name];
        if (!procDef) {
            throw createConfigError(`Procedure "${name}" is not defined in schema.`);
        }

        const procOptions = this.$options.procedures as ProceduresOptions<
            SchemaDef & {
                procedures: Record<string, ProcedureDef>;
            }
        >;
        if (!procOptions[name] || typeof procOptions[name] !== 'function') {
            throw createConfigError(`Procedure "${name}" does not have a handler configured.`);
        }

        // Validate inputs using the same validator infrastructure as CRUD operations.
        const validatedInput = this.inputValidator.validateProcedureInput(name, input);

        const handler = procOptions[name] as Function;

        const invokeWithClient = async (client: any, _input: unknown) => {
            let proceed = async (nextInput: unknown) => {
                const sanitizedNextInput =
                    nextInput && typeof nextInput === 'object' && !Array.isArray(nextInput) ? nextInput : {};

                return handler({ client, ...sanitizedNextInput });
            };

            // apply plugins
            const plugins = [...(client.$options?.plugins ?? [])];
            for (const plugin of plugins) {
                const onProcedure = plugin.onProcedure;
                if (onProcedure) {
                    const _proceed = proceed;
                    proceed = (nextInput: unknown) =>
                        onProcedure({
                            client,
                            name,
                            mutation: !!procDef.mutation,
                            input: nextInput,
                            proceed: (finalInput: unknown) => _proceed(finalInput),
                        }) as Promise<unknown>;
                }
            }

            return proceed(_input);
        };

        return invokeWithClient(this as any, validatedInput);
    }

    async $connect() {
        await this.kysely.connection().execute(async (conn) => {
            await conn.executeQuery(sql`select 1`.compile(this.kysely));
        });
    }

    async $disconnect() {
        await this.kysely.destroy();
    }

    async $pushSchema() {
        await new SchemaDbPusher(this.schema, this.kysely).push();
    }

    $use(plugin: AnyPlugin) {
        const newPlugins: AnyPlugin[] = [...(this.$options.plugins ?? []), plugin];
        const newOptions: ClientOptions<SchemaDef> = {
            ...this.options,
            plugins: newPlugins,
        };
        const newClient = new ClientImpl(this.schema, newOptions, this);
        // create a new validator to have a fresh schema cache, because plugins may extend the
        // query args schemas
        newClient.inputValidator = new InputValidator(newClient as any, {
            enabled: newOptions.validateInput !== false,
        });
        return newClient;
    }

    $unuse(pluginId: string) {
        // tsc perf
        const newPlugins: AnyPlugin[] = [];
        for (const plugin of this.options.plugins ?? []) {
            if (plugin.id !== pluginId) {
                newPlugins.push(plugin);
            }
        }
        const newOptions: ClientOptions<SchemaDef> = {
            ...this.options,
            plugins: newPlugins,
        };
        const newClient = new ClientImpl(this.schema, newOptions, this);
        // create a new validator to have a fresh schema cache, because plugins may
        // extend the query args schemas
        newClient.inputValidator = new InputValidator(newClient as any, {
            enabled: newClient.$options.validateInput !== false,
        });
        return newClient;
    }

    $unuseAll() {
        // tsc perf
        const newOptions: ClientOptions<SchemaDef> = {
            ...this.options,
            plugins: [] as AnyPlugin[],
        };
        const newClient = new ClientImpl(this.schema, newOptions, this);
        // create a new validator to have a fresh schema cache, because plugins may
        // extend the query args schemas
        newClient.inputValidator = new InputValidator(newClient as any, {
            enabled: newOptions.validateInput !== false,
        });
        return newClient;
    }

    $setAuth(auth: AuthType<SchemaDef> | undefined) {
        if (auth !== undefined && typeof auth !== 'object') {
            throw new Error('Invalid auth object');
        }
        const newClient = new ClientImpl(this.schema, this.$options, this);
        newClient.auth = auth;
        return newClient;
    }

    get $auth() {
        return this.auth;
    }

    $setOptions<Options extends ClientOptions<SchemaDef>>(options: Options): ClientContract<SchemaDef, Options> {
        const newClient = new ClientImpl(this.schema, options as ClientOptions<SchemaDef>, this);
        // create a new validator to have a fresh schema cache, because options may change validation settings
        newClient.inputValidator = new InputValidator(newClient as any, {
            enabled: newClient.$options.validateInput !== false,
        });
        return newClient as unknown as ClientContract<SchemaDef, Options>;
    }

    $setInputValidation(enable: boolean) {
        const newOptions: ClientOptions<SchemaDef> = {
            ...this.options,
            validateInput: enable,
        };
        return this.$setOptions(newOptions);
    }

    get $diagnostics(): Promise<Diagnostics> {
        return Promise.resolve({
            zodCache: this.inputValidator.zodFactory.cacheStats,
            slowQueries: this.slowQueries.map((q) => ({ ...q })).sort((a, b) => b.durationMs - a.durationMs),
        });
    }

    $executeRaw(query: TemplateStringsArray, ...values: any[]) {
        return createZenStackPromise(async () => {
            const result = await sql(query, ...values).execute(this.kysely);
            return Number(result.numAffectedRows ?? 0);
        });
    }

    $executeRawUnsafe(query: string, ...values: any[]) {
        return createZenStackPromise(async () => {
            const compiledQuery = this.createRawCompiledQuery(query, values);
            const result = await this.kysely.executeQuery(compiledQuery);
            return Number(result.numAffectedRows ?? 0);
        });
    }

    $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: any[]) {
        return createZenStackPromise(async () => {
            const result = await sql(query, ...values).execute(this.kysely);
            return result.rows as T;
        });
    }

    $queryRawUnsafe<T = unknown>(query: string, ...values: any[]) {
        return createZenStackPromise(async () => {
            const compiledQuery = this.createRawCompiledQuery(query, values);
            const result = await this.kysely.executeQuery(compiledQuery);
            return result.rows as T;
        });
    }

    private createRawCompiledQuery(query: string, values: any[]) {
        const q = CompiledQuery.raw(query, values);
        return { ...q, $raw: true } as CompiledQuery;
    }
}

function createClientProxy(client: ClientImpl): ClientImpl {
    const resultProcessor = new ResultProcessor(client.$schema, client.$options);

    return new Proxy(client, {
        get: (target, prop, receiver) => {
            if (typeof prop === 'string' && prop.startsWith('$')) {
                // Check for plugin-provided members (search in reverse order so later plugins win)
                const plugins = target.$options.plugins ?? [];
                for (let i = plugins.length - 1; i >= 0; i--) {
                    const plugin = plugins[i];
                    const clientMembers = plugin?.client as Record<string, unknown> | undefined;
                    if (clientMembers && prop in clientMembers) {
                        return clientMembers[prop];
                    }
                }
                // Fall through to built-in $ methods
                return Reflect.get(target, prop, receiver);
            }

            if (typeof prop === 'string') {
                const model = Object.keys(client.$schema.models).find((m) => m.toLowerCase() === prop.toLowerCase());
                if (model) {
                    // Check if model is allowed by slicing configuration
                    if (!isModelIncluded(client.$options, model)) {
                        return undefined;
                    }
                    return createModelCrudHandler(client as any, model, client.inputValidator, resultProcessor);
                }
            }

            return Reflect.get(target, prop, receiver);
        },
    }) as unknown as ClientImpl;
}

/**
 * Checks if a model should be included based on slicing configuration.
 */
function isModelIncluded(options: ClientOptions<SchemaDef>, model: string): boolean {
    const slicing = options.slicing;
    if (!slicing) {
        // No slicing config, include all models
        return true;
    }

    const { includedModels, excludedModels } = slicing;

    // If includedModels is specified (even if empty), only include those models
    if (includedModels !== undefined) {
        if (!includedModels.includes(model as any)) {
            return false;
        }
    }

    // Then check if model is excluded
    if (excludedModels && excludedModels.length > 0) {
        if (excludedModels.includes(model as any)) {
            return false;
        }
    }

    return true;
}

/**
 * Checks if a procedure should be included based on slicing configuration.
 */
function isProcedureIncluded(options: ClientOptions<SchemaDef>, procedureName: string): boolean {
    const slicing = options.slicing;
    if (!slicing) {
        // No slicing config, include all procedures
        return true;
    }

    const { includedProcedures, excludedProcedures } = slicing;

    // If includedProcedures is specified (even if empty), only include those procedures
    if (includedProcedures !== undefined) {
        if (!(includedProcedures as readonly string[]).includes(procedureName)) {
            return false;
        }
    }

    // Then check if procedure is excluded (exclusion takes precedence)
    if (excludedProcedures && excludedProcedures.length > 0) {
        if ((excludedProcedures as readonly string[]).includes(procedureName)) {
            return false;
        }
    }

    return true;
}

function createModelCrudHandler(
    client: ClientContract<any>,
    model: string,
    inputValidator: InputValidator<any>,
    resultProcessor: ResultProcessor<any>,
): ModelOperations<any, any> {
    // check if any plugin defines ext result fields
    const plugins = client.$options.plugins ?? [];
    const schema = client.$schema;
    const hasAnyExtResult = hasExtResultFieldDefs(plugins);

    const createPromise = (
        operation: CoreCrudOperations,
        nominalOperation: AllCrudOperations,
        args: unknown,
        handler: BaseOperationHandler<any>,
        postProcess = false,
        throwIfNoResult = false,
    ) => {
        return createZenStackPromise(async (txClient?: ClientContract<any>) => {
            let proceed = async (_args: unknown) => {
                // prepare args for ext result: strip ext result field names from select/omit,
                // inject needs fields into select (recursively handles nested relations)
                const shouldApplyExtResult = hasAnyExtResult && EXT_RESULT_OPERATIONS.has(operation);
                const processedArgs = shouldApplyExtResult
                    ? prepareArgsForExtResult(_args, model, schema, plugins)
                    : _args;

                const _handler = txClient ? handler.withClient(txClient) : handler;
                const r = await _handler.handle(operation, processedArgs);
                if (!r && throwIfNoResult) {
                    throw createNotFoundError(model);
                }
                let result: unknown;
                if (r && postProcess) {
                    result = resultProcessor.processResult(r, model, processedArgs);
                } else {
                    result = r ?? null;
                }

                // compute ext result fields (recursively handles nested relations)
                if (result && shouldApplyExtResult) {
                    result = applyExtResult(result, model, _args, schema, plugins);
                }

                return result;
            };

            // apply plugins
            const plugins = [...(client.$options.plugins ?? [])];
            for (const plugin of plugins) {
                const onQuery = plugin.onQuery;
                if (onQuery) {
                    const _proceed = proceed;
                    proceed = (_args: unknown) => {
                        const ctx: any = {
                            client,
                            model,
                            operation: nominalOperation,
                            // reflect the latest override if provided
                            args: _args,
                            // ensure inner overrides are propagated to the previous proceed
                            proceed: (nextArgs: unknown) => _proceed(nextArgs),
                        };
                        return (onQuery as (ctx: any) => Promise<unknown>)(ctx);
                    };
                }
            }

            return proceed(args);
        });
    };

    // type parameters to operation handlers are explicitly specified to improve tsc performance
    const operations = {
        findUnique: (args: unknown) => {
            return createPromise(
                'findUnique',
                'findUnique',
                args,
                new FindOperationHandler<any>(client, model, inputValidator),
                true,
            );
        },

        findUniqueOrThrow: (args: unknown) => {
            return createPromise(
                'findUnique',
                'findUniqueOrThrow',
                args,
                new FindOperationHandler<any>(client, model, inputValidator),
                true,
                true,
            );
        },

        findFirst: (args: unknown) => {
            return createPromise(
                'findFirst',
                'findFirst',
                args,
                new FindOperationHandler<any>(client, model, inputValidator),
                true,
            );
        },

        findFirstOrThrow: (args: unknown) => {
            return createPromise(
                'findFirst',
                'findFirstOrThrow',
                args,
                new FindOperationHandler<any>(client, model, inputValidator),
                true,
                true,
            );
        },

        findMany: (args: unknown) => {
            return createPromise(
                'findMany',
                'findMany',
                args,
                new FindOperationHandler<any>(client, model, inputValidator),
                true,
                false,
            );
        },

        create: (args: unknown) => {
            return createPromise(
                'create',
                'create',
                args,
                new CreateOperationHandler<any>(client, model, inputValidator),
                true,
            );
        },

        createMany: (args: unknown) => {
            return createPromise(
                'createMany',
                'createMany',
                args,
                new CreateOperationHandler<any>(client, model, inputValidator),
                false,
            );
        },

        createManyAndReturn: (args: unknown) => {
            if (client.$schema.provider.type === 'mysql') {
                throw createNotSupportedError(
                    '"createManyAndReturn" is not supported by "mysql" provider. Use "createMany" or multiple "create" calls instead.',
                );
            }
            return createPromise(
                'createManyAndReturn',
                'createManyAndReturn',
                args,
                new CreateOperationHandler<any>(client, model, inputValidator),
                true,
            );
        },

        update: (args: unknown) => {
            return createPromise(
                'update',
                'update',
                args,
                new UpdateOperationHandler<any>(client, model, inputValidator),
                true,
            );
        },

        updateMany: (args: unknown) => {
            return createPromise(
                'updateMany',
                'updateMany',
                args,
                new UpdateOperationHandler<any>(client, model, inputValidator),
                false,
            );
        },

        updateManyAndReturn: (args: unknown) => {
            if (client.$schema.provider.type === 'mysql') {
                throw createNotSupportedError(
                    '"updateManyAndReturn" is not supported by "mysql" provider. Use "updateMany" or multiple "update" calls instead.',
                );
            }
            return createPromise(
                'updateManyAndReturn',
                'updateManyAndReturn',
                args,
                new UpdateOperationHandler<any>(client, model, inputValidator),
                true,
            );
        },

        upsert: (args: unknown) => {
            return createPromise(
                'upsert',
                'upsert',
                args,
                new UpdateOperationHandler<any>(client, model, inputValidator),
                true,
            );
        },

        delete: (args: unknown) => {
            return createPromise(
                'delete',
                'delete',
                args,
                new DeleteOperationHandler<any>(client, model, inputValidator),
                true,
            );
        },

        deleteMany: (args: unknown) => {
            return createPromise(
                'deleteMany',
                'deleteMany',
                args,
                new DeleteOperationHandler<any>(client, model, inputValidator),
                false,
            );
        },

        count: (args: unknown) => {
            return createPromise(
                'count',
                'count',
                args,
                new CountOperationHandler<any>(client, model, inputValidator),
                false,
            );
        },

        aggregate: (args: unknown) => {
            return createPromise(
                'aggregate',
                'aggregate',
                args,
                new AggregateOperationHandler<any>(client, model, inputValidator),
                false,
            );
        },

        groupBy: (args: unknown) => {
            return createPromise(
                'groupBy',
                'groupBy',
                args,
                new GroupByOperationHandler<any>(client, model, inputValidator),
                true,
            );
        },

        exists: (args: unknown) => {
            return createPromise(
                'exists',
                'exists',
                args,
                new ExistsOperationHandler<any>(client, model, inputValidator),
                false,
            );
        },
    };

    // Filter operations based on slicing configuration
    const slicing = client.$options.slicing;
    if (slicing?.models) {
        const modelSlicing = slicing.models[lowerCaseFirst(model) as any];
        const allSlicing = slicing.models.$all;

        // Determine includedOperations: model-specific takes precedence over $all
        const includedOperations = modelSlicing?.includedOperations ?? allSlicing?.includedOperations;

        // Determine excludedOperations: model-specific takes precedence over $all
        const excludedOperations = modelSlicing?.excludedOperations ?? allSlicing?.excludedOperations;

        // If includedOperations is specified, remove operations not in the list
        if (includedOperations !== undefined) {
            for (const key of Object.keys(operations)) {
                if (!includedOperations.includes(key as any)) {
                    delete (operations as any)[key];
                }
            }
        }

        // Then remove explicitly excluded operations
        if (excludedOperations && excludedOperations.length > 0) {
            for (const operation of excludedOperations) {
                delete (operations as any)[operation];
            }
        }
    }

    return operations as ModelOperations<any, any>;
}

// #region Extended result field helpers

// operations that return model rows and should have ext result fields applied
const EXT_RESULT_OPERATIONS = new Set<CoreCrudOperations>([
    'findMany',
    'findUnique',
    'findFirst',
    'create',
    'createManyAndReturn',
    'update',
    'updateManyAndReturn',
    'upsert',
    'delete',
]);

/**
 * Returns true if any plugin defines ext result fields for any model.
 */
function hasExtResultFieldDefs(plugins: AnyPlugin[]): boolean {
    return plugins.some((p) => p.result && Object.keys(p.result).length > 0);
}

/**
 * Collects extended result field definitions from all plugins for a given model.
 */
function collectExtResultFieldDefs(
    model: string,
    schema: SchemaDef,
    plugins: AnyPlugin[],
): Map<string, ExtResultFieldDef> {
    const defs = new Map<string, ExtResultFieldDef>();
    for (const plugin of plugins) {
        const resultConfig = plugin.result;
        if (resultConfig) {
            const modelConfig = resultConfig[lowerCaseFirst(model)];
            if (modelConfig) {
                for (const [fieldName, fieldDef] of Object.entries(modelConfig)) {
                    if (getField(schema, model, fieldName)) {
                        throw new Error(
                            `Plugin "${plugin.id}" registers ext result field "${fieldName}" on model "${model}" which conflicts with an existing model field`,
                        );
                    }
                    for (const needField of Object.keys((fieldDef as ExtResultFieldDef).needs ?? {})) {
                        const needDef = getField(schema, model, needField);
                        if (!needDef || needDef.relation) {
                            throw new Error(
                                `Plugin "${plugin.id}" registers ext result field "${fieldName}" on model "${model}" with invalid need "${needField}"`,
                            );
                        }
                    }
                    defs.set(fieldName, fieldDef as ExtResultFieldDef);
                }
            }
        }
    }
    return defs;
}

/**
 * Prepares query args for extended result fields (recursive):
 * - Strips ext result field names from `select` and `omit`
 * - Injects `needs` fields into `select` when ext result fields are explicitly selected
 * - Recurses into `include` and `select` for nested relation fields
 */
function prepareArgsForExtResult(
    args: unknown,
    model: string,
    schema: SchemaDef,
    plugins: AnyPlugin[],
): unknown {
    if (!args || typeof args !== 'object') {
        return args;
    }

    const extResultDefs = collectExtResultFieldDefs(model, schema, plugins);
    const typedArgs = args as Record<string, unknown>;
    let result = typedArgs;
    let changed = false;

    const select = typedArgs['select'] as Record<string, unknown> | undefined;
    const omit = typedArgs['omit'] as Record<string, unknown> | undefined;
    const include = typedArgs['include'] as Record<string, unknown> | undefined;

    if (select && extResultDefs.size > 0) {
        const newSelect = { ...select };
        for (const [fieldName, fieldDef] of extResultDefs) {
            if (newSelect[fieldName]) {
                delete newSelect[fieldName];
                // inject needs fields
                for (const needField of Object.keys(fieldDef.needs)) {
                    if (!newSelect[needField]) {
                        newSelect[needField] = true;
                    }
                }
            }
        }
        result = { ...result, select: newSelect };
        changed = true;
    }

    if (omit && extResultDefs.size > 0) {
        const newOmit = { ...omit };
        for (const [fieldName, fieldDef] of extResultDefs) {
            if (newOmit[fieldName]) {
                // strip ext result field names from omit (they don't exist in the DB)
                delete newOmit[fieldName];
            } else {
                // this ext result field is active — ensure its needs are not omitted
                for (const needField of Object.keys(fieldDef.needs)) {
                    if (newOmit[needField]) {
                        delete newOmit[needField];
                    }
                }
            }
        }
        result = { ...result, omit: newOmit };
        changed = true;
    }

    // Recurse into nested relations in `include`
    if (include) {
        const newInclude = { ...include };
        let includeChanged = false;
        for (const [field, value] of Object.entries(newInclude)) {
            if (value && typeof value === 'object') {
                const fieldDef = getField(schema, model, field);
                if (fieldDef?.relation) {
                    const targetModel = fieldDef.type;
                    const processed = prepareArgsForExtResult(value, targetModel, schema, plugins);
                    if (processed !== value) {
                        newInclude[field] = processed;
                        includeChanged = true;
                    }
                }
            }
        }
        if (includeChanged) {
            result = changed ? { ...result, include: newInclude } : { ...typedArgs, include: newInclude };
            changed = true;
        }
    }

    // Recurse into nested relations in `select` (relation fields can have nested args)
    if (select) {
        const currentSelect = (changed ? (result as Record<string, unknown>)['select'] : select) as
            | Record<string, unknown>
            | undefined;
        if (currentSelect) {
            const newSelect = { ...currentSelect };
            let selectChanged = false;
            for (const [field, value] of Object.entries(newSelect)) {
                if (value && typeof value === 'object') {
                    const fieldDef = getField(schema, model, field);
                    if (fieldDef?.relation) {
                        const targetModel = fieldDef.type;
                        const processed = prepareArgsForExtResult(value, targetModel, schema, plugins);
                        if (processed !== value) {
                            newSelect[field] = processed;
                            selectChanged = true;
                        }
                    }
                }
            }
            if (selectChanged) {
                result = { ...result, select: newSelect };
                changed = true;
            }
        }
    }

    return changed ? result : args;
}

/**
 * Applies extended result field computation to query results (recursive).
 * Processes the current model's ext result fields, then recurses into nested relation data.
 */
function applyExtResult(
    result: unknown,
    model: string,
    originalArgs: unknown,
    schema: SchemaDef,
    plugins: AnyPlugin[],
): unknown {
    const extResultDefs = collectExtResultFieldDefs(model, schema, plugins);
    if (Array.isArray(result)) {
        for (let i = 0; i < result.length; i++) {
            result[i] = applyExtResultToRow(result[i], model, originalArgs, schema, plugins, extResultDefs);
        }
        return result;
    } else {
        return applyExtResultToRow(result, model, originalArgs, schema, plugins, extResultDefs);
    }
}

function applyExtResultToRow(
    row: unknown,
    model: string,
    originalArgs: unknown,
    schema: SchemaDef,
    plugins: AnyPlugin[],
    extResultDefs: Map<string, ExtResultFieldDef>,
): unknown {
    if (!row || typeof row !== 'object') {
        return row;
    }

    const data = row as Record<string, unknown>;
    const typedArgs = (originalArgs && typeof originalArgs === 'object' ? originalArgs : {}) as Record<string, unknown>;
    const select = typedArgs['select'] as Record<string, unknown> | undefined;
    const omit = typedArgs['omit'] as Record<string, unknown> | undefined;
    const include = typedArgs['include'] as Record<string, unknown> | undefined;

    // Compute ext result fields for the current model
    for (const [fieldName, fieldDef] of extResultDefs) {
        if (select && !select[fieldName]) {
            continue;
        }
        if (omit?.[fieldName]) {
            continue;
        }
        const needsSatisfied = Object.keys(fieldDef.needs).every((needField) => needField in data);
        if (needsSatisfied) {
            data[fieldName] = fieldDef.compute(data);
        }
    }

    // Strip fields that shouldn't be in the result: when `select` was used,
    // drop any field not in the original select and not a computed ext result field;
    // when `omit` was used, re-delete any field the user originally omitted.
    if (select) {
        for (const key of Object.keys(data)) {
            if (!select[key] && !extResultDefs.has(key)) {
                delete data[key];
            }
        }
    } else if (omit) {
        for (const key of Object.keys(omit)) {
            if (omit[key] && !extResultDefs.has(key)) {
                delete data[key];
            }
        }
    }

    // Recurse into nested relation data
    const relationSource = include ?? select;
    if (relationSource) {
        for (const [field, value] of Object.entries(relationSource)) {
            if (data[field] == null) {
                continue;
            }
            const fieldDef = getField(schema, model, field);
            if (!fieldDef?.relation) {
                continue;
            }
            const targetModel = fieldDef.type;
            const nestedArgs = value && typeof value === 'object' ? value : undefined;
            data[field] = applyExtResult(data[field], targetModel, nestedArgs, schema, plugins);
        }
    }

    return data;
}

// #endregion
