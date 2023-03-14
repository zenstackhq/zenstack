import {
    Argument,
    ArrayExpr,
    AttributeArg,
    BinaryExpr,
    BinaryExprOperatorPriority,
    DataModelAttribute,
    DataModelFieldAttribute,
    Expression,
    FieldInitializer,
    InvocationExpr,
    LiteralExpr,
    MemberAccessExpr,
    NullExpr,
    ObjectExpr,
    ReferenceArg,
    ReferenceExpr,
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
}

export default class ZModelCodeGenerator {
    private readonly options: ZModelCodeOptions;
    constructor(options?: Partial<ZModelCodeOptions>) {
        this.options = {
            binaryExprNumberOfSpaces: options?.binaryExprNumberOfSpaces ?? 1,
            unaryExprNumberOfSpaces: options?.unaryExprNumberOfSpaces ?? 0,
        };
    }
    generateAttribute(ast: DataModelAttribute | DataModelFieldAttribute): string {
        const args = ast.args.length ? `(${ast.args.map((x) => this.generateAttributeArg(x)).join(', ')})` : '';
        return `${resolved(ast.decl).name}${args}`;
    }

    generateAttributeArg(ast: AttributeArg) {
        if (ast.name) {
            return `${ast.name}: ${this.generateExpression(ast.value)}`;
        } else {
            return this.generateExpression(ast.value);
        }
    }

    generateExpression(ast: Expression): string {
        switch (ast.$type) {
            case LiteralExpr:
                return this.generateLiteralExpr(ast as LiteralExpr);
            case UnaryExpr:
                return this.generateUnaryExpr(ast as UnaryExpr);
            case ArrayExpr:
                return this.generateArrayExpr(ast as ArrayExpr);
            case BinaryExpr:
                return this.generateBinaryExpr(ast as BinaryExpr);
            case ReferenceExpr:
                return this.generateReferenceExpr(ast as ReferenceExpr);
            case MemberAccessExpr:
                return this.generateMemberExpr(ast as MemberAccessExpr);
            case InvocationExpr:
                return this.generateInvocationExpr(ast as InvocationExpr);
            case ObjectExpr:
                return this.generateObjectExpr(ast as ObjectExpr);
            case NullExpr:
            case ThisExpr:
                return (ast as NullExpr | ThisExpr).value;
            default:
                throw new Error(`Not implemented: ${ast}`);
        }
    }

    generateObjectExpr(ast: ObjectExpr) {
        return `{ ${ast.fields.map((field) => this.generateObjectField(field)).join(', ')} }`;
    }

    generateObjectField(field: FieldInitializer) {
        return `${field.name}: ${this.generateExpression(field.value)}`;
    }

    generateArrayExpr(ast: ArrayExpr) {
        return `[${ast.items.map((item) => this.generateExpression(item)).join(', ')}]`;
    }

    generateLiteralExpr(ast: LiteralExpr) {
        return typeof ast.value === 'string' ? `'${ast.value}'` : ast.value.toString();
    }

    generateUnaryExpr(ast: UnaryExpr) {
        return `${ast.operator}${this.unaryExprSpace}${this.generateExpression(ast.operand)}`;
    }

    generateBinaryExpr(ast: BinaryExpr) {
        const operator = ast.operator;
        const isCollectionPredicate = this.isCollectionPredicateOperator(operator);
        const rightExpr = this.generateExpression(ast.right);

        const { left: isLeftParenthesis, right: isRightParenthesis } = this.isParenthesesNeededForBinaryExpr(ast);

        return `${isLeftParenthesis ? '(' : ''}${this.generateExpression(ast.left)}${isLeftParenthesis ? ')' : ''}${
            this.binaryExprSpace
        }${operator}${this.binaryExprSpace}${isRightParenthesis ? '(' : ''}${
            isCollectionPredicate ? `[${rightExpr}]` : rightExpr
        }${isRightParenthesis ? ')' : ''}`;
    }

    generateReferenceExpr(ast: ReferenceExpr) {
        const args = ast.args.length ? `(${ast.args.map((x) => this.generateReferenceArg(x)).join(', ')})` : '';
        return `${ast.target.ref?.name}${args}`;
    }

    generateReferenceArg(ast: ReferenceArg) {
        return `${ast.name}:${ast.value}`;
    }

    generateMemberExpr(ast: MemberAccessExpr) {
        return `${this.generateExpression(ast.operand)}.${ast.member.ref?.name}`;
    }

    generateInvocationExpr(ast: InvocationExpr) {
        return `${ast.function.ref?.name}(${ast.args.map((x) => this.generateArgument(x)).join(', ')})`;
    }

    generateArgument(ast: Argument) {
        return `${ast.name && ':'} ${this.generateExpression(ast.value)}`;
    }

    private get binaryExprSpace(): string {
        return ' '.repeat(this.options.binaryExprNumberOfSpaces);
    }

    private get unaryExprSpace(): string {
        return ' '.repeat(this.options.unaryExprNumberOfSpaces);
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
