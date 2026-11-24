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
    SelectionNode,
    SelectQueryNode,
    TableNode,
    UnaryOperationNode,
    UpdateQueryNode,
    ValueNode,
    WhereNode,
    type OperationNode,
    type RootOperationNode,
} from 'kysely';

const SOFT_DELETE_ATTRIBUTE = '@deletedAt';

export type SoftDeletePluginOptions = {
    /**
     * Models to leave out of the "required parent must be live" check. Useful for a root model
     * that nearly everything points at (e.g. a tenant), where the extra subqueries add up and
     * the root is never soft-deleted while its rows are still read.
     */
    ignoreParents?: readonly string[];
};

export class SoftDeletePlugin implements RuntimePlugin<SchemaDef, {}, {}, {}> {
    constructor(private readonly options: SoftDeletePluginOptions = {}) {}

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
        const handler = new SoftDeleteHandler(client, this.options);
        return handler.handle(query, proceed);
    }
}

type TableInfo = { model: string; alias?: string };

class SoftDeleteHandler<Schema extends SchemaDef> extends OperationNodeTransformer {
    private readonly dialect: BaseCrudDialect<Schema>;

    private readonly ignoredParents: ReadonlySet<string>;

    constructor(
        private readonly client: ClientContract<Schema>,
        options: SoftDeletePluginOptions,
    ) {
        super();
        this.dialect = getCrudDialect(client);
        this.ignoredParents = new Set(options.ignoreParents);
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

    // Inject `<deletedAt> IS NULL` (and the live-parent checks) into ON clauses of joins.
    protected override transformJoin(node: JoinNode): JoinNode {
        const result = super.transformJoin(node);
        const info = this.extractTableInfo(result.table);
        if (!info) {
            return result;
        }
        // Any model that participates in a delegate (polymorphic) hierarchy has its `@deletedAt`
        // handled by `transformSelectQuery`, never here: reconstruction joins are filtered through
        // the outer WHERE (walking the FROM entity's base chain), and relation reads become subqueries
        // filtered by their own FROM. The marker may also live on a table that isn't the one under
        // this join's alias (a base, or a descendant joined for polymorphic packing). So never add an
        // ON-clause predicate for a hierarchy member — at best it's redundant, and on a LEFT join it
        // would only null the joined columns and leak the row.
        if (this.isInDelegateHierarchy(info.model)) {
            return result;
        }
        const deletedAt = this.getDeletedAtField(info.model);
        const filters = [
            ...(deletedAt ? [this.buildIsNullPredicate(info.alias ?? info.model, deletedAt.name)] : []),
            ...this.buildLiveParentPredicates(info),
        ];
        if (filters.length === 0) {
            return result;
        }
        const filter = filters.reduce((acc, f) => this.andNode(acc, f));
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
            const target = this.getSoftDeleteTarget(info);
            if (target) {
                filters.push(this.buildIsNullPredicate(target.table, target.column));
            }
            filters.push(...this.buildLiveParentPredicates(info));
        }
        if (filters.length === 0) {
            return undefined;
        }
        return filters.reduce((acc, f) => this.andNode(acc, f));
    }

    // A row can't outlive a parent it requires: for every required to-one relation, only keep rows
    // whose parent is still live, meaning not soft-deleted and with live required parents of its
    // own. Otherwise `post.author` is typed as `User` but comes back `null` once the author is
    // soft-deleted. This applies whether or not the row's own model has a `@deletedAt` field.
    private buildLiveParentPredicates(info: TableInfo, visited = new Set<string>()): OperationNode[] {
        const modelDef = QueryUtils.getModel(this.client.$schema, info.model);
        if (!modelDef || this.isInDelegateHierarchy(info.model)) {
            return [];
        }
        const childAlias = info.alias ?? info.model;
        const path = new Set(visited).add(info.model);
        const predicates: OperationNode[] = [];
        for (const field of Object.values(modelDef.fields)) {
            const fks = field.relation?.fields;
            const refs = field.relation?.references;
            if (field.array || field.optional || !fks?.length || !refs || fks.length !== refs.length) {
                continue;
            }
            if (this.ignoredParents.has(field.type) || this.isInDelegateHierarchy(field.type)) {
                continue;
            }
            const parentAlias = `${QueryUtils.TEMP_ALIAS_PREFIX}live$${childAlias}$${field.name}`;
            const deletedAt = this.getDeletedAtField(field.type);
            const parentChecks = [
                ...(deletedAt ? [this.buildIsNullPredicate(parentAlias, deletedAt.name)] : []),
                // a model that's already on the path (self-relation or cycle) still gets its own
                // marker checked above, we just don't walk further up from it
                ...(path.has(field.type)
                    ? []
                    : this.buildLiveParentPredicates({ model: field.type, alias: parentAlias }, path)),
            ];
            if (parentChecks.length === 0) {
                // nothing up this chain can be soft-deleted
                continue;
            }
            const conditions: OperationNode[] = [
                ...fks.map((fk, i) =>
                    BinaryOperationNode.create(
                        ReferenceNode.create(ColumnNode.create(refs[i]!), TableNode.create(parentAlias)),
                        OperatorNode.create('='),
                        ReferenceNode.create(ColumnNode.create(fk), TableNode.create(childAlias)),
                    ),
                ),
                ...parentChecks,
            ];
            const parent: SelectQueryNode = {
                ...SelectQueryNode.cloneWithSelections(
                    SelectQueryNode.createFrom([
                        AliasNode.create(TableNode.create(field.type), IdentifierNode.create(parentAlias)),
                    ]),
                    [SelectionNode.createSelectAll()],
                ),
                where: WhereNode.create(conditions.reduce((acc, c) => this.andNode(acc, c))),
            };
            predicates.push(UnaryOperationNode.create(OperatorNode.create('exists'), parent));
        }
        return predicates;
    }

    // Resolve the single `@deletedAt` column to filter when reading a table. `@@@onceInModel` allows
    // at most one marker per inheritance hierarchy, so it's either declared on the model itself or
    // inherited from exactly one delegate base — where the column physically lives on the base's
    // table (LEFT-joined under `delegateJoinAlias`, see buildDelegateJoin), so the filter must key off
    // that base rather than the queried table.
    private getSoftDeleteTarget(info: TableInfo): { table: string; column: string } | undefined {
        const own = this.getDeletedAtField(info.model);
        if (own) {
            return { table: info.alias ?? info.model, column: own.name };
        }
        let base = QueryUtils.getModel(this.client.$schema, info.model)?.baseModel;
        while (base) {
            const marker = this.getDeletedAtField(base);
            if (marker) {
                return {
                    table: this.dialect.delegateJoinAlias(info.model, info.alias ?? info.model, base),
                    column: marker.name,
                };
            }
            base = QueryUtils.getModel(this.client.$schema, base)?.baseModel;
        }
        return undefined;
    }

    private isInDelegateHierarchy(model: string): boolean {
        const modelDef = QueryUtils.getModel(this.client.$schema, model);
        return !!modelDef && (!!modelDef.isDelegate || !!modelDef.baseModel);
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
                if (fieldDef.originModel) {
                    // In a delegate (polymorphic) hierarchy the marker physically lives on the base
                    // table, but it's surfaced on every concrete sub-model's field list (tagged with
                    // `originModel`). Skip it here so we don't reference a non-existent
                    // `<SubModel>.<deletedAt>` column — the base model contributes its own FROM/JOIN
                    // node that carries the soft-delete filter on the real column. Likewise, a
                    // concrete delete is rewritten by the ORM into a delete on the base table, so the
                    // delete-to-update conversion also keys off the base model.
                    continue;
                }
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
