import type { BaseCrudDialect } from '@zenstackhq/orm';
import { KyselyUtils, QueryUtils } from '@zenstackhq/orm';
import type { BuiltinType, FieldDef, SchemaDef } from '@zenstackhq/orm/schema';
import { ExpressionUtils, type Expression, type MemberExpression } from '@zenstackhq/orm/schema';
import {
    AliasNode,
    ColumnNode,
    CommonTableExpressionNameNode,
    CommonTableExpressionNode,
    IdentifierNode,
    RawNode,
    SelectionNode,
    SelectQueryNode,
    SetOperationNode,
    TableNode,
    ValueNode,
    WhereNode,
    WithNode,
    type OperationNode,
} from 'kysely';

/**
 * Root auth CTE alias name.
 */
export const AUTH_CTE_PREFIX = '$auth';

/**
 * Synthetic column names added to every auth CTE for parent-child FK linking.
 * These are never part of the real schema — they exist only in the CTE layer.
 */
export const AUTH_ID_COL = '$id';
export const AUTH_PARENT_ID_COL = '$pid';


/**
 * Derives the CTE alias name for a given path from the auth root.
 * e.g. [] → '$auth', ['org'] → '$auth$org', ['org', 'roles'] → '$auth$org$roles'
 */
export function authCteName(path: string[]): string {
    return path.length === 0 ? AUTH_CTE_PREFIX : `${AUTH_CTE_PREFIX}$${path.join('$')}`;
}

export type AuthCteInfo = {
    /** The WITH node containing all auth CTEs to be injected into the query. */
    withNode: WithNode;
    /** Whether the auth object is null. */
    isNull: boolean;
};

/**
 * A map from auth CTE alias name to the set of scalar field names that must be
 * included in that CTE.  Fields absent from the map are omitted, keeping each
 * CTE as narrow as possible.
 */
export type AuthCteFieldsNeeded = Map<string, Set<string>>;

/**
 * Scans a list of policy expressions and returns the set of scalar auth field
 * names that are actually referenced at each CTE level.
 *
 * e.g. for `auth().id == this.ownerId` the root `$auth` CTE needs `{ "id" }`.
 * For `auth().roles?[permissions![this.type in canReadTypes]]` only
 * `$auth$roles$permissions` needs `{ "canReadTypes" }`.
 */
export function collectAuthCteFieldsNeeded(
    exprs: Expression[],
    authTypeName: string,
    schema: SchemaDef,
): AuthCteFieldsNeeded {
    const needed: AuthCteFieldsNeeded = new Map();
    for (const expr of exprs) {
        _walkExprForAuthFields(expr, authTypeName, schema, needed, null, null);
    }
    return needed;
}

/**
 * Walks `expr`, recording scalar auth field names needed at each CTE level.
 *
 * `ctxPath` / `ctxType` track the current auth CTE context (non-null when the
 * walk has entered an auth collection-predicate body):
 *   - `null` means we are outside any auth collection predicate.
 *   - When non-null, any FieldExpression whose name is a scalar of `ctxType`
 *     is added to the needed-fields set for `authCteName(ctxPath)`.
 */
function _walkExprForAuthFields(
    expr: Expression,
    authTypeName: string,
    schema: SchemaDef,
    needed: AuthCteFieldsNeeded,
    ctxPath: string[] | null,
    ctxType: string | null,
): void {
    // FieldExpression inside an auth context → record as needed scalar field
    if (ExpressionUtils.isField(expr)) {
        if (ctxPath !== null && ctxType !== null) {
            const field = QueryUtils.getField(schema, ctxType, expr.field);
            if (field && !isNestedField(field, schema)) {
                _addToNeeded(needed, ctxPath, expr.field);
            }
        }
        return;
    }

    if (ExpressionUtils.isMember(expr)) {
        if (ExpressionUtils.isCall(expr.receiver) && expr.receiver.function === 'auth') {
            // auth().a.b... — walk the member chain from root
            _collectMemberPath(expr as MemberExpression, [], authTypeName, schema, needed);
        } else if (ctxPath !== null && ctxType !== null && ExpressionUtils.isBinding(expr.receiver)) {
            // binding.field inside an auth context (e.g. `m.tenantId` in `auth().X?[m, ...]`)
            // The binding refers to the current auth CTE element; record scalar leaf fields.
            let currType = ctxType;
            for (const member of expr.members) {
                const field = QueryUtils.getField(schema, currType, member);
                if (!field) break;
                if (isNestedField(field, schema)) {
                    currType = field.type;
                } else {
                    _addToNeeded(needed, ctxPath, member);
                    break;
                }
            }
        } else {
            _walkExprForAuthFields(expr.receiver, authTypeName, schema, needed, ctxPath, ctxType);
        }
        return;
    }

    if (ExpressionUtils.isBinary(expr)) {
        const op = expr.op;
        if (op === '?' || op === '!' || op === '^') {
            // Determine the inner auth context for the predicate body.
            let innerCtxPath: string[] | null = null;
            let innerCtxType: string | null = null;

            if (
                ExpressionUtils.isMember(expr.left) &&
                ExpressionUtils.isCall((expr.left as MemberExpression).receiver) &&
                (expr.left as MemberExpression).receiver.kind === 'call' &&
                ((expr.left as MemberExpression).receiver as import('@zenstackhq/orm/schema').CallExpression)
                    .function === 'auth'
            ) {
                // auth().X?[body] — enter a fresh auth CTE context
                let path: string[] = [];
                let type = authTypeName;
                for (const member of (expr.left as MemberExpression).members) {
                    const f = QueryUtils.getField(schema, type, member);
                    if (!f || !isNestedField(f, schema)) break;
                    path = [...path, member];
                    type = f.type;
                }
                innerCtxPath = path;
                innerCtxType = type;
            } else if (ctxPath !== null && ctxType !== null) {
                // Nested collection predicate inside an existing auth context
                // e.g. `permissions![...]` inside `auth().roles?[...]`.
                // The LHS names the next nested auth field.
                const lhsField = ExpressionUtils.isField(expr.left)
                    ? expr.left.field
                    : ExpressionUtils.isMember(expr.left)
                      ? (expr.left as MemberExpression).members.at(-1)
                      : undefined;
                if (lhsField) {
                    const f = QueryUtils.getField(schema, ctxType, lhsField);
                    if (f && isNestedField(f, schema)) {
                        innerCtxPath = [...ctxPath, lhsField];
                        innerCtxType = f.type;
                    }
                }
            }

            if (innerCtxPath !== null) {
                // Walk predicate body in the new auth context; skip the LHS (it's the collection ref).
                _walkExprForAuthFields(expr.right, authTypeName, schema, needed, innerCtxPath, innerCtxType);
                return;
            }
        }

        _walkExprForAuthFields(expr.left, authTypeName, schema, needed, ctxPath, ctxType);
        _walkExprForAuthFields(expr.right, authTypeName, schema, needed, ctxPath, ctxType);
        return;
    }

    if (ExpressionUtils.isUnary(expr)) {
        _walkExprForAuthFields(expr.operand, authTypeName, schema, needed, ctxPath, ctxType);
        return;
    }
    if (ExpressionUtils.isCall(expr)) {
        for (const arg of expr.args ?? []) {
            _walkExprForAuthFields(arg, authTypeName, schema, needed, ctxPath, ctxType);
        }
    }
}

function _addToNeeded(needed: AuthCteFieldsNeeded, ctxPath: string[], fieldName: string): void {
    const key = authCteName(ctxPath);
    let set = needed.get(key);
    if (!set) {
        set = new Set();
        needed.set(key, set);
    }
    set.add(fieldName);
}

/**
 * Walks a direct `auth().a.b...` member chain and records the scalar terminal
 * field as needed at the appropriate CTE level.
 */
function _collectMemberPath(
    expr: MemberExpression,
    ctePath: string[],
    currentTypeName: string,
    schema: SchemaDef,
    needed: AuthCteFieldsNeeded,
): void {
    for (const member of expr.members) {
        const field = QueryUtils.getField(schema, currentTypeName, member);
        if (!field) return;
        if (isNestedField(field, schema)) {
            ctePath = [...ctePath, member];
            currentTypeName = field.type;
        } else {
            _addToNeeded(needed, ctePath, member);
            return; // scalar leaf — done
        }
    }
    // All members were nested (relations) — no scalar leaf, nothing to record
}

/**
 * Builds Kysely CTE nodes representing the entire auth object tree from
 * the value passed via `$setAuth`. No real DB tables are ever joined.
 *
 * Only the scalar fields listed in `neededFields` are emitted per CTE level;
 * unreferenced fields are omitted to keep the CTEs narrow.
 *
 * Returns `undefined` if the schema has no `authType`.
 */
export function buildAuthCtes<Schema extends SchemaDef>(
    auth: unknown,
    schema: Schema,
    dialect: BaseCrudDialect<Schema>,
    neededFields?: AuthCteFieldsNeeded,
): AuthCteInfo | undefined {
    const authTypeName = schema.authType;
    if (!authTypeName) return undefined;

    const isNull = auth == null;
    const ctes: CommonTableExpressionNode[] = [];
    const idCounter = { value: 0 };

    buildCtesForLevel(
        isNull ? null : auth,
        authTypeName,
        schema,
        dialect,
        [] /* path */,
        [] /* parentIds — none for root */,
        ctes,
        idCounter,
        new Set<string>(),
        neededFields,
    );

    if (ctes.length === 0) return undefined;

    let withNode = WithNode.create(ctes[0]!);
    for (const cte of ctes.slice(1)) {
        withNode = WithNode.cloneWithExpression(withNode, cte);
    }

    return { withNode, isNull };
}

/**
 * Merges auth CTEs into an existing WITH node (or creates a new one).
 */
export function mergeAuthWith(existing: WithNode | undefined, authWith: WithNode): WithNode {
    if (!existing) return authWith;
    let result = existing;
    for (const cte of authWith.expressions) {
        result = WithNode.cloneWithExpression(result, cte);
    }
    return result;
}

// ---------------------------------------------------------------------------
// Query-based CTE usage analysis
// ---------------------------------------------------------------------------

/**
 * Collects column names referenced directly within a node, stopping at
 * nested SelectQueryNode boundaries so inner subqueries don't pollute the
 * column set of their enclosing auth CTE subquery.
 */
class ShallowColumnCollector extends KyselyUtils.DefaultOperationNodeVisitor {
    private cols: string[] = [];

    collect(node: OperationNode): string[] {
        this.cols = [];
        this.visitNode(node);
        return this.cols;
    }

    protected override visitColumn(node: ColumnNode): void {
        if (!this.cols.includes(node.column.name)) {
            this.cols.push(node.column.name);
        }
    }

    // Stop recursion at subquery boundaries — columns in nested SELECTs
    // belong to their own auth CTE, not the enclosing one.
    protected override visitSelectQuery(_node: SelectQueryNode): void {
        // intentionally empty
    }
}

/**
 * Walks a Kysely query AST and collects, for each auth-CTE subquery
 * (`SELECT … FROM "$auth$…"`), the scalar column names referenced
 * directly in its WHERE clause and selections.
 */
class AuthCteUsageCollector extends KyselyUtils.DefaultOperationNodeVisitor {
    readonly needed: AuthCteFieldsNeeded = new Map();
    private readonly synthetic = new Set([AUTH_ID_COL, AUTH_PARENT_ID_COL]);

    collect(node: OperationNode): void {
        this.visitNode(node);
    }

    protected override visitSelectQuery(node: SelectQueryNode): void {
        if (node.from?.froms.length === 1) {
            const fromNode = node.from.froms[0]!;
            if (TableNode.is(fromNode)) {
                const cteName = fromNode.table.identifier.name;
                if (cteName.startsWith(AUTH_CTE_PREFIX)) {
                    const shallowCols = new ShallowColumnCollector();
                    const cols: string[] = [];
                    if (node.where) cols.push(...shallowCols.collect(node.where));
                    for (const sel of node.selections ?? []) cols.push(...shallowCols.collect(sel));

                    const fieldSet = this.needed.get(cteName) ?? new Set<string>();
                    for (const col of cols) {
                        if (!this.synthetic.has(col)) fieldSet.add(col);
                    }
                    if (fieldSet.size > 0) this.needed.set(cteName, fieldSet);
                }
            }
        }
        // Recurse to discover nested auth CTE subqueries.
        super.visitSelectQuery(node);
    }
}

/**
 * Scans an already-transformed Kysely query node and returns the
 * `AuthCteFieldsNeeded` map derived purely from which `$auth*` CTE tables
 * and columns appear in the query.
 *
 * When the returned map is empty, no auth CTEs are referenced and none
 * need to be built.  Otherwise, pass the map to `buildAuthCtes` to get
 * a minimal WITH clause.
 *
 * An empty-set entry for `AUTH_CTE_PREFIX` (`"$auth"`) is added when only
 * nested auth CTEs are referenced, so that `buildCtesForLevel` skips
 * building a scalar-less root CTE.
 */
export function collectAuthCteUsageFromQuery(node: OperationNode): AuthCteFieldsNeeded {
    const collector = new AuthCteUsageCollector();
    collector.collect(node);
    const needed = collector.needed;
    if (needed.size > 0 && !needed.has(AUTH_CTE_PREFIX)) {
        // Root CTE not directly referenced — add empty entry so buildCtesForLevel
        // knows to omit its scalar columns (and therefore the root CTE itself).
        needed.set(AUTH_CTE_PREFIX, new Set());
    }
    return needed;
}

// ---------------------------------------------------------------------------
// Internal builders
// ---------------------------------------------------------------------------

/**
 * Returns true if a field should be treated as a "nested" CTE level rather
 * than a scalar column.  This covers both:
 *   - real model relations (f.relation is set), and
 *   - typedef fields whose type is another typedef (no f.relation, but the
 *     type resolves to a typeDef in the schema, e.g. `profiles Profile[]`
 *     inside `type User { … }`).
 */
function isNestedField(f: FieldDef, schema: SchemaDef): boolean {
    if (f.computed) return false;
    if (f.relation) return true;
    return !!QueryUtils.getTypeDef(schema, f.type);
}

/**
 * Maps ZenStack/Prisma built-in field types to their PostgreSQL base type name.
 * Used to emit typed NULLs in zero-row CTEs and typed casts for array parameters.
 *
 * In PostgreSQL, an untyped `NULL` literal in a CTE defaults to `text`, so
 * comparing it with an `integer` column (e.g. `__auth_id`) fails with
 * "operator does not exist: text = integer". Explicit casts prevent this.
 */
const PG_TYPE: Partial<Record<string, string>> = {
    String: 'text',
    Int: 'integer',
    BigInt: 'bigint',
    Float: 'double precision',
    Decimal: 'decimal',
    Boolean: 'boolean',
    DateTime: 'timestamptz',
    Bytes: 'bytea',
    Json: 'jsonb',
};

/**
 * Recursively builds CTEs for a given level in the auth data tree.
 *
 * `obj`       — the JS value at this level:
 *                 • `null`  → auth is null (root) or parent provided no data (nested)
 *                 • array   → inline array of items (nested levels)
 *                 • object  → the root auth object (root level only)
 * `path`      — CTE path (empty = root)
 * `parentIds` — `__auth_id` of each item's parent; empty for root
 */
function buildCtesForLevel(
    obj: unknown,
    typeName: string,
    schema: SchemaDef,
    dialect: BaseCrudDialect<any>,
    path: string[],
    parentIds: number[],
    ctes: CommonTableExpressionNode[],
    idCounter: { value: number },
    visited: Set<string>,
    neededFields?: AuthCteFieldsNeeded,
) {
    // Prevent infinite recursion for circular schema types.
    if (visited.has(typeName)) return;
    visited.add(typeName);

    const modelDef = QueryUtils.getModel(schema, typeName);
    const typeDefDef = !modelDef ? QueryUtils.getTypeDef(schema, typeName) : undefined;
    const allFields = Object.values(modelDef?.fields ?? typeDefDef?.fields ?? {});

    // Scalar fields: not a nested type, not computed.
    // When neededFields is provided, only emit scalar fields that are actually
    // referenced in policy expressions — this keeps auth CTEs narrow.
    const allowedScalars = neededFields?.get(authCteName(path));
    const scalarFields = allFields.filter(
        (f) => !isNestedField(f, schema) && (!allowedScalars || allowedScalars.has(f.name)),
    );
    // Nested fields: real model relations OR typedef fields whose type is another typedef.
    const nestedFields = allFields.filter((f) => isNestedField(f, schema));

    const isRoot = path.length === 0;
    const isNull = obj == null;
    const isPostgres = schema.provider.type === 'postgresql';

    // Normalise the inline value to an item array.
    let items: unknown[];
    if (isRoot) {
        items = isNull ? [] : [obj]; // root is always a single object (or none if null)
    } else {
        items = Array.isArray(obj) ? obj : obj != null ? [obj] : [];
    }

    // Assign a synthetic __auth_id to every item at this level.
    const ids: number[] = items.map(() => idCounter.value++);

    // Build the CTE for this level.
    const hasChildren = nestedFields.length > 0;
    const cte = buildLevelCte(
        authCteName(path),
        scalarFields,
        isRoot,
        hasChildren,
        isNull,
        items,
        ids,
        parentIds,
        dialect,
        isPostgres,
    );
    if (cte) ctes.push(cte);

    // Recurse into every nested field — even those not present in the inline data
    // so that the CTE always exists (and is empty) for any auth expression that
    // references it.
    for (const field of nestedFields) {
        const childItems: unknown[] = [];
        const childParentIds: number[] = [];

        if (!isNull) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item == null || typeof item !== 'object') continue;
                const val = (item as Record<string, unknown>)[field.name];
                const children = Array.isArray(val) ? val : val != null ? [val] : [];
                for (const child of children) {
                    childItems.push(child);
                    childParentIds.push(ids[i]!);
                }
            }
        }

        buildCtesForLevel(
            childItems, // empty array → empty CTE for this nested field
            field.type,
            schema,
            dialect,
            [...path, field.name],
            childParentIds,
            ctes,
            idCounter,
            new Set(visited), // fresh copy so sibling types can be revisited
            neededFields,
        );
    }
}

/**
 * Builds a CommonTableExpressionNode for one level of the auth data tree.
 *
 * Root CTE columns:  __auth_id, <scalar fields…>
 * Nested CTE columns: __auth_id, __auth_parent_id, <scalar fields…>
 *
 * Empty items → zero-row CTE (WHERE false).
 * Multiple items → UNION ALL of single-row SELECTs.
 */
function buildLevelCte(
    cteName: string,
    scalarFields: FieldDef[],
    isRoot: boolean,
    hasChildren: boolean,
    isNull: boolean,
    items: unknown[],
    ids: number[],
    parentIds: number[],
    dialect: BaseCrudDialect<any>,
    isPostgres: boolean,
): CommonTableExpressionNode | undefined {
    // Root CTE only needed when there are scalar fields to expose.
    if (isRoot && scalarFields.length === 0) return undefined;

    // $id is only needed when child CTEs exist to reference it via $parent_id.
    const idCols = hasChildren ? [AUTH_ID_COL] : [];
    const columnNames = isRoot
        ? [...idCols, ...scalarFields.map((f) => f.name)]
        : [...idCols, AUTH_PARENT_ID_COL, ...scalarFields.map((f) => f.name)];

    let bodyNode: OperationNode;

    if (items.length === 0 || isNull) {
        // Zero-row CTE: SELECT typed-null AS col, … WHERE false.
        //
        // PostgreSQL assigns `text` to untyped NULL literals in CTE columns, which
        // causes type-mismatch errors (e.g. "text = integer") when those columns are
        // later compared against typed values.  We therefore emit explicit casts for
        // every column when targeting PostgreSQL.
        const nullSels = columnNames.map((col) => {
            const fieldDef = scalarFields.find((f) => f.name === col);
            let nullExpr: OperationNode;
            if (isPostgres) {
                if (col === AUTH_ID_COL || col === AUTH_PARENT_ID_COL) {
                    nullExpr = RawNode.create(['null::integer'], []);
                } else if (fieldDef) {
                    const pgType = PG_TYPE[fieldDef.type] ?? 'text';
                    nullExpr = fieldDef.array
                        ? RawNode.create([`null::${pgType}[]`], [])
                        : RawNode.create([`null::${pgType}`], []);
                } else {
                    nullExpr = ValueNode.createImmediate(null);
                }
            } else {
                nullExpr = ValueNode.createImmediate(null);
            }
            return SelectionNode.create(AliasNode.create(nullExpr, IdentifierNode.create(col)));
        });
        bodyNode = {
            kind: 'SelectQueryNode',
            selections: nullSels,
            where: WhereNode.create(ValueNode.createImmediate(false)),
        } as SelectQueryNode;
    } else {
        // One or more rows — build SELECT … UNION ALL SELECT … via setOperations.
        // We use SelectQueryNode.setOperations rather than the internal UnionQueryNode
        // because OperationNodeTransformer (extended by PolicyHandler) does not have a
        // handler for UnionQueryNode and would throw when traversing the query tree.
        const rowNodes: SelectQueryNode[] = items.map((item, i) =>
            buildRowSelectNode(isRoot, hasChildren, scalarFields, item, ids[i]!, parentIds[i], dialect, isPostgres),
        );

        const firstRow = rowNodes[0]!;
        bodyNode =
            rowNodes.length === 1
                ? firstRow
                : // SelectQueryNode's `setOperations` field is an internal property not exposed
                  // in Kysely's public TypeScript types, but IS present at runtime and IS handled
                  // by both the query compiler and OperationNodeTransformer.
                  ({
                      ...firstRow,
                      setOperations: rowNodes.slice(1).map((row) => SetOperationNode.create('union', row, true)),
                  } as unknown as OperationNode);
    }

    const cteNameNode = CommonTableExpressionNameNode.create(cteName, columnNames);
    return CommonTableExpressionNode.create(cteNameNode, bodyNode);
}

/**
 * Builds a single `SELECT <id>, [<parentId>,] <scalar…>` node for one item.
 */
function buildRowSelectNode(
    isRoot: boolean,
    hasChildren: boolean,
    scalarFields: FieldDef[],
    item: unknown,
    id: number,
    parentId: number | undefined,
    dialect: BaseCrudDialect<any>,
    isPostgres: boolean,
): SelectQueryNode {
    const selections: SelectionNode[] = [];

    // $id — only when child CTEs exist to reference it via $parent_id
    if (hasChildren) {
        selections.push(
            SelectionNode.create(AliasNode.create(ValueNode.createImmediate(id), IdentifierNode.create(AUTH_ID_COL))),
        );
    }

    // __auth_parent_id (nested levels only)
    if (!isRoot && parentId !== undefined) {
        selections.push(
            SelectionNode.create(
                AliasNode.create(ValueNode.createImmediate(parentId), IdentifierNode.create(AUTH_PARENT_ID_COL)),
            ),
        );
    }

    for (const f of scalarFields) {
        const raw = item != null && typeof item === 'object' ? (item as Record<string, unknown>)[f.name] : undefined;
        const transformed = dialect.transformInput(raw, f.type as BuiltinType, !!f.array) ?? null;

        let valueNode: OperationNode;
        if (Array.isArray(transformed)) {
            // Array values must be parameterized so the database driver serialises them
            // (e.g. pg → `{val1,val2}`).  In PostgreSQL we also add an explicit type cast
            // so the query planner knows the element type, which is required for operators
            // like `= any($1)`.
            if (isPostgres) {
                const pgType = PG_TYPE[f.type] ?? 'text';
                valueNode = RawNode.create(['', `::${pgType}[]`], [ValueNode.create(transformed)]);
            } else {
                valueNode = ValueNode.create(transformed);
            }
        } else if (typeof transformed === 'string') {
            // Strings are always parameterized to avoid injection and encoding issues.
            valueNode = ValueNode.create(transformed);
        } else {
            // Scalar primitives (boolean, number, null) can be inlined.
            valueNode = ValueNode.createImmediate(transformed);
        }

        selections.push(SelectionNode.create(AliasNode.create(valueNode, IdentifierNode.create(f.name))));
    }

    return { kind: 'SelectQueryNode', selections } as SelectQueryNode;
}
