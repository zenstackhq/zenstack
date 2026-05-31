import {
    getCrudDialect,
    ORMError,
    ORMErrorReason,
    QueryUtils,
    type BaseCrudDialect,
    type ClientContract,
    type OnKyselyQueryArgs,
    type ProceedKyselyQueryFunction,
    type RuntimePlugin,
} from '@zenstackhq/orm';
import type { FieldDef, SchemaDef } from '@zenstackhq/orm/schema';
import {
    AliasNode,
    AndNode,
    BinaryOperationNode,
    ColumnNode,
    ColumnUpdateNode,
    DeleteQueryNode,
    IdentifierNode,
    JoinNode,
    OnNode,
    OperationNodeTransformer,
    OperatorNode,
    OrNode,
    ParensNode,
    ReferenceNode,
    SelectQueryNode,
    TableNode,
    UpdateQueryNode,
    ValueNode,
    WhereNode,
    type OperationNode,
    type RootOperationNode,
} from 'kysely';

const SOFT_DELETE_ATTRIBUTE = '@deletedAt';

export class SoftDeletePlugin implements RuntimePlugin<SchemaDef, {}, {}, {}> {
    get id() {
        return 'soft-delete' as const;
    }

    get name() {
        return 'Soft Delete';
    }

    get description() {
        return 'Filters reads against models with @deletedAt and transforms delete operations into updates of the @deletedAt field.';
    }

    onKyselyQuery({ query, client, proceed }: OnKyselyQueryArgs<SchemaDef>) {
        const handler = new SoftDeleteHandler(client);
        return handler.handle(query, proceed);
    }
}

type TableInfo = { model: string; alias?: string };

class SoftDeleteHandler<Schema extends SchemaDef> extends OperationNodeTransformer {
    private readonly dialect: BaseCrudDialect<Schema>;

    constructor(private readonly client: ClientContract<Schema>) {
        super();
        this.dialect = getCrudDialect(client.$schema, client.$options);
    }

    async handle(node: RootOperationNode, proceed: ProceedKyselyQueryFunction) {
        if (DeleteQueryNode.is(node)) {
            const converted = this.tryConvertDeleteToUpdate(node);
            if (converted) {
                // The rewritten UPDATE still flows through `transformUpdateQuery` so the
                // soft-delete filter is added and already-soft-deleted rows aren't re-touched.
                return proceed(this.transformNode(converted));
            }
            // Not a soft-delete target: let the delete (and any DB-level cascade) proceed naturally.
        }
        return proceed(this.transformNode(node));
    }

    // Inject `<deletedAt> IS NULL` for soft-delete tables in the FROM clause.
    protected override transformSelectQuery(node: SelectQueryNode): SelectQueryNode {
        const result = super.transformSelectQuery(node);
        if (!result.from) {
            return result;
        }
        const filter = this.buildSoftDeleteFilterForTables(result.from.froms);
        if (!filter) {
            return result;
        }
        return {
            ...result,
            where: this.mergeWhere(result.where, filter),
        };
    }

    // Inject `<deletedAt> IS NULL` into ON clauses of joins against soft-delete tables.
    protected override transformJoin(node: JoinNode): JoinNode {
        const result = super.transformJoin(node);
        const info = this.extractTableInfo(result.table);
        if (!info) {
            return result;
        }
        const deletedAt = this.getDeletedAtField(info.model);
        if (!deletedAt) {
            return result;
        }
        const filter = this.buildIsNullPredicate(info.alias ?? info.model, deletedAt.name);
        return {
            ...result,
            on: result.on ? OnNode.create(this.andNode(result.on.on, filter)) : OnNode.create(filter),
        };
    }

    // Prevent updates from touching already soft-deleted rows.
    protected override transformUpdateQuery(node: UpdateQueryNode): UpdateQueryNode {
        const result = super.transformUpdateQuery(node);
        if (!result.table) {
            return result;
        }
        const info = this.extractTableInfo(result.table);
        if (!info) {
            return result;
        }
        const deletedAt = this.getDeletedAtField(info.model);
        if (!deletedAt) {
            return result;
        }
        const filter = this.buildIsNullPredicate(info.alias ?? info.model, deletedAt.name);
        return {
            ...result,
            where: this.mergeWhere(result.where, filter),
        };
    }

    private tryConvertDeleteToUpdate(node: DeleteQueryNode): UpdateQueryNode | undefined {
        // Only single-table deletes can be converted. Multi-table/joined deletes can't be rewritten
        // into an @deletedAt update — if such a delete targets a soft-delete model, refuse rather
        // than silently hard-deleting its rows; otherwise let it fall through and cascade naturally.
        if (node.from.froms.length !== 1 || node.using || node.joins?.length) {
            for (const fromNode of node.from.froms) {
                const info = this.extractTableInfo(fromNode);
                if (info && this.getDeletedAtField(info.model)) {
                    throw new ORMError(
                        ORMErrorReason.NOT_SUPPORTED,
                        `Cannot soft-delete from "${info.model}": multi-table or joined DELETE statements cannot be rewritten into an @deletedAt update. Use a single-table delete instead.`,
                    );
                }
            }
            return undefined;
        }
        const fromNode = node.from.froms[0]!;
        const info = this.extractTableInfo(fromNode);
        if (!info) {
            return undefined;
        }
        const deletedAt = this.getDeletedAtField(info.model);
        if (!deletedAt) {
            return undefined;
        }

        const now = this.dialect.transformInput(new Date(), 'DateTime', false);
        const update: UpdateQueryNode = {
            kind: 'UpdateQueryNode',
            table: fromNode,
            updates: [ColumnUpdateNode.create(ColumnNode.create(deletedAt.name), ValueNode.create(now))],
            where: node.where,
            with: node.with,
            returning: node.returning,
            limit: node.limit,
            orderBy: node.orderBy,
            explain: node.explain,
        };
        return update;
    }

    // #region helpers

    private buildSoftDeleteFilterForTables(tables: readonly OperationNode[]): OperationNode | undefined {
        const filters: OperationNode[] = [];
        for (const table of tables) {
            const info = this.extractTableInfo(table);
            if (!info) {
                continue;
            }
            const deletedAt = this.getDeletedAtField(info.model);
            if (!deletedAt) {
                continue;
            }
            filters.push(this.buildIsNullPredicate(info.alias ?? info.model, deletedAt.name));
        }
        if (filters.length === 0) {
            return undefined;
        }
        return filters.reduce((acc, f) => this.andNode(acc, f));
    }

    private buildIsNullPredicate(table: string, column: string): OperationNode {
        return BinaryOperationNode.create(
            ReferenceNode.create(ColumnNode.create(column), TableNode.create(table)),
            OperatorNode.create('is'),
            ValueNode.createImmediate(null),
        );
    }

    private andNode(a: OperationNode, b: OperationNode): OperationNode {
        return AndNode.create(this.wrap(a), this.wrap(b));
    }

    private wrap(node: OperationNode): OperationNode {
        return OrNode.is(node) ? ParensNode.create(node) : node;
    }

    private mergeWhere(existing: WhereNode | undefined, filter: OperationNode): WhereNode {
        return WhereNode.create(existing ? this.andNode(existing.where, filter) : filter);
    }

    private extractTableInfo(node: OperationNode): TableInfo | undefined {
        if (TableNode.is(node)) {
            return { model: node.table.identifier.name };
        }
        if (AliasNode.is(node)) {
            const inner = this.extractTableInfo(node.node);
            if (!inner) {
                return undefined;
            }
            return {
                model: inner.model,
                alias: IdentifierNode.is(node.alias) ? node.alias.name : inner.alias,
            };
        }
        return undefined;
    }

    private getDeletedAtField(model: string): FieldDef | undefined {
        const modelDef = QueryUtils.getModel(this.client.$schema, model);
        if (!modelDef) {
            return undefined;
        }
        for (const fieldDef of Object.values(modelDef.fields)) {
            if (fieldDef.attributes?.some((a) => a.name === SOFT_DELETE_ATTRIBUTE)) {
                if (!fieldDef.optional) {
                    // A non-nullable marker can never be null, so the `IS NULL` read filter would
                    // hide every row. Require the marker to be optional so "not deleted" === null.
                    throw new ORMError(
                        ORMErrorReason.NOT_SUPPORTED,
                        `Field "${model}.${fieldDef.name}" is marked @deletedAt but is not optional. The soft-delete marker must be a nullable field (e.g. "DateTime?").`,
                    );
                }
                return fieldDef;
            }
        }
        return undefined;
    }

    // #endregion
}
