import {
    Argument,
    AttributeArg,
    BinaryExpr,
    DataModelAttribute,
    DataModelFieldAttribute,
    Expression,
    InvocationExpr,
    LiteralExpr,
    MemberAccessExpr,
    NullExpr,
    ReferenceArg,
    ReferenceExpr,
    ThisExpr,
    UnaryExpr,
} from '@zenstackhq/language/ast';
import { resolved } from '@zenstackhq/sdk';

export default class ZModelCodeGenerator {
    generateAttribute(ast: DataModelAttribute | DataModelFieldAttribute): string {
        const args = ast.args.length ? `(${ast.args.map((x) => this.generateAttributeArg(x)).join(', ')})` : '';
        return `${resolved(ast.decl).name}${args}`;
    }

    generateAttributeArg(ast: AttributeArg) {
        return this.generateExpression(ast.value);
    }

    generateExpression(ast: Expression): string {
        switch (ast.$type) {
            case LiteralExpr:
                return this.generateLiteralExpr(ast as LiteralExpr);
            case UnaryExpr:
                return this.generateUnaryExpr(ast as UnaryExpr);
            case BinaryExpr:
                return this.generateBinaryExpr(ast as BinaryExpr);
            case ReferenceExpr:
                return this.generateReferenceExpr(ast as ReferenceExpr);
            case MemberAccessExpr:
                return this.generateMemberExpr(ast as MemberAccessExpr);
            case InvocationExpr:
                return this.generateInvocationExpr(ast as InvocationExpr);
            case NullExpr:
            case ThisExpr:
                return (ast as NullExpr | ThisExpr).value;
            default:
                throw new Error(`Not implemented: ${ast.$type}`);
        }
    }

    generateLiteralExpr(ast: LiteralExpr) {
        return typeof ast.value === 'string' ? `'${ast.value}'` : ast.value.toString();
    }

    generateUnaryExpr(ast: UnaryExpr) {
        return `${ast.operator}${this.generateExpression(ast.operand)}`;
    }

    generateBinaryExpr(ast: BinaryExpr) {
        const operator = ast.operator;
        const isCollectionPredicate = ['?', '!', '^'].includes(operator);
        const rightExpr = this.generateExpression(ast.right);
        return `${this.generateExpression(ast.left)}${operator}${isCollectionPredicate ? `[${rightExpr}]` : rightExpr}`;
    }

    generateReferenceExpr(ast: ReferenceExpr) {
        const args = ast.args.length ? `(${ast.args.map((x) => this.generateReferenceArg(x)).join(', ')})` : '';
        return `${ast.target.ref?.name}${args}`;
    }

    generateReferenceArg(ast: ReferenceArg) {
        return `sort:${ast.value}`;
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
}
