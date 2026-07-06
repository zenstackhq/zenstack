import {
    AddColumnNode,
    AddConstraintNode,
    AddIndexNode,
    AddValueNode,
    AggregateFunctionNode,
    AliasNode,
    AlterColumnNode,
    AlterTableNode,
    AlterTypeNode,
    AndNode,
    BinaryOperationNode,
    CaseNode,
    CastNode,
    CheckConstraintNode,
    CollateNode,
    ColumnDefinitionNode,
    ColumnNode,
    ColumnUpdateNode,
    CommonTableExpressionNameNode,
    CommonTableExpressionNode,
    CreateIndexNode,
    CreateSchemaNode,
    CreateTableNode,
    CreateTypeNode,
    CreateViewNode,
    DataTypeNode,
    DefaultInsertValueNode,
    DefaultValueNode,
    DeleteQueryNode,
    DropColumnNode,
    DropConstraintNode,
    DropIndexNode,
    DropSchemaNode,
    DropTableNode,
    DropTypeNode,
    DropViewNode,
    ExplainNode,
    FetchNode,
    ForeignKeyConstraintNode,
    FromNode,
    FunctionNode,
    GeneratedNode,
    GroupByItemNode,
    GroupByNode,
    HavingNode,
    IdentifierNode,
    InsertQueryNode,
    JoinNode,
    JSONOperatorChainNode,
    JSONPathLegNode,
    JSONPathNode,
    JSONReferenceNode,
    Kysely,
    LimitNode,
    ListNode,
    MatchedNode,
    MergeQueryNode,
    ModifyColumnNode,
    OffsetNode,
    OnConflictNode,
    OnDuplicateKeyNode,
    OnNode,
    OperationNodeVisitor,
    OperatorNode,
    OrActionNode,
    OrderByItemNode,
    OrderByNode,
    OrNode,
    OutputNode,
    OverNode,
    ParensNode,
    PartitionByItemNode,
    PartitionByNode,
    PrimitiveValueListNode,
    RawNode,
    ReferenceNode,
    ReferencesNode,
    RefreshMaterializedViewNode,
    RenameColumnNode,
    RenameConstraintNode,
    RenameValueNode,
    ReturningNode,
    SchemableIdentifierNode,
    SelectAllNode,
    SelectionNode,
    SelectModifierNode,
    SelectQueryNode,
    SetOperationNode,
    TableNode,
    TopNode,
    TupleNode,
    UnaryOperationNode,
    UniqueConstraintNode,
    UpdateQueryNode,
    UsingNode,
    ValueListNode,
    ValueNode,
    ValuesNode,
    WhenNode,
    WhereNode,
    WithNode,
    type OperationNode,
    type PrimaryKeyConstraintNode,
} from 'kysely';

export class DefaultOperationNodeVisitor extends OperationNodeVisitor {
    protected defaultVisit(node: OperationNode) {
        Object.values(node).forEach((value) => {
            if (!value) {
                return;
            }
            if (Array.isArray(value)) {
                value.forEach((el) => this.defaultVisit(el));
            }
            if (typeof value === 'object' && 'kind' in value && typeof value.kind === 'string') {
                this.visitNode(value);
            }
        });
    }

    protected override visitSelectQuery(node: SelectQueryNode): void {
        this.defaultVisit(node);
    }
    protected override visitSelection(node: SelectionNode): void {
        this.defaultVisit(node);
    }
    protected override visitColumn(node: ColumnNode): void {
        this.defaultVisit(node);
    }
    protected override visitAlias(node: AliasNode): void {
        this.defaultVisit(node);
    }
    protected override visitTable(node: TableNode): void {
        this.defaultVisit(node);
    }
    protected override visitFrom(node: FromNode): void {
        this.defaultVisit(node);
    }
    protected override visitReference(node: ReferenceNode): void {
        this.defaultVisit(node);
    }
    protected override visitAnd(node: AndNode): void {
        this.defaultVisit(node);
    }
    protected override visitOr(node: OrNode): void {
        this.defaultVisit(node);
    }
    protected override visitValueList(node: ValueListNode): void {
        this.defaultVisit(node);
    }
    protected override visitParens(node: ParensNode): void {
        this.defaultVisit(node);
    }
    protected override visitJoin(node: JoinNode): void {
        this.defaultVisit(node);
    }
    protected override visitRaw(node: RawNode): void {
        this.defaultVisit(node);
    }
    protected override visitWhere(node: WhereNode): void {
        this.defaultVisit(node);
    }
    protected override visitInsertQuery(node: InsertQueryNode): void {
        this.defaultVisit(node);
    }
    protected override visitDeleteQuery(node: DeleteQueryNode): void {
        this.defaultVisit(node);
    }
    protected override visitReturning(node: ReturningNode): void {
        this.defaultVisit(node);
    }
    protected override visitCreateTable(node: CreateTableNode): void {
        this.defaultVisit(node);
    }
    protected override visitAddColumn(node: AddColumnNode): void {
        this.defaultVisit(node);
    }
    protected override visitColumnDefinition(node: ColumnDefinitionNode): void {
        this.defaultVisit(node);
    }
    protected override visitDropTable(node: DropTableNode): void {
        this.defaultVisit(node);
    }
    protected override visitOrderBy(node: OrderByNode): void {
        this.defaultVisit(node);
    }
    protected override visitOrderByItem(node: OrderByItemNode): void {
        this.defaultVisit(node);
    }
    protected override visitGroupBy(node: GroupByNode): void {
        this.defaultVisit(node);
    }
    protected override visitGroupByItem(node: GroupByItemNode): void {
        this.defaultVisit(node);
    }
    protected override visitUpdateQuery(node: UpdateQueryNode): void {
        this.defaultVisit(node);
    }
    protected override visitColumnUpdate(node: ColumnUpdateNode): void {
        this.defaultVisit(node);
    }
    protected override visitLimit(node: LimitNode): void {
        this.defaultVisit(node);
    }
    protected override visitOffset(node: OffsetNode): void {
        this.defaultVisit(node);
    }
    protected override visitOnConflict(node: OnConflictNode): void {
        this.defaultVisit(node);
    }
    protected override visitOnDuplicateKey(node: OnDuplicateKeyNode): void {
        this.defaultVisit(node);
    }
    protected override visitCheckConstraint(node: CheckConstraintNode): void {
        this.defaultVisit(node);
    }
    protected override visitDataType(node: DataTypeNode): void {
        this.defaultVisit(node);
    }
    protected override visitSelectAll(node: SelectAllNode): void {
        this.defaultVisit(node);
    }
    protected override visitIdentifier(node: IdentifierNode): void {
        this.defaultVisit(node);
    }
    protected override visitSchemableIdentifier(node: SchemableIdentifierNode): void {
        this.defaultVisit(node);
    }
    protected override visitValue(node: ValueNode): void {
        this.defaultVisit(node);
    }
    protected override visitPrimitiveValueList(node: PrimitiveValueListNode): void {
        this.defaultVisit(node);
    }
    protected override visitOperator(node: OperatorNode): void {
        this.defaultVisit(node);
    }
    protected override visitCreateIndex(node: CreateIndexNode): void {
        this.defaultVisit(node);
    }
    protected override visitDropIndex(node: DropIndexNode): void {
        this.defaultVisit(node);
    }
    protected override visitList(node: ListNode): void {
        this.defaultVisit(node);
    }
    protected override visitPrimaryKeyConstraint(node: PrimaryKeyConstraintNode): void {
        this.defaultVisit(node);
    }
    protected override visitUniqueConstraint(node: UniqueConstraintNode): void {
        this.defaultVisit(node);
    }
    protected override visitReferences(node: ReferencesNode): void {
        this.defaultVisit(node);
    }
    protected override visitWith(node: WithNode): void {
        this.defaultVisit(node);
    }
    protected override visitCommonTableExpression(node: CommonTableExpressionNode): void {
        this.defaultVisit(node);
    }
    protected override visitCommonTableExpressionName(node: CommonTableExpressionNameNode): void {
        this.defaultVisit(node);
    }
    protected override visitHaving(node: HavingNode): void {
        this.defaultVisit(node);
    }
    protected override visitCreateSchema(node: CreateSchemaNode): void {
        this.defaultVisit(node);
    }
    protected override visitDropSchema(node: DropSchemaNode): void {
        this.defaultVisit(node);
    }
    protected override visitAlterTable(node: AlterTableNode): void {
        this.defaultVisit(node);
    }
    protected override visitDropColumn(node: DropColumnNode): void {
        this.defaultVisit(node);
    }
    protected override visitRenameColumn(node: RenameColumnNode): void {
        this.defaultVisit(node);
    }
    protected override visitAlterColumn(node: AlterColumnNode): void {
        this.defaultVisit(node);
    }
    protected override visitModifyColumn(node: ModifyColumnNode): void {
        this.defaultVisit(node);
    }
    protected override visitAddConstraint(node: AddConstraintNode): void {
        this.defaultVisit(node);
    }
    protected override visitDropConstraint(node: DropConstraintNode): void {
        this.defaultVisit(node);
    }
    protected override visitForeignKeyConstraint(node: ForeignKeyConstraintNode): void {
        this.defaultVisit(node);
    }
    protected override visitCreateView(node: CreateViewNode): void {
        this.defaultVisit(node);
    }
    protected override visitDropView(node: DropViewNode): void {
        this.defaultVisit(node);
    }
    protected override visitGenerated(node: GeneratedNode): void {
        this.defaultVisit(node);
    }
    protected override visitDefaultValue(node: DefaultValueNode): void {
        this.defaultVisit(node);
    }
    protected override visitOn(node: OnNode): void {
        this.defaultVisit(node);
    }
    protected override visitValues(node: ValuesNode): void {
        this.defaultVisit(node);
    }
    protected override visitSelectModifier(node: SelectModifierNode): void {
        this.defaultVisit(node);
    }
    protected override visitCreateType(node: CreateTypeNode): void {
        this.defaultVisit(node);
    }
    protected override visitDropType(node: DropTypeNode): void {
        this.defaultVisit(node);
    }
    protected override visitExplain(node: ExplainNode): void {
        this.defaultVisit(node);
    }
    protected override visitDefaultInsertValue(node: DefaultInsertValueNode): void {
        this.defaultVisit(node);
    }
    protected override visitAggregateFunction(node: AggregateFunctionNode): void {
        this.defaultVisit(node);
    }
    protected override visitOver(node: OverNode): void {
        this.defaultVisit(node);
    }
    protected override visitPartitionBy(node: PartitionByNode): void {
        this.defaultVisit(node);
    }
    protected override visitPartitionByItem(node: PartitionByItemNode): void {
        this.defaultVisit(node);
    }
    protected override visitSetOperation(node: SetOperationNode): void {
        this.defaultVisit(node);
    }
    protected override visitBinaryOperation(node: BinaryOperationNode): void {
        this.defaultVisit(node);
    }
    protected override visitUnaryOperation(node: UnaryOperationNode): void {
        this.defaultVisit(node);
    }
    protected override visitUsing(node: UsingNode): void {
        this.defaultVisit(node);
    }
    protected override visitFunction(node: FunctionNode): void {
        this.defaultVisit(node);
    }
    protected override visitCase(node: CaseNode): void {
        this.defaultVisit(node);
    }
    protected override visitWhen(node: WhenNode): void {
        this.defaultVisit(node);
    }
    protected override visitJSONReference(node: JSONReferenceNode): void {
        this.defaultVisit(node);
    }
    protected override visitJSONPath(node: JSONPathNode): void {
        this.defaultVisit(node);
    }
    protected override visitJSONPathLeg(node: JSONPathLegNode): void {
        this.defaultVisit(node);
    }
    protected override visitJSONOperatorChain(node: JSONOperatorChainNode): void {
        this.defaultVisit(node);
    }
    protected override visitTuple(node: TupleNode): void {
        this.defaultVisit(node);
    }
    protected override visitMergeQuery(node: MergeQueryNode): void {
        this.defaultVisit(node);
    }
    protected override visitMatched(node: MatchedNode): void {
        this.defaultVisit(node);
    }
    protected override visitAddIndex(node: AddIndexNode): void {
        this.defaultVisit(node);
    }
    protected override visitCast(node: CastNode): void {
        this.defaultVisit(node);
    }
    protected override visitFetch(node: FetchNode): void {
        this.defaultVisit(node);
    }
    protected override visitTop(node: TopNode): void {
        this.defaultVisit(node);
    }
    protected override visitOutput(node: OutputNode): void {
        this.defaultVisit(node);
    }
    protected override visitRenameConstraint(node: RenameConstraintNode): void {
        this.defaultVisit(node);
    }
    protected override visitRefreshMaterializedView(node: RefreshMaterializedViewNode): void {
        this.defaultVisit(node);
    }
    protected override visitOrAction(node: OrActionNode): void {
        this.defaultVisit(node);
    }
    protected override visitCollate(node: CollateNode): void {
        this.defaultVisit(node);
    }
    protected override visitAlterType(node: AlterTypeNode): void {
        this.defaultVisit(node);
    }
    protected override visitAddValue(node: AddValueNode): void {
        this.defaultVisit(node);
    }
    protected override visitRenameValue(node: RenameValueNode): void {
        this.defaultVisit(node);
    }
}

export type AnyKysely = Kysely<any>;
