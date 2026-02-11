import {
    Argument,
    ArrayExpr,
    Attribute,
    AttributeArg,
    AttributeParam,
    AttributeParamType,
    BinaryExpr,
    BinaryExprOperatorPriority,
    BooleanLiteral,
    ConfigArrayExpr,
    ConfigField,
    ConfigInvocationExpr,
    DataField,
    DataFieldAttribute,
    DataFieldType,
    DataModel,
    DataModelAttribute,
    DataSource,
    Enum,
    EnumField,
    FieldInitializer,
    FunctionDecl,
    FunctionParam,
    FunctionParamType,
    GeneratorDecl,
    InvocationExpr,
    LiteralExpr,
    MemberAccessExpr,
    Model,
    ModelImport,
    NullExpr,
    NumberLiteral,
    ObjectExpr,
    Plugin,
    PluginField,
    ReferenceArg,
    ReferenceExpr,
    StringLiteral,
    ThisExpr,
    TypeDef,
    UnaryExpr,
    type AstNode,
} from './ast';

/**
 * Options for the generator.
 */
export interface ZModelCodeOptions {
    binaryExprNumberOfSpaces: number;
    unaryExprNumberOfSpaces: number;
    indent: number;
    quote: 'single' | 'double';
}

// a registry of generation handlers marked with @gen
const generationHandlers = new Map<string, PropertyDescriptor>();

// generation handler decorator
function gen(name: string) {
    return function (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) {
        if (!generationHandlers.get(name)) {
            generationHandlers.set(name, descriptor);
        }
        return descriptor;
    };
}

/**
 * Generates ZModel source code from AST.
 */
export class ZModelCodeGenerator {
    private readonly options: ZModelCodeOptions;
    private readonly quote: string;
    constructor(options?: Partial<ZModelCodeOptions>) {
        this.options = {
            binaryExprNumberOfSpaces: options?.binaryExprNumberOfSpaces ?? 1,
            unaryExprNumberOfSpaces: options?.unaryExprNumberOfSpaces ?? 0,
            indent: options?.indent ?? 4,
            quote: options?.quote ?? 'single',
        };
        this.quote = this.options.quote === 'double' ? '"' : "'";
    }

    /**
     * Generates ZModel source code from AST.
     */
    generate(ast: AstNode): string {
        const handler = generationHandlers.get(ast.$type);
        if (!handler) {
            throw new Error(`No generation handler found for ${ast.$type}`);
        }
        return handler.value.call(this, ast);
    }

    private quotedStr(val: string): string {
        const trimmedVal = val.replace(new RegExp(`(?<!\\\\)${this.quote}`, 'g'), `\\${this.quote}`);
        return `${this.quote}${trimmedVal}${this.quote}`;
    }

    @gen(Model)
    private _generateModel(ast: Model) {
        return `${ast.imports.map((d) => this.generate(d)).join('\n')}${ast.imports.length > 0 ? '\n\n' : ''}${ast.declarations
            .map((d) => this.generate(d))
            .join('\n\n')}`;
    }

    @gen(DataSource)
    private _generateDataSource(ast: DataSource) {
        return `datasource ${ast.name} {
${ast.fields.map((x) => this.indent + this.generate(x)).join('\n')}
}`;
    }

    @gen(ModelImport)
    private _generateModelImport(ast: ModelImport) {
        return `import ${this.quotedStr(ast.path)}`;
    }

    @gen(Enum)
    private _generateEnum(ast: Enum) {
        const comments = `${ast.comments.join('\n')}\n`;
        return `${ast.comments.length > 0 ? comments : ''}enum ${ast.name} {
${ast.fields.map((x) => this.indent + this.generate(x)).join('\n')}${
            ast.attributes.length > 0
                ? '\n\n' + ast.attributes.map((x) => this.indent + this.generate(x)).join('\n')
                : ''
        }
}`;
    }

    @gen(EnumField)
    private _generateEnumField(ast: EnumField) {
        const fieldLine = `${ast.name}${
            ast.attributes.length > 0 ? ' ' + ast.attributes.map((x) => this.generate(x)).join(' ') : ''
        }`;

        if (ast.comments.length === 0) {
            return fieldLine;
        }

        // Build comment block with proper indentation:
        // - First comment: no indent (caller adds it via `this.indent + this.generate(x)`)
        // - Subsequent comments: add indent
        // - Field line: add indent (since it comes after the comment block)
        const commentLines = ast.comments.map((c, i) => (i === 0 ? c : this.indent + c));
        return `${commentLines.join('\n')}\n${this.indent}${fieldLine}`;
    }

    @gen(GeneratorDecl)
    private _generateGenerator(ast: GeneratorDecl) {
        return `generator ${ast.name} {
${ast.fields.map((x) => this.indent + this.generate(x)).join('\n')}
}`;
    }

    @gen(ConfigField)
    private _generateConfigField(ast: ConfigField) {
        return `${ast.name} = ${this.generate(ast.value)}`;
    }

    @gen(ConfigArrayExpr)
    private _generateConfigArrayExpr(ast: ConfigArrayExpr) {
        return `[${ast.items.map((x) => this.generate(x)).join(', ')}]`;
    }

    @gen(ConfigInvocationExpr)
    private _generateConfigInvocationExpr(ast: ConfigInvocationExpr) {
        if (ast.args.length === 0) {
            return ast.name;
        } else {
            return `${ast.name}(${ast.args
                .map((x) => (x.name ? x.name + ': ' : '') + this.generate(x.value))
                .join(', ')})`;
        }
    }

    @gen(Plugin)
    private _generatePlugin(ast: Plugin) {
        return `plugin ${ast.name} {
${ast.fields.map((x) => this.indent + this.generate(x)).join('\n')}
}`;
    }

    @gen(PluginField)
    private _generatePluginField(ast: PluginField) {
        return `${ast.name} = ${this.generate(ast.value)}`;
    }

    @gen(DataModel)
    private _generateDataModel(ast: DataModel) {
        const comments = `${ast.comments.join('\n')}\n`;

        return `${ast.comments.length > 0 ? comments : ''}${ast.isView ? 'view' : 'model'} ${ast.name}${
            ast.mixins.length > 0 ? ' with ' + ast.mixins.map((x) => x.$refText).join(', ') : ''
        } {
${ast.fields.map((x) => this.indent + this.generate(x)).join('\n')}${
            ast.attributes.length > 0
                ? '\n\n' + ast.attributes.map((x) => this.indent + this.generate(x)).join('\n')
                : ''
        }
}`;
    }

    @gen(DataField)
    private _generateDataField(ast: DataField) {
        const fieldLine = `${ast.name} ${this.fieldType(ast.type)}${
            ast.attributes.length > 0 ? ' ' + ast.attributes.map((x) => this.generate(x)).join(' ') : ''
        }`;

        if (ast.comments.length === 0) {
            return fieldLine;
        }

        // Build comment block with proper indentation:
        // - First comment: no indent (caller adds it via `this.indent + this.generate(x)`)
        // - Subsequent comments: add indent
        // - Field line: add indent (since it comes after the comment block)
        const commentLines = ast.comments.map((c, i) => (i === 0 ? c : this.indent + c));
        return `${commentLines.join('\n')}\n${this.indent}${fieldLine}`;
    }

    private fieldType(type: DataFieldType) {
        const baseType = type.type
            ? type.type
            : type.$type == 'DataFieldType' && type.unsupported
              ? 'Unsupported(' + this.generate(type.unsupported.value) + ')'
              : type.reference?.$refText;
        return `${baseType}${type.array ? '[]' : ''}${type.optional ? '?' : ''}`;
    }

    @gen(DataModelAttribute)
    private _generateDataModelAttribute(ast: DataModelAttribute) {
        return this.attribute(ast);
    }

    @gen(DataFieldAttribute)
    private _generateDataFieldAttribute(ast: DataFieldAttribute) {
        return this.attribute(ast);
    }

    private attribute(ast: DataModelAttribute | DataFieldAttribute) {
        const args = ast.args.length ? `(${ast.args.map((x) => this.generate(x)).join(', ')})` : '';
        return `${ast.decl.$refText}${args}`;
    }

    @gen(AttributeArg)
    private _generateAttributeArg(ast: AttributeArg) {
        if (ast.name) {
            return `${ast.name}: ${this.generate(ast.value)}`;
        } else {
            return this.generate(ast.value);
        }
    }

    @gen(ObjectExpr)
    private _generateObjectExpr(ast: ObjectExpr) {
        return `{ ${ast.fields.map((field) => this.objectField(field)).join(', ')} }`;
    }

    private objectField(field: FieldInitializer) {
        return `${field.name}: ${this.generate(field.value)}`;
    }

    @gen(ArrayExpr)
    private _generateArrayExpr(ast: ArrayExpr) {
        return `[${ast.items.map((item) => this.generate(item)).join(', ')}]`;
    }

    @gen(StringLiteral)
    private _generateLiteralExpr(ast: LiteralExpr) {
        return this.quotedStr(ast.value as string);
    }

    @gen(NumberLiteral)
    private _generateNumberLiteral(ast: NumberLiteral) {
        return ast.value.toString();
    }

    @gen(BooleanLiteral)
    private _generateBooleanLiteral(ast: BooleanLiteral) {
        return ast.value.toString();
    }

    @gen(UnaryExpr)
    private _generateUnaryExpr(ast: UnaryExpr) {
        return `${ast.operator}${this.unaryExprSpace}${this.generate(ast.operand)}`;
    }

    @gen(BinaryExpr)
    private _generateBinaryExpr(ast: BinaryExpr) {
        const operator = ast.operator;
        const isCollectionPredicate = this.isCollectionPredicateOperator(operator);
        const rightExpr = this.generate(ast.right);

        const { left: isLeftParenthesis, right: isRightParenthesis } = this.isParenthesesNeededForBinaryExpr(ast);

        const collectionPredicate = isCollectionPredicate
            ? `[${ast.binding ? `${ast.binding}, ${rightExpr}` : rightExpr}]`
            : rightExpr;

        return `${isLeftParenthesis ? '(' : ''}${this.generate(ast.left)}${
            isLeftParenthesis ? ')' : ''
        }${isCollectionPredicate ? '' : this.binaryExprSpace}${operator}${
            isCollectionPredicate ? '' : this.binaryExprSpace
        }${isRightParenthesis ? '(' : ''}${collectionPredicate}${isRightParenthesis ? ')' : ''}`;
    }

    @gen(ReferenceExpr)
    private _generateReferenceExpr(ast: ReferenceExpr) {
        const args = ast.args.length ? `(${ast.args.map((x) => this.generate(x)).join(', ')})` : '';
        return `${ast.target.$refText}${args}`;
    }

    @gen(ReferenceArg)
    private _generateReferenceArg(ast: ReferenceArg) {
        return `${ast.name}: ${this.generate(ast.value)}`;
    }

    @gen(MemberAccessExpr)
    private _generateMemberExpr(ast: MemberAccessExpr) {
        return `${this.generate(ast.operand)}.${ast.member.$refText}`;
    }

    @gen(InvocationExpr)
    private _generateInvocationExpr(ast: InvocationExpr) {
        return `${ast.function.$refText}(${ast.args.map((x) => this.argument(x)).join(', ')})`;
    }

    @gen(NullExpr)
    private _generateNullExpr() {
        return 'null';
    }

    @gen(ThisExpr)
    private _generateThisExpr() {
        return 'this';
    }

    @gen(Attribute)
    private _generateAttribute(ast: Attribute) {
        return `attribute ${ast.name}(${ast.params.map((x) => this.generate(x)).join(', ')})`;
    }

    @gen(AttributeParam)
    private _generateAttributeParam(ast: AttributeParam) {
        return `${ast.default ? '_ ' : ''}${ast.name}: ${this.generate(ast.type)}`;
    }

    @gen(AttributeParamType)
    private _generateAttributeParamType(ast: AttributeParamType) {
        return `${ast.type ?? ast.reference?.$refText}${ast.array ? '[]' : ''}${ast.optional ? '?' : ''}`;
    }

    @gen(FunctionDecl)
    private _generateFunctionDecl(ast: FunctionDecl) {
        return `function ${ast.name}(${ast.params.map((x) => this.generate(x)).join(', ')}) ${
            ast.returnType ? ': ' + this.generate(ast.returnType) : ''
        } {}`;
    }

    @gen(FunctionParam)
    private _generateFunctionParam(ast: FunctionParam) {
        return `${ast.name}: ${this.generate(ast.type)}`;
    }

    @gen(FunctionParamType)
    private _generateFunctionParamType(ast: FunctionParamType) {
        return `${ast.type ?? ast.reference?.$refText}${ast.array ? '[]' : ''}`;
    }

    @gen(TypeDef)
    private _generateTypeDef(ast: TypeDef) {
        return `type ${ast.name} {
${ast.fields.map((x) => this.indent + this.generate(x)).join('\n')}${
            ast.attributes.length > 0
                ? '\n\n' + ast.attributes.map((x) => this.indent + this.generate(x)).join('\n')
                : ''
        }
}`;
    }

    private argument(ast: Argument) {
        return this.generate(ast.value);
    }

    private get binaryExprSpace() {
        return ' '.repeat(this.options.binaryExprNumberOfSpaces);
    }

    private get unaryExprSpace() {
        return ' '.repeat(this.options.unaryExprNumberOfSpaces);
    }

    private get indent() {
        return ' '.repeat(this.options.indent);
    }

    private isParenthesesNeededForBinaryExpr(ast: BinaryExpr): {
        left: boolean;
        right: boolean;
    } {
        const result = { left: false, right: false };
        const operator = ast.operator;
        const isCollectionPredicate = this.isCollectionPredicateOperator(operator);

        const currentPriority = BinaryExprOperatorPriority[operator];

        if (
            ast.left.$type === BinaryExpr &&
            BinaryExprOperatorPriority[(ast.left as BinaryExpr)['operator']] < currentPriority
        ) {
            result.left = true;
        }
        /**
         *  1 collection predicate operator has [] around the right operand, no need to add parenthesis.
         *  2 grammar is left associative, so if the right operand has the same priority still need to add parenthesis.
         **/
        if (
            !isCollectionPredicate &&
            ast.right.$type === BinaryExpr &&
            BinaryExprOperatorPriority[(ast.right as BinaryExpr)['operator']] <= currentPriority
        ) {
            result.right = true;
        }

        return result;
    }

    private isCollectionPredicateOperator(op: BinaryExpr['operator']) {
        return ['?', '!', '^'].includes(op);
    }
}
