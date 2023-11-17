import {
    Argument,
    ArrayExpr,
    AstNode,
    AttributeArg,
    BinaryExpr,
    BinaryExprOperatorPriority,
    BooleanLiteral,
    ConfigArrayExpr,
    ConfigField,
    ConfigInvocationExpr,
    DataModel,
    DataModelAttribute,
    DataModelField,
    DataModelFieldAttribute,
    DataSource,
    FieldInitializer,
    GeneratorDecl,
    InvocationExpr,
    LiteralExpr,
    MemberAccessExpr,
    Model,
    NullExpr,
    NumberLiteral,
    ObjectExpr,
    Plugin,
    PluginField,
    ReferenceArg,
    ReferenceExpr,
    StringLiteral,
    ThisExpr,
    UnaryExpr,
} from '@zenstackhq/language/ast';
import { resolved } from '@zenstackhq/sdk';

/**
 * Options for the generator.
 */
export interface ZModelCodeOptions {
    binaryExprNumberOfSpaces: number;
    unaryExprNumberOfSpaces: number;
    indent: number;
}

// a registry of generation handlers marked with @gen
const generationHandlers = new Map<string, PropertyDescriptor>();

// generation handler decorator
function gen(name: string) {
    return function (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) {
        if (!generationHandlers.get(name)) {
            generationHandlers.set(name, descriptor);
        }
        return descriptor;
    };
}

export default class ZModelCodeGenerator {
    private readonly options: ZModelCodeOptions;

    constructor(options?: Partial<ZModelCodeOptions>) {
        this.options = {
            binaryExprNumberOfSpaces: options?.binaryExprNumberOfSpaces ?? 1,
            unaryExprNumberOfSpaces: options?.unaryExprNumberOfSpaces ?? 0,
            indent: options?.indent ?? 4,
        };
    }

    generate(ast: AstNode): string {
        const handler = generationHandlers.get(ast.$type);
        if (!handler) {
            throw new Error(`No generation handler found for ${ast.$type}`);
        }
        return handler.value.call(this, ast);
    }

    @gen(Model)
    private _generateModel(ast: Model) {
        return ast.declarations.map((d) => this.generate(d)).join('\n\n');
    }

    @gen(DataSource)
    private _generateDataSource(ast: DataSource) {
        return `datasource ${ast.name} {
${ast.fields.map((x) => this.indent + this.generate(x)).join('\n')}
}`;
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
        return `${ast.name}(${ast.args.map((x) => x.name + ': ' + this.generate(x.value)).join(', ')})`;
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
        return `${ast.isAbstract ? 'abstract ' : ''}${ast.isView ? 'view' : 'model'} ${ast.name}${
            ast.superTypes.length > 0 ? ' extends ' + ast.superTypes.map((x) => x.ref?.name).join(', ') : ''
        }} {
${ast.fields.map((x) => this.indent + this.generate(x)).join('\n')}
${ast.attributes.map((x) => this.indent + this.generate(x)).join('\n')}
}`;
    }

    @gen(DataModelField)
    private _generateDataModelField(ast: DataModelField) {
        return `${ast.name} ${ast.type.type ?? ast.type.reference?.$refText}${ast.type.array ? '[]' : ''}${
            ast.type.optional ? '?' : ''
        } ${ast.attributes.length ? ' ' + ast.attributes.map((x) => this.generate(x)).join(' ') : ''}`;
    }

    @gen(DataModelAttribute)
    private _generateDataModelAttribute(ast: DataModelAttribute) {
        return this.attribute(ast);
    }

    @gen(DataModelFieldAttribute)
    private _generateDataModelFieldAttribute(ast: DataModelFieldAttribute) {
        return this.attribute(ast);
    }

    private attribute(ast: DataModelAttribute | DataModelFieldAttribute) {
        const args = ast.args.length ? `(${ast.args.map((x) => this.generate(x)).join(', ')})` : '';
        return `${resolved(ast.decl).name}${args}`;
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
        return `'${ast.value}`;
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

        return `${isLeftParenthesis ? '(' : ''}${this.generate(ast.left)}${isLeftParenthesis ? ')' : ''}${
            this.binaryExprSpace
        }${operator}${this.binaryExprSpace}${isRightParenthesis ? '(' : ''}${
            isCollectionPredicate ? `[${rightExpr}]` : rightExpr
        }${isRightParenthesis ? ')' : ''}`;
    }

    @gen(ReferenceExpr)
    private _generateReferenceExpr(ast: ReferenceExpr) {
        const args = ast.args.length ? `(${ast.args.map((x) => this.generate(x)).join(', ')})` : '';
        return `${ast.target.ref?.name}${args}`;
    }

    @gen(ReferenceArg)
    private _generateReferenceArg(ast: ReferenceArg) {
        return `${ast.name}:${ast.value}`;
    }

    @gen(MemberAccessExpr)
    private _generateMemberExpr(ast: MemberAccessExpr) {
        return `${this.generate(ast.operand)}.${ast.member.ref?.name}`;
    }

    @gen(InvocationExpr)
    private _generateInvocationExpr(ast: InvocationExpr) {
        return `${ast.function.ref?.name}(${ast.args.map((x) => this.argument(x)).join(', ')})`;
    }

    @gen(NullExpr)
    private _generateNullExpr() {
        return 'null';
    }

    @gen(ThisExpr)
    private _generateThisExpr() {
        return 'this';
    }

    argument(ast: Argument) {
        return `${ast.name && ':'} ${this.generate(ast.value)}`;
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

    private isParenthesesNeededForBinaryExpr(ast: BinaryExpr): { left: boolean; right: boolean } {
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
