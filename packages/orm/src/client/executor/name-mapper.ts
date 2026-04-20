import { invariant } from '@zenstackhq/common-helpers';
import type { EnumDef, EnumField, FieldDef, ModelDef, SchemaDef } from '@zenstackhq/schema';
import {
    AliasNode,
    BinaryOperationNode,
    CaseWhenBuilder,
    ColumnNode,
    ColumnUpdateNode,
    DeleteQueryNode,
    expressionBuilder,
    ExpressionWrapper,
    FromNode,
    IdentifierNode,
    InsertQueryNode,
    type OperationNode,
    OperationNodeTransformer,
    PrimitiveValueListNode,
    type QueryId,
    ReferenceNode,
    ReturningNode,
    SelectAllNode,
    SelectionNode,
    SelectQueryNode,
    type SimpleReferenceExpressionNode,
    TableNode,
    UpdateQueryNode,
    ValueListNode,
    ValueNode,
    ValuesNode,
} from 'kysely';
import type { ClientContract } from '../contract';
import { getCrudDialect } from '../crud/dialects';
import type { BaseCrudDialect } from '../crud/dialects/base-dialect';
import {
    extractFieldName,
    extractModelName,
    getEnum,
    getField,
    getModel,
    getModelFields,
    isEnum,
    stripAlias,
} from '../query-utils';

type Scope = {
    model?: string;
    alias?: OperationNode;
    namesMapped?: boolean; // true means fields referring to this scope have their names already mapped
};

type SelectionNodeChild = SimpleReferenceExpressionNode | AliasNode | SelectAllNode;

export class QueryNameMapper extends OperationNodeTransformer {
    private readonly modelToTableMap = new Map<string, string>();
    private readonly fieldToColumnMap = new Map<string, string>();
    private readonly enumTypeMap = new Map<string, string>();
    private readonly scopes: Scope[] = [];
    private readonly dialect: BaseCrudDialect<SchemaDef>;

    constructor(private readonly client: ClientContract<SchemaDef>) {
        super();
        this.dialect = getCrudDialect(client.$schema, client.$options);
        for (const [modelName, modelDef] of Object.entries(client.$schema.models)) {
            const mappedName = this.getMappedName(modelDef);
            if (mappedName) {
                this.modelToTableMap.set(modelName, mappedName);
            }

            for (const fieldDef of getModelFields(this.schema, modelName)) {
                const mappedName = this.getMappedName(fieldDef);
                if (mappedName) {
                    this.fieldToColumnMap.set(`${modelName}.${fieldDef.name}`, mappedName);
                }
            }
        }

        for (const [enumName, enumDef] of Object.entries(client.$schema.enums ?? {})) {
            const mappedName = this.getMappedName(enumDef);
            if (mappedName) {
                this.enumTypeMap.set(enumName, mappedName);
            }
        }
    }

    private get schema() {
        return this.client.$schema;
    }

    // #region overrides

    protected override transformSelectQuery(node: SelectQueryNode, queryId?: QueryId) {
        if (!node.from?.froms) {
            return super.transformSelectQuery(node, queryId);
        }

        // process "from" clauses
        const processedFroms = node.from.froms.map((from) => this.processSelectTable(from));

        // process "join" clauses, note that "from" and previous joins need to be added as scopes since join conditions
        // can refer to "from" tables and previous joins
        const processedJoins: ReturnType<typeof this.processSelectTable>[] = [];
        const cumulativeScopes = [...processedFroms.map(({ scope }) => scope)];
        for (const join of node.joins ?? []) {
            const processedJoin = this.withScopes(cumulativeScopes, () => this.processSelectTable(join.table));
            processedJoins.push(processedJoin);
            cumulativeScopes.push(processedJoin.scope);
        }

        // merge the scopes of froms and joins since they're all visible in the query body

        return this.withScopes(cumulativeScopes, () => {
            // transform join clauses, "on" is transformed within the scopes
            const joins = node.joins
                ? node.joins.map((join, i) => ({
                      ...join,
                      table: processedJoins[i]!.node,
                      on: this.transformNode(join.on),
                  }))
                : undefined;
            const selections = this.processSelectQuerySelections(node);
            const baseResult = super.transformSelectQuery(node, queryId);

            return {
                ...baseResult,
                from: FromNode.create(processedFroms.map((f) => f.node)),
                joins,
                selections,
            };
        });
    }

    protected override transformInsertQuery(node: InsertQueryNode, queryId?: QueryId) {
        if (!node.into) {
            return super.transformInsertQuery(node, queryId);
        }

        const model = extractModelName(node.into);
        invariant(model, 'InsertQueryNode must have a model name in the "into" clause');

        return this.withScope({ model }, () => {
            const baseResult = super.transformInsertQuery(node, queryId);
            let values = baseResult.values;
            if (node.columns && values) {
                // process enum values with name mapping
                values = this.processEnumMappingForColumns(model, node.columns, values);
            }
            return {
                ...baseResult,
                // map table name
                into: this.processTableRef(node.into!),
                values,
            } satisfies InsertQueryNode;
        });
    }

    private isOperationNode(value: unknown): value is OperationNode {
        return !!value && typeof value === 'object' && 'kind' in value;
    }

    protected override transformReturning(node: ReturningNode) {
        return {
            kind: node.kind,
            // map column names in returning selections (include returningAll)
            selections: this.processSelections(node.selections),
        };
    }

    protected override transformReference(node: ReferenceNode, queryId?: QueryId) {
        if (!ColumnNode.is(node.column)) {
            return super.transformReference(node, queryId);
        }

        // resolve the reference to a field from outer scopes
        const scope = this.resolveFieldFromScopes(node.column.column.name, node.table?.table.identifier.name);
        if (scope && !scope.namesMapped && scope.model) {
            // map column name and table name as needed
            const mappedFieldName = this.mapFieldName(scope.model, node.column.column.name);

            // map table name depending on how it is resolved
            let mappedTableName = node.table?.table.identifier.name;
            if (mappedTableName) {
                if (scope.alias && IdentifierNode.is(scope.alias) && scope.alias.name === mappedTableName) {
                    // table name is resolved to an alias, no mapping needed
                } else if (scope.model === mappedTableName) {
                    // table name is resolved to a model, map the name as needed
                    mappedTableName = this.mapTableName(scope.model);
                }
            }
            return ReferenceNode.create(
                ColumnNode.create(mappedFieldName),
                mappedTableName ? this.createTableNode(mappedTableName, undefined) : undefined,
            );
        } else {
            // no name mapping needed
            return node;
        }
    }

    protected override transformColumn(node: ColumnNode, queryId?: QueryId) {
        const scope = this.resolveFieldFromScopes(node.column.name);
        if (!scope || scope.namesMapped || !scope.model) {
            return super.transformColumn(node, queryId);
        }
        const mappedName = this.mapFieldName(scope.model, node.column.name);
        return ColumnNode.create(mappedName);
    }

    protected override transformBinaryOperation(node: BinaryOperationNode, queryId?: QueryId) {
        // transform enum name mapping for enum values used inside binary operations
        //   1. simple value: column = EnumValue
        //   2. list value: column IN [EnumValue, EnumValue2]

        // note: Kysely only allows column ref on the left side of a binary operation

        if (
            ReferenceNode.is(node.leftOperand) &&
            ColumnNode.is(node.leftOperand.column) &&
            (ValueNode.is(node.rightOperand) || PrimitiveValueListNode.is(node.rightOperand))
        ) {
            const columnNode = node.leftOperand.column;

            // resolve field from scope in case it's not directly qualified with a table name
            const resolvedScope = this.resolveFieldFromScopes(
                columnNode.column.name,
                node.leftOperand.table?.table.identifier.name,
            );

            if (resolvedScope?.model) {
                const valueNode = node.rightOperand;
                let resultValue: OperationNode = valueNode;

                if (ValueNode.is(valueNode)) {
                    resultValue = this.processEnumMappingForValue(
                        resolvedScope.model,
                        columnNode,
                        valueNode,
                    ) as OperationNode;
                } else if (PrimitiveValueListNode.is(valueNode)) {
                    resultValue = PrimitiveValueListNode.create(
                        this.processEnumMappingForValues(
                            resolvedScope.model,
                            valueNode.values.map(() => columnNode),
                            valueNode.values,
                        ),
                    );
                }

                return super.transformBinaryOperation(
                    {
                        ...node,
                        rightOperand: resultValue,
                    },
                    queryId,
                );
            }
        }

        return super.transformBinaryOperation(node, queryId);
    }

    protected override transformUpdateQuery(node: UpdateQueryNode, queryId?: QueryId) {
        if (!node.table) {
            return super.transformUpdateQuery(node, queryId);
        }

        const { alias, node: innerTable } = stripAlias(node.table);
        if (!innerTable || !TableNode.is(innerTable)) {
            return super.transformUpdateQuery(node);
        }

        const model = extractModelName(innerTable);
        invariant(model, 'UpdateQueryNode must have a model name in the "table" clause');

        return this.withScope({ model, alias }, () => {
            const baseResult = super.transformUpdateQuery(node, queryId);

            // process enum value mappings in update set values
            const updates = baseResult.updates?.map((update, i) => {
                if (ColumnNode.is(update.column)) {
                    // fetch original column that doesn't have name mapping applied
                    const origColumn = node.updates![i]!.column as ColumnNode;
                    return ColumnUpdateNode.create(
                        update.column,
                        this.processEnumMappingForValue(model, origColumn, update.value) as OperationNode,
                    );
                } else {
                    return update;
                }
            });

            return {
                ...baseResult,
                updates,
                // map table name
                table: this.wrapAlias(this.processTableRef(innerTable), alias),
            };
        });
    }

    protected override transformDeleteQuery(node: DeleteQueryNode, queryId?: QueryId) {
        // all "from" nodes are pushed as scopes
        const scopes: Scope[] = node.from.froms.map((node) => {
            const { alias, node: innerNode } = stripAlias(node);
            return {
                model: extractModelName(innerNode),
                alias,
                namesMapped: false,
            };
        });

        // process name mapping in each "from"
        const froms = node.from.froms.map((from) => {
            const { alias, node: innerNode } = stripAlias(from);
            if (TableNode.is(innerNode!)) {
                // map table name
                return this.wrapAlias(this.processTableRef(innerNode), alias);
            } else {
                return super.transformNode(from, queryId);
            }
        });

        return this.withScopes(scopes, () => {
            return {
                ...super.transformDeleteQuery(node, queryId),
                from: FromNode.create(froms),
            };
        });
    }

    // #endregion

    // #region utils

    private processSelectQuerySelections(node: SelectQueryNode) {
        const selections: SelectionNode[] = [];
        for (const selection of node.selections ?? []) {
            const processedSelections: { originalField?: string; selection: SelectionNode }[] = [];
            if (SelectAllNode.is(selection.selection)) {
                // expand `selectAll` to all fields with name mapping if the
                // inner-most scope is not already mapped
                const scope = this.requireCurrentScope();
                if (scope?.model && !scope.namesMapped) {
                    // expand
                    processedSelections.push(...this.createSelectAllFields(scope.model, scope.alias));
                } else {
                    // preserve
                    processedSelections.push({
                        originalField: undefined,
                        selection: super.transformSelection(selection),
                    });
                }
            } else if (ReferenceNode.is(selection.selection) || ColumnNode.is(selection.selection)) {
                // map column name and add/preserve alias
                const transformed = this.transformNode(selection.selection);

                // field name without applying name mapping
                const originalField = extractFieldName(selection.selection);

                if (AliasNode.is(transformed)) {
                    // keep the alias if there's one
                    processedSelections.push({ originalField, selection: SelectionNode.create(transformed) });
                } else {
                    // otherwise use an alias to preserve the original field name
                    const fieldName = extractFieldName(transformed);
                    if (fieldName !== originalField) {
                        processedSelections.push({
                            originalField,
                            selection: SelectionNode.create(
                                this.wrapAlias(
                                    transformed,
                                    originalField ? IdentifierNode.create(originalField) : undefined,
                                ),
                            ),
                        });
                    } else {
                        processedSelections.push({
                            originalField,
                            selection: SelectionNode.create(transformed),
                        });
                    }
                }
            } else {
                const { node: innerNode } = stripAlias(selection.selection);
                processedSelections.push({
                    originalField: extractFieldName(innerNode),
                    selection: super.transformSelection(selection),
                });
            }

            // process enum value mapping
            const enumProcessedSelections = processedSelections.map(({ originalField, selection }) => {
                if (!originalField) {
                    return selection;
                } else {
                    return SelectionNode.create(this.processEnumSelection(selection.selection, originalField));
                }
            });
            selections.push(...enumProcessedSelections);
        }

        return selections;
    }

    private resolveFieldFromScopes(name: string, qualifier?: string) {
        for (let i = this.scopes.length - 1; i >= 0; i--) {
            const scope = this.scopes[i]!;
            if (qualifier) {
                // if the field as a qualifier, the qualifier must match the scope's
                // alias if any, or model if no alias
                if (scope.alias) {
                    if (scope.alias && IdentifierNode.is(scope.alias) && scope.alias.name === qualifier) {
                        // scope has an alias that matches the qualifier
                        return scope;
                    } else {
                        // scope has an alias but it doesn't match the qualifier
                        continue;
                    }
                } else if (scope.model) {
                    if (scope.model === qualifier) {
                        // scope has a model that matches the qualifier
                        return scope;
                    } else {
                        // scope has a model but it doesn't match the qualifier
                        continue;
                    }
                }
            } else {
                // if the field has no qualifier, match with model name
                if (scope.model) {
                    const modelDef = getModel(this.schema, scope.model);
                    if (!modelDef) {
                        continue;
                    }
                    if (getModelFields(this.schema, scope.model).some((f) => f.name === name)) {
                        return scope;
                    }
                }
            }
        }
        return undefined;
    }

    private pushScope(scope: Scope) {
        this.scopes.push(scope);
    }

    private withScope<T>(scope: Scope, fn: (...args: unknown[]) => T): T {
        this.pushScope(scope);
        try {
            return fn();
        } finally {
            this.scopes.pop();
        }
    }

    private withScopes<T>(scopes: Scope[], fn: (...args: unknown[]) => T): T {
        scopes.forEach((s) => this.pushScope(s));
        try {
            return fn();
        } finally {
            scopes.forEach(() => this.scopes.pop());
        }
    }

    private wrapAlias<T extends OperationNode>(node: T, alias: OperationNode | undefined) {
        return alias ? AliasNode.create(node, alias) : node;
    }

    private processTableRef(node: TableNode) {
        if (!node) {
            return node;
        }
        if (!TableNode.is(node)) {
            return super.transformNode(node);
        }
        const mappedName = this.mapTableName(node.table.identifier.name);
        const tableSchema = this.getTableSchema(node.table.identifier.name);
        return this.createTableNode(mappedName, tableSchema);
    }

    private getMappedName(def: ModelDef | FieldDef | EnumField) {
        const mapAttr = def.attributes?.find((attr) => attr.name === '@@map' || attr.name === '@map');
        if (mapAttr) {
            const nameArg = mapAttr.args?.find((arg) => arg.name === 'name');
            if (nameArg && nameArg.value.kind === 'literal') {
                return nameArg.value.value as string;
            }
        }
        return undefined;
    }

    private mapFieldName(model: string, field: string): string {
        const mappedName = this.fieldToColumnMap.get(`${model}.${field}`);
        if (mappedName) {
            return mappedName;
        } else {
            return field;
        }
    }

    private mapTableName(tableName: string): string {
        const mappedName = this.modelToTableMap.get(tableName);
        if (mappedName) {
            return mappedName;
        } else {
            return tableName;
        }
    }

    private hasMappedColumns(modelName: string) {
        return [...this.fieldToColumnMap.keys()].some((key) => key.startsWith(modelName + '.'));
    }

    // convert a "from" node to a nested query if there are columns with name mapping
    private processSelectTable(node: OperationNode): { node: OperationNode; scope: Scope } {
        const { alias, node: innerNode } = stripAlias(node);
        if (innerNode && TableNode.is(innerNode)) {
            // if the selection is a table, map its name and create alias to preserve model name,
            // mark the scope as names NOT mapped if the model has field name mappings, so that
            // inner transformations will map column names
            const modelName = innerNode.table.identifier.name;
            const mappedName = this.mapTableName(modelName);
            const finalAlias = alias ?? (mappedName !== modelName ? IdentifierNode.create(modelName) : undefined);
            const tableSchema = this.getTableSchema(modelName);
            return {
                node: this.wrapAlias(this.createTableNode(mappedName, tableSchema), finalAlias),
                scope: {
                    alias: alias ?? IdentifierNode.create(modelName),
                    model: modelName,
                    namesMapped: !this.hasMappedColumns(modelName),
                },
            };
        } else {
            // otherwise, it's an alias or a sub-query, in which case the inner field names are
            // already mapped, so we just create a scope with the alias and mark names mapped
            return {
                node: super.transformNode(node),
                scope: {
                    alias,
                    model: undefined,
                    namesMapped: true,
                },
            };
        }
    }

    private getTableSchema(model: string) {
        if (this.schema.provider.type !== 'postgresql') {
            return undefined;
        }
        let schema = this.schema.provider.defaultSchema ?? 'public';
        const schemaAttr = this.schema.models[model]?.attributes?.find((attr) => attr.name === '@@schema');
        if (schemaAttr) {
            const mapArg = schemaAttr.args?.find((arg) => arg.name === 'map');
            if (mapArg && mapArg.value.kind === 'literal') {
                schema = mapArg.value.value as string;
            }
        }
        return schema;
    }

    private createSelectAllFields(model: string, alias: OperationNode | undefined) {
        return getModelFields(this.schema, model).map((fieldDef) => {
            const columnName = this.mapFieldName(model, fieldDef.name);
            const columnRef = ReferenceNode.create(
                ColumnNode.create(columnName),
                alias && IdentifierNode.is(alias) ? TableNode.create(alias.name) : undefined,
            );
            if (columnName !== fieldDef.name) {
                const aliased = AliasNode.create(columnRef, IdentifierNode.create(fieldDef.name));
                return { originalField: fieldDef.name, selection: SelectionNode.create(aliased) };
            } else {
                return { originalField: fieldDef.name, selection: SelectionNode.create(columnRef) };
            }
        });
    }

    private processSelections(selections: readonly SelectionNode[]) {
        const result: SelectionNode[] = [];
        selections.forEach((selection) => {
            if (SelectAllNode.is(selection.selection)) {
                // expand "select *" to a list of selections if name mapping is needed
                const processed = this.processSelectAll(selection.selection);
                if (Array.isArray(processed)) {
                    // expanded and names mapped
                    result.push(...processed.map((s) => SelectionNode.create(s)));
                } else {
                    // not expanded
                    result.push(SelectionNode.create(processed));
                }
            } else {
                result.push(SelectionNode.create(this.processSelection(selection.selection)));
            }
        });
        return result;
    }

    private processSelection(node: SelectionNodeChild) {
        const { alias, node: innerNode } = stripAlias(node);
        const originalField = extractFieldName(innerNode);
        let result = super.transformNode(node);

        if (originalField) {
            // process enum value mapping
            result = this.processEnumSelection(result, originalField);
        }

        if (!AliasNode.is(result)) {
            const addAlias = alias ?? (originalField ? IdentifierNode.create(originalField) : undefined);
            if (addAlias) {
                result = this.wrapAlias(result, addAlias);
            }
        }
        return result;
    }

    private processSelectAll(node: SelectAllNode) {
        const scope = this.requireCurrentScope();
        if (!scope.model || !(this.hasMappedColumns(scope.model) || this.modelUsesEnumWithMappedValues(scope.model))) {
            // no name mapping needed, preserve the select all
            return super.transformSelectAll(node);
        }

        // expand select all to a list of selections with name mapping
        return getModelFields(this.schema, scope.model).map((fieldDef) => {
            const columnName = this.mapFieldName(scope.model!, fieldDef.name);
            const columnRef = ReferenceNode.create(ColumnNode.create(columnName));

            // process enum value mapping
            const enumProcessed = this.processEnumSelection(columnRef, fieldDef.name);

            return columnName !== fieldDef.name && !AliasNode.is(enumProcessed)
                ? this.wrapAlias(enumProcessed, IdentifierNode.create(fieldDef.name))
                : enumProcessed;
        });
    }

    private createTableNode(tableName: string, schemaName: string | undefined) {
        return schemaName ? TableNode.createWithSchema(schemaName, tableName) : TableNode.create(tableName);
    }

    private requireCurrentScope() {
        const scope = this.scopes[this.scopes.length - 1];
        invariant(scope, 'No scope available');
        return scope;
    }

    // #endregion

    // #region enum value mapping

    private modelUsesEnumWithMappedValues(model: string) {
        const modelDef = getModel(this.schema, model);
        if (!modelDef) {
            return false;
        }
        return getModelFields(this.schema, model).some((fieldDef) => {
            const enumDef = getEnum(this.schema, fieldDef.type);
            if (!enumDef) {
                return false;
            }
            return Object.values(enumDef.fields ?? {}).some((f) => f.attributes?.some((attr) => attr.name === '@map'));
        });
    }

    private getEnumValueMapping(enumDef: EnumDef) {
        const mapping: Record<string, string> = {};
        for (const [key, field] of Object.entries(enumDef.fields ?? {})) {
            const mappedName = this.getMappedName(field);
            if (mappedName) {
                mapping[key] = mappedName;
            }
        }
        return mapping;
    }

    private processEnumMappingForColumns(
        model: string,
        columns: readonly ColumnNode[],
        values: OperationNode,
    ): OperationNode {
        if (ValuesNode.is(values)) {
            return ValuesNode.create(
                values.values.map((valueItems) => {
                    if (PrimitiveValueListNode.is(valueItems)) {
                        return PrimitiveValueListNode.create(
                            this.processEnumMappingForValues(model, columns, valueItems.values),
                        );
                    } else {
                        return ValueListNode.create(
                            this.processEnumMappingForValues(model, columns, valueItems.values) as OperationNode[],
                        );
                    }
                }),
            );
        } else if (PrimitiveValueListNode.is(values)) {
            return PrimitiveValueListNode.create(this.processEnumMappingForValues(model, columns, values.values));
        } else {
            return values;
        }
    }

    private processEnumMappingForValues(model: string, columns: readonly ColumnNode[], values: readonly unknown[]) {
        const result: unknown[] = [];
        for (let i = 0; i < columns.length; i++) {
            const value = values[i];
            if (value === null || value === undefined) {
                result.push(value);
                continue;
            }
            result.push(this.processEnumMappingForValue(model, columns[i]!, value));
        }
        return result;
    }

    private processEnumMappingForValue(model: string, column: ColumnNode, value: unknown) {
        const fieldDef = getField(this.schema, model, column.column.name);
        if (!fieldDef) {
            return value;
        }
        if (!isEnum(this.schema, fieldDef.type)) {
            return value;
        }

        const enumDef = getEnum(this.schema, fieldDef.type);
        if (!enumDef) {
            return value;
        }

        const enumValueMapping = this.getEnumValueMapping(enumDef);
        if (this.isOperationNode(value) && ValueNode.is(value) && typeof value.value === 'string') {
            const mappedValue = enumValueMapping[value.value];
            if (mappedValue) {
                return ValueNode.create(mappedValue);
            }
        } else if (typeof value === 'string') {
            const mappedValue = enumValueMapping[value];
            if (mappedValue) {
                return mappedValue;
            }
        }

        return value;
    }

    private processEnumSelection(selection: SelectionNodeChild, fieldName: string) {
        const { alias, node } = stripAlias(selection);
        const fieldScope = this.resolveFieldFromScopes(fieldName);
        if (!fieldScope || !fieldScope.model) {
            return selection;
        }
        const aliasName = alias && IdentifierNode.is(alias) ? alias.name : fieldName;

        const fieldDef = getField(this.schema, fieldScope.model, fieldName);
        if (!fieldDef) {
            return selection;
        }
        const enumDef = getEnum(this.schema, fieldDef.type);
        if (!enumDef) {
            return selection;
        }
        const enumValueMapping = this.getEnumValueMapping(enumDef);
        if (Object.keys(enumValueMapping).length === 0) {
            return selection;
        }

        const eb = expressionBuilder();
        const caseBuilder = eb.case();
        let caseWhen: CaseWhenBuilder<any, any, any, any> | undefined;
        for (const [key, value] of Object.entries(enumValueMapping)) {
            if (!caseWhen) {
                caseWhen = caseBuilder.when(new ExpressionWrapper(node), '=', value).then(key);
            } else {
                caseWhen = caseWhen.when(new ExpressionWrapper(node), '=', value).then(key);
            }
        }

        // the explicit cast to "text" is needed to address postgres's case-when type inference issue
        const finalExpr = caseWhen!.else(this.dialect.castText(new ExpressionWrapper(node))).end();
        if (aliasName) {
            return finalExpr.as(aliasName).toOperationNode() as SelectionNodeChild;
        } else {
            return finalExpr.toOperationNode() as SelectionNodeChild;
        }
    }

    // #endregion
}
