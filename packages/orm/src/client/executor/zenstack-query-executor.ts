import { invariant } from '@zenstackhq/common-helpers';
import type { QueryId } from 'kysely';
import {
    AndNode,
    ColumnNode,
    ColumnUpdateNode,
    CompiledQuery,
    createQueryId,
    DefaultQueryExecutor,
    DeleteQueryNode,
    expressionBuilder,
    InsertQueryNode,
    PrimitiveValueListNode,
    ReturningNode,
    SelectionNode,
    SelectQueryNode,
    SingleConnectionProvider,
    TableNode,
    UpdateQueryNode,
    ValueNode,
    ValuesNode,
    WhereNode,
    type ConnectionProvider,
    type DatabaseConnection,
    type DialectAdapter,
    type KyselyPlugin,
    type OperationNode,
    type QueryCompiler,
    type QueryResult,
    type RootOperationNode,
} from 'kysely';
import { match } from 'ts-pattern';
import type { ModelDef, SchemaDef, TypeDefDef } from '../../schema';
import type { ClientImpl } from '../client-impl';
import { TransactionIsolationLevel, type ClientContract } from '../contract';
import { getCrudDialect } from '../crud/dialects';
import type { BaseCrudDialect } from '../crud/dialects/base-dialect';
import { createDBQueryError, createInternalError, ORMError } from '../errors';
import type { AfterEntityMutationCallback, OnKyselyQueryCallback } from '../plugin';
import { requireIdFields, stripAlias } from '../query-utils';
import { QueryNameMapper } from './name-mapper';
import { TempAliasTransformer } from './temp-alias-transformer';
import type { ZenStackDriver } from './zenstack-driver';

type MutationQueryNode = InsertQueryNode | UpdateQueryNode | DeleteQueryNode;

type MutationInfo = {
    model: string;
    action: 'create' | 'update' | 'delete';
    where: WhereNode | undefined;
};

type CallBeforeMutationHooksArgs = {
    queryNode: OperationNode;
    mutationInfo: MutationInfo;
    loadBeforeMutationEntities: () => Promise<Record<string, unknown>[] | undefined>;
    client: ClientContract<SchemaDef>;
    queryId: QueryId;
};

type CallAfterMutationHooksArgs = {
    queryResult: QueryResult<unknown>;
    queryNode: OperationNode;
    mutationInfo: MutationInfo;
    client: ClientContract<SchemaDef>;
    filterFor: 'inTx' | 'outTx' | 'all';
    connection: DatabaseConnection;
    queryId: QueryId;
    beforeMutationEntities?: Record<string, unknown>[];
    afterMutationEntities?: Record<string, unknown>[];
};

const DEFAULT_MAX_SLOW_RECORDS = 100;

export class ZenStackQueryExecutor extends DefaultQueryExecutor {
    // #region constructor, fields and props

    private readonly nameMapper: QueryNameMapper | undefined;
    private readonly dialect: BaseCrudDialect<SchemaDef>;

    constructor(
        private client: ClientImpl,
        private readonly driver: ZenStackDriver,
        private readonly compiler: QueryCompiler,
        adapter: DialectAdapter,
        private readonly connectionProvider: ConnectionProvider,
        plugins: KyselyPlugin[] = [],
        private suppressMutationHooks: boolean = false,
    ) {
        super(compiler, adapter, connectionProvider, plugins);

        if (
            client.$schema.provider.type === 'postgresql' || // postgres queries need to be schema-qualified
            this.schemaHasMappedNames(client.$schema)
        ) {
            this.nameMapper = new QueryNameMapper(client as unknown as ClientContract<SchemaDef>);
        }

        this.dialect = getCrudDialect(client.$schema, client.$options);
    }

    private schemaHasMappedNames(schema: SchemaDef) {
        const hasMapAttr = (decl: ModelDef | TypeDefDef) => {
            if (decl.attributes?.some((attr) => attr.name === '@@map')) {
                return true;
            }
            return Object.values(decl.fields).some((field) => field.attributes?.some((attr) => attr.name === '@map'));
        };

        return Object.values(schema.models).some(hasMapAttr) || Object.values(schema.typeDefs ?? []).some(hasMapAttr);
    }

    private get kysely() {
        return this.client.$qb;
    }

    private get options() {
        return this.client.$options;
    }

    private get hasEntityMutationPlugins() {
        return (this.client.$options.plugins ?? []).some((plugin) => plugin.onEntityMutation);
    }

    private get hasEntityMutationPluginsWithAfterMutationHooks() {
        return (this.client.$options.plugins ?? []).some((plugin) => plugin.onEntityMutation?.afterEntityMutation);
    }

    private get hasOnKyselyHooks() {
        return (this.client.$options.plugins ?? []).some((plugin) => plugin.onKyselyQuery);
    }

    // #endregion

    // #region main entry point

    override async executeQuery(compiledQuery: CompiledQuery) {
        // proceed with the query with kysely interceptors
        // if the query is a raw query, we need to carry over the parameters
        const queryParams = (compiledQuery as any).$raw ? compiledQuery.parameters : undefined;

        // needs to ensure transaction if we:
        // - have plugins with Kysely hooks, as they may spawn more queries (check: should creating tx be plugin's responsibility?)
        // - have entity mutation plugins
        const needEnsureTx = this.hasOnKyselyHooks || this.hasEntityMutationPlugins;

        const result = await this.provideConnection(async (connection) => {
            let startedTx = false;
            try {
                // mutations are wrapped in tx if not already in one
                if (
                    this.isMutationNode(compiledQuery.query) &&
                    !this.driver.isTransactionConnection(connection) &&
                    needEnsureTx
                ) {
                    await this.driver.beginTransaction(connection, {
                        isolationLevel: TransactionIsolationLevel.ReadCommitted,
                    });
                    startedTx = true;
                }
                const result = await this.proceedQueryWithKyselyInterceptors(
                    connection,
                    compiledQuery.query,
                    queryParams,
                    compiledQuery.queryId,
                );
                if (startedTx) {
                    await this.driver.commitTransaction(connection);
                }
                return result;
            } catch (err) {
                if (startedTx) {
                    await this.driver.rollbackTransaction(connection);
                }
                if (err instanceof ORMError) {
                    throw err;
                } else {
                    // wrap error
                    throw createDBQueryError(
                        `Failed to execute query: ${err}`,
                        err,
                        compiledQuery.sql,
                        compiledQuery.parameters,
                    );
                }
            }
        });

        return this.ensureProperQueryResult(compiledQuery.query, result);
    }

    private async proceedQueryWithKyselyInterceptors(
        connection: DatabaseConnection,
        queryNode: RootOperationNode,
        parameters: readonly unknown[] | undefined,
        queryId: QueryId,
    ) {
        let proceed = (q: RootOperationNode) => this.proceedQuery(connection, q, parameters, queryId);

        const hooks: OnKyselyQueryCallback<SchemaDef>[] = [];
        // tsc perf
        for (const plugin of this.client.$options.plugins ?? []) {
            if (plugin.onKyselyQuery) {
                hooks.push(plugin.onKyselyQuery.bind(plugin));
            }
        }

        for (const hook of hooks) {
            const _proceed = proceed;
            proceed = async (query: RootOperationNode) => {
                const _p = (q: RootOperationNode) => _proceed(q);
                const hookResult = await hook!({
                    client: this.client as unknown as ClientContract<SchemaDef>,
                    schema: this.client.$schema,
                    query,
                    proceed: _p,
                });
                return hookResult;
            };
        }

        const result = await proceed(queryNode);

        return result;
    }

    private async proceedQuery(
        connection: DatabaseConnection,
        query: RootOperationNode,
        parameters: readonly unknown[] | undefined,
        queryId: QueryId,
    ) {
        if (this.suppressMutationHooks || !this.isMutationNode(query) || !this.hasEntityMutationPlugins) {
            // no need to handle mutation hooks, just proceed
            return this.internalExecuteQuery(query, connection, queryId, parameters);
        }

        let preUpdateIds: Record<string, unknown>[] | undefined;
        const mutationModel = this.getMutationModel(query);
        const needLoadAfterMutationEntities =
            (InsertQueryNode.is(query) || UpdateQueryNode.is(query)) &&
            this.hasEntityMutationPluginsWithAfterMutationHooks;

        if (needLoadAfterMutationEntities) {
            if (this.dialect.supportsReturning) {
                // need to make sure the query node has "returnAll" for insert and update queries
                // so that after-mutation hooks can get the mutated entities with all fields
                query = {
                    ...query,
                    returning: ReturningNode.create([SelectionNode.createSelectAll()]),
                };
            } else {
                if (UpdateQueryNode.is(query)) {
                    // if we're updating and the dialect doesn't support RETURNING, need to load
                    // entity IDs before the update in so we can use them to load the entities
                    // after the update
                    preUpdateIds = await this.getPreUpdateIds(mutationModel, query, connection);
                }
            }
        }

        // the client passed to hooks needs to be in sync with current in-transaction
        // status so that it doesn't try to create a nested one
        const currentlyInTx = this.driver.isTransactionConnection(connection);

        const connectionClient = this.createClientForConnection(connection, currentlyInTx);

        const mutationInfo = this.getMutationInfo(query);

        // cache already loaded before-mutation entities
        let beforeMutationEntities: Record<string, unknown>[] | undefined;
        const loadBeforeMutationEntities = async () => {
            if (beforeMutationEntities === undefined && (UpdateQueryNode.is(query) || DeleteQueryNode.is(query))) {
                beforeMutationEntities = await this.loadEntities(
                    mutationInfo.model,
                    mutationInfo.where,
                    connection,
                    undefined,
                );
            }
            return beforeMutationEntities;
        };

        // call before mutation hooks
        await this.callBeforeMutationHooks({
            queryNode: query,
            mutationInfo,
            loadBeforeMutationEntities,
            client: connectionClient,
            queryId,
        });

        // execute the final query
        const result = await this.internalExecuteQuery(query, connection, queryId, parameters);

        let afterMutationEntities: Record<string, unknown>[] | undefined;
        if (needLoadAfterMutationEntities) {
            afterMutationEntities = await this.loadAfterMutationEntities(
                mutationInfo,
                query,
                result,
                connection,
                preUpdateIds,
            );
        }

        const baseArgs: CallAfterMutationHooksArgs = {
            queryResult: result,
            queryNode: query,
            mutationInfo,
            filterFor: 'all',
            client: connectionClient,
            connection,
            queryId,
            beforeMutationEntities,
            afterMutationEntities,
        };

        if (!this.driver.isTransactionConnection(connection)) {
            // not in a transaction, just call all after-mutation hooks
            await this.callAfterMutationHooks({
                ...baseArgs,
                filterFor: 'all',
            });
        } else {
            // run after-mutation hooks that are requested to be run inside tx
            await this.callAfterMutationHooks({
                ...baseArgs,
                filterFor: 'inTx',
            });

            // register other after-mutation hooks to be run after the tx is committed
            this.driver.registerTransactionCommitCallback(connection, () =>
                this.callAfterMutationHooks({
                    ...baseArgs,
                    filterFor: 'outTx',
                }),
            );
        }

        return result;
    }

    // #endregion

    // #region before and after mutation hooks

    private async callBeforeMutationHooks(args: CallBeforeMutationHooksArgs) {
        const { queryNode, mutationInfo, loadBeforeMutationEntities, client, queryId } = args;

        if (this.options.plugins) {
            for (const plugin of this.options.plugins) {
                const onEntityMutation = plugin.onEntityMutation;
                if (!onEntityMutation?.beforeEntityMutation) {
                    continue;
                }

                await onEntityMutation.beforeEntityMutation({
                    model: mutationInfo.model,
                    action: mutationInfo.action,
                    queryNode,
                    loadBeforeMutationEntities,
                    client,
                    queryId,
                });
            }
        }
    }

    private async callAfterMutationHooks(args: CallAfterMutationHooksArgs) {
        const { queryNode, mutationInfo, client, filterFor, queryId, beforeMutationEntities, afterMutationEntities } =
            args;

        const hooks: AfterEntityMutationCallback<SchemaDef>[] = [];

        // tsc perf
        for (const plugin of this.options.plugins ?? []) {
            const onEntityMutation = plugin.onEntityMutation;

            if (!onEntityMutation?.afterEntityMutation) {
                continue;
            }
            if (filterFor === 'inTx' && !onEntityMutation.runAfterMutationWithinTransaction) {
                continue;
            }

            if (filterFor === 'outTx' && onEntityMutation.runAfterMutationWithinTransaction) {
                continue;
            }

            hooks.push(onEntityMutation.afterEntityMutation.bind(plugin));
        }

        if (hooks.length === 0) {
            return;
        }

        for (const hook of hooks) {
            await hook({
                model: mutationInfo.model,
                action: mutationInfo.action,
                queryNode,
                loadAfterMutationEntities: () => Promise.resolve(afterMutationEntities),
                beforeMutationEntities,
                client,
                queryId,
            });
        }
    }

    private async loadAfterMutationEntities(
        mutationInfo: MutationInfo,
        queryNode: OperationNode,
        queryResult: QueryResult<unknown>,
        connection: DatabaseConnection,
        preUpdateIds: Record<string, unknown>[] | undefined,
    ): Promise<Record<string, unknown>[] | undefined> {
        if (mutationInfo.action === 'delete') {
            return undefined;
        }

        if (this.dialect.supportsReturning) {
            // entities are returned in the query result
            return queryResult.rows as Record<string, unknown>[];
        } else {
            const mutatedIds = InsertQueryNode.is(queryNode)
                ? this.getInsertIds(mutationInfo.model, queryNode, queryResult)
                : preUpdateIds;

            if (mutatedIds) {
                const idFields = requireIdFields(this.client.$schema, mutationInfo.model);
                const eb = expressionBuilder<any, any>();
                const filter = eb(
                    // @ts-ignore
                    eb.refTuple(...idFields),
                    'in',
                    mutatedIds.map((idObj) =>
                        eb.tuple(
                            // @ts-ignore
                            ...idFields.map((idField) => eb.val(idObj[idField] as any)),
                        ),
                    ),
                );
                const entities = await this.loadEntities(
                    mutationInfo.model,
                    WhereNode.create(filter.toOperationNode()),
                    connection,
                    undefined,
                );
                return entities;
            } else {
                console.warn(
                    `Unable to load after-mutation entities for hooks: model "${mutationInfo.model}", operation "${mutationInfo.action}".
This happens when the following conditions are met:

1. The database does not support RETURNING clause for INSERT/UPDATE, e.g., MySQL.
2. The mutation creates or updates multiple entities at once.
3. For create: the model does not have all ID fields explicitly set in the mutation data.
4. For update: the mutation modifies ID fields.

In such cases, ZenStack cannot reliably determine the IDs of the mutated entities to reload them.
`,
                );
                return [];
            }
        }
    }

    private async getPreUpdateIds(mutationModel: string, query: UpdateQueryNode, connection: DatabaseConnection) {
        // Get the ID fields for this model
        const idFields = requireIdFields(this.client.$schema, mutationModel);

        // Check if the update modifies any ID fields
        if (query.updates) {
            for (const update of query.updates) {
                if (ColumnUpdateNode.is(update)) {
                    // Extract the column name from the update
                    const columnNode = update.column;
                    if (ColumnNode.is(columnNode)) {
                        const columnName = columnNode.column.name;
                        if (idFields.includes(columnName)) {
                            // ID field is being updated, return undefined
                            return undefined;
                        }
                    }
                }
            }
        }

        // No ID fields are being updated, load the entities
        return await this.loadEntities(this.getMutationModel(query), query.where, connection, idFields);
    }

    private getInsertIds(
        mutationModel: string,
        query: InsertQueryNode,
        queryResult: QueryResult<unknown>,
    ): Record<string, unknown>[] | undefined {
        const idFields = requireIdFields(this.client.$schema, mutationModel);

        if (
            InsertQueryNode.is(query) &&
            queryResult.numAffectedRows === 1n &&
            queryResult.insertId &&
            idFields.length === 1
        ) {
            // single row creation, return the insertId directly
            return [
                {
                    [idFields[0]!]: queryResult.insertId,
                },
            ];
        }

        const columns = query.columns;
        if (!columns) {
            return undefined;
        }

        const values = query.values;
        if (!values || !ValuesNode.is(values)) {
            return undefined;
        }

        // Extract ID values for each row
        const allIds: Record<string, unknown>[] = [];
        for (const valuesItem of values.values) {
            const rowIds: Record<string, unknown> = {};

            if (PrimitiveValueListNode.is(valuesItem)) {
                // PrimitiveValueListNode case
                invariant(valuesItem.values.length === columns.length, 'Values count must match columns count');
                for (const idField of idFields) {
                    const colIndex = columns.findIndex((col) => col.column.name === idField);
                    if (colIndex === -1) {
                        // ID field not included in insert columns
                        return undefined;
                    }
                    rowIds[idField] = valuesItem.values[colIndex];
                }
            } else {
                // ValueListNode case
                invariant(valuesItem.values.length === columns.length, 'Values count must match columns count');
                for (const idField of idFields) {
                    const colIndex = columns.findIndex((col) => col.column.name === idField);
                    if (colIndex === -1) {
                        // ID field not included in insert columns
                        return undefined;
                    }
                    const valueNode = valuesItem.values[colIndex];
                    if (!valueNode || !ValueNode.is(valueNode)) {
                        // not a literal value
                        return undefined;
                    }
                    rowIds[idField] = valueNode.value;
                }
            }

            allIds.push(rowIds);
        }

        return allIds;
    }

    private async loadEntities(
        model: string,
        where: WhereNode | undefined,
        connection: DatabaseConnection,
        fieldsToLoad: readonly string[] | undefined,
    ): Promise<Record<string, unknown>[]> {
        let selectQuery = this.kysely.selectFrom(model);
        if (fieldsToLoad) {
            selectQuery = selectQuery.select(fieldsToLoad);
        } else {
            selectQuery = selectQuery.selectAll();
        }
        let selectQueryNode = selectQuery.toOperationNode() as SelectQueryNode;
        selectQueryNode = {
            ...selectQueryNode,
            where: this.andNodes(selectQueryNode.where, where),
        };
        // execute the query directly with the given connection to avoid triggering
        // any other side effects
        const result = await this.internalExecuteQuery(selectQueryNode, connection);
        return result.rows as Record<string, unknown>[];
    }

    // #endregion

    // #region utilities

    private getMutationInfo(queryNode: MutationQueryNode): MutationInfo {
        const model = this.getMutationModel(queryNode);
        const { action, where } = match(queryNode)
            .when(InsertQueryNode.is, () => ({
                action: 'create' as const,
                where: undefined,
            }))
            .when(UpdateQueryNode.is, (node) => ({
                action: 'update' as const,
                where: node.where,
            }))
            .when(DeleteQueryNode.is, (node) => ({
                action: 'delete' as const,
                where: node.where,
            }))
            .exhaustive();

        return { model, action, where };
    }

    private isMutationNode(queryNode: RootOperationNode): queryNode is MutationQueryNode {
        return InsertQueryNode.is(queryNode) || UpdateQueryNode.is(queryNode) || DeleteQueryNode.is(queryNode);
    }

    private getMutationModel(queryNode: OperationNode): string {
        return match(queryNode)
            .when(InsertQueryNode.is, (node) => {
                invariant(node.into, 'InsertQueryNode must have an into clause');
                return node.into.table.identifier.name;
            })
            .when(UpdateQueryNode.is, (node) => {
                invariant(node.table, 'UpdateQueryNode must have a table');
                const { node: tableNode } = stripAlias(node.table);
                invariant(TableNode.is(tableNode), 'UpdateQueryNode must use a TableNode');
                return tableNode.table.identifier.name;
            })
            .when(DeleteQueryNode.is, (node) => {
                invariant(node.from.froms.length === 1, 'Delete query must have exactly one from table');
                const { node: tableNode } = stripAlias(node.from.froms[0]!);
                invariant(TableNode.is(tableNode), 'DeleteQueryNode must use a TableNode');
                return tableNode.table.identifier.name;
            })
            .otherwise((node) => {
                throw createInternalError(`Invalid query node: ${node}`);
            }) as string;
    }

    private processQueryNode<Node extends RootOperationNode>(query: Node): Node {
        let result = query;
        result = this.processNameMapping(result);
        result = this.processTempAlias(result);
        return result;
    }

    private processNameMapping<Node extends RootOperationNode>(query: Node): Node {
        return this.nameMapper?.transformNode(query) ?? query;
    }

    private processTempAlias<Node extends RootOperationNode>(query: Node): Node {
        return new TempAliasTransformer({
            mode: this.options.useCompactAliasNames === false ? 'compactLongNames' : 'alwaysCompact',
        }).run(query);
    }

    private createClientForConnection(connection: DatabaseConnection, inTx: boolean) {
        const innerExecutor = this.withConnectionProvider(new SingleConnectionProvider(connection));
        innerExecutor.suppressMutationHooks = true;
        const innerClient = this.client.withExecutor(innerExecutor);
        if (inTx) {
            innerClient.forceTransaction();
        }
        return innerClient as unknown as ClientContract<SchemaDef>;
    }

    private andNodes(condition1: WhereNode | undefined, condition2: WhereNode | undefined) {
        if (condition1 && condition2) {
            return WhereNode.create(AndNode.create(condition1, condition2));
        } else if (condition1) {
            return WhereNode.create(condition1);
        } else {
            return condition2;
        }
    }

    private async internalExecuteQuery(
        query: RootOperationNode,
        connection: DatabaseConnection,
        queryId?: QueryId,
        parameters?: readonly unknown[],
    ) {
        // run query node processors: name mapping, temp alias renaming, etc.
        const finalQuery = this.processQueryNode(query);

        // inherit the original queryId
        let compiledQuery = this.compileQuery(finalQuery, queryId ?? createQueryId());
        if (parameters) {
            compiledQuery = { ...compiledQuery, parameters: parameters };
        }

        const trackSlowQuery = this.options.diagnostics !== undefined;
        const startTimestamp = trackSlowQuery ? performance.now() : undefined;
        const startedAt = trackSlowQuery ? new Date() : undefined;

        try {
            const result = await connection.executeQuery<any>(compiledQuery);

            if (startTimestamp !== undefined) {
                this.trackSlowQuery(compiledQuery, startTimestamp, startedAt!);
            }

            return this.ensureProperQueryResult(compiledQuery.query, result);
        } catch (err) {
            throw createDBQueryError(
                `Failed to execute query: ${err}`,
                err,
                compiledQuery.sql,
                compiledQuery.parameters,
            );
        }
    }

    private trackSlowQuery(compiledQuery: CompiledQuery, startTimestamp: number, startedAt: Date) {
        const durationMs = performance.now() - startTimestamp;
        const thresholdMs = this.options.diagnostics?.slowQueryThresholdMs;
        if (thresholdMs === undefined || durationMs < thresholdMs) {
            return;
        }

        const slowQueries = this.client.slowQueries;
        const maxRecords = this.options.diagnostics?.slowQueryMaxRecords ?? DEFAULT_MAX_SLOW_RECORDS;
        if (maxRecords <= 0) {
            return;
        }

        const queryInfo = { startedAt, durationMs, sql: compiledQuery.sql };

        if (slowQueries.length >= maxRecords) {
            // find and remove the entry with the lowest duration
            let minIndex = 0;
            for (let i = 1; i < slowQueries.length; i++) {
                if (slowQueries[i]!.durationMs < slowQueries[minIndex]!.durationMs) {
                    minIndex = i;
                }
            }
            // only replace if the new query is slower than the minimum
            if (durationMs > slowQueries[minIndex]!.durationMs) {
                slowQueries[minIndex] = queryInfo;
            }
        } else {
            slowQueries.push(queryInfo);
        }
    }

    private ensureProperQueryResult(query: RootOperationNode, result: QueryResult<any>) {
        let finalResult = result;

        if (this.isMutationNode(query)) {
            // Kysely dialects don't consistently set numAffectedRows, so we fix it here
            // to simplify the consumer's code
            finalResult = {
                ...result,
                numAffectedRows: result.numAffectedRows ?? BigInt(result.rows.length),
            };
        }

        return finalResult;
    }

    // #endregion

    // #region other overrides

    override withPlugin(plugin: KyselyPlugin) {
        return new ZenStackQueryExecutor(
            this.client,
            this.driver,
            this.compiler,
            this.adapter,
            this.connectionProvider,
            [...this.plugins, plugin],
            this.suppressMutationHooks,
        );
    }

    override withPlugins(plugins: ReadonlyArray<KyselyPlugin>) {
        return new ZenStackQueryExecutor(
            this.client,
            this.driver,
            this.compiler,
            this.adapter,
            this.connectionProvider,
            [...this.plugins, ...plugins],
            this.suppressMutationHooks,
        );
    }

    override withPluginAtFront(plugin: KyselyPlugin) {
        return new ZenStackQueryExecutor(
            this.client,
            this.driver,
            this.compiler,
            this.adapter,
            this.connectionProvider,
            [plugin, ...this.plugins],
            this.suppressMutationHooks,
        );
    }

    override withoutPlugins() {
        return new ZenStackQueryExecutor(
            this.client,
            this.driver,
            this.compiler,
            this.adapter,
            this.connectionProvider,
            [],
            this.suppressMutationHooks,
        );
    }

    override withConnectionProvider(connectionProvider: ConnectionProvider) {
        const newExecutor = new ZenStackQueryExecutor(
            this.client,
            this.driver,
            this.compiler,
            this.adapter,
            connectionProvider,
            this.plugins as KyselyPlugin[],
            this.suppressMutationHooks,
        );
        // replace client with a new one associated with the new executor
        newExecutor.client = this.client.withExecutor(newExecutor);
        return newExecutor;
    }

    // #endregion
}
