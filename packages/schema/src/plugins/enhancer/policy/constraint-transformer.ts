import { ZModelCodeGenerator, isAuthInvocation } from '@zenstackhq/sdk';
import {
    BinaryExpr,
    BooleanLiteral,
    Expression,
    ExpressionType,
    LiteralExpr,
    MemberAccessExpr,
    NumberLiteral,
    ReferenceExpr,
    StringLiteral,
    UnaryExpr,
    isBinaryExpr,
    isDataModelField,
    isLiteralExpr,
    isMemberAccessExpr,
    isReferenceExpr,
    isThisExpr,
    isUnaryExpr,
} from '@zenstackhq/sdk/ast';
import { P, match } from 'ts-pattern';

export type ConstraintTransformerOptions = {
    authAccessor: string;
};

export class ConstraintTransformer {
    private varCounter = 0;

    constructor(private readonly options: ConstraintTransformerOptions) {}

    transformRules(allows: Expression[], denies: Expression[]): string {
        this.varCounter = 0;

        if (allows.length === 0) {
            return this.value('false', 'boolean');
        }

        let result: string;

        const allowConstraints = allows.map((allow) => this.transformExpression(allow));
        if (allowConstraints.length > 1) {
            result = this.and(...allowConstraints);
        } else {
            result = allowConstraints[0];
        }

        if (denies.length > 0) {
            const denyConstraints = denies.map((deny) => this.transformExpression(deny));
            result = this.and(result, this.not(this.or(...denyConstraints)));
        }

        console.log(`Constraint transformation result:\n${JSON.stringify(result, null, 2)}`);

        return result;
    }

    private and(...constraints: string[]) {
        if (constraints.length === 0) {
            throw new Error('No expressions to combine');
        }
        return constraints.length === 1 ? constraints[0] : `{ kind: 'and', children: [ ${constraints.join(', ')} ] }`;
    }

    private or(...constraints: string[]) {
        if (constraints.length === 0) {
            throw new Error('No expressions to combine');
        }
        return constraints.length === 1 ? constraints[0] : `{ kind: 'or', children: [ ${constraints.join(', ')} ] }`;
    }

    private not(constraint: string) {
        return `{ kind: 'not', children: [${constraint}] }`;
    }

    private transformExpression(expression: Expression) {
        return (
            match(expression)
                .when(isBinaryExpr, (expr) => this.transformBinary(expr))
                .when(isUnaryExpr, (expr) => this.transformUnary(expr))
                // top-level boolean literal
                .when(isLiteralExpr, (expr) => this.transformLiteral(expr))
                // top-level boolean reference expr
                .when(isReferenceExpr, (expr) => this.transformReference(expr))
                // top-level boolean member access expr
                .when(isMemberAccessExpr, (expr) => this.transformMemberAccess(expr))
                .otherwise(() => this.nextVar())
        );
    }

    private transformLiteral(expr: LiteralExpr) {
        return match(expr.$type)
            .with(NumberLiteral, () => this.value(expr.value.toString(), 'number'))
            .with(StringLiteral, () => this.value(`'${expr.value}'`, 'string'))
            .with(BooleanLiteral, () => this.value(expr.value.toString(), 'boolean'))
            .exhaustive();
    }

    private transformReference(expr: ReferenceExpr) {
        return this.variable(expr.target.$refText, 'boolean');
    }

    private transformMemberAccess(expr: MemberAccessExpr) {
        if (isThisExpr(expr.operand)) {
            return this.variable(expr.member.$refText, 'boolean');
        }
        return this.nextVar();
    }

    private transformBinary(expr: BinaryExpr): string {
        return match(expr.operator)
            .with('&&', () => this.and(this.transformExpression(expr.left), this.transformExpression(expr.right)))
            .with('||', () => this.or(this.transformExpression(expr.left), this.transformExpression(expr.right)))
            .with(P.union('==', '!=', '<', '<=', '>', '>='), () => this.transformComparison(expr))
            .otherwise(() => this.nextVar());
    }

    private transformUnary(expr: UnaryExpr): string {
        return match(expr.operator)
            .with('!', () => this.not(this.transformExpression(expr.operand)))
            .exhaustive();
    }

    private transformComparison(expr: BinaryExpr) {
        const leftOperand = this.getComparisonOperand(expr.left);
        const rightOperand = this.getComparisonOperand(expr.right);

        if (leftOperand === undefined || rightOperand === undefined) {
            return this.nextVar();
        }

        const op = match(expr.operator)
            .with('==', () => 'eq')
            .with('!=', () => 'eq')
            .with('<', () => 'lt')
            .with('<=', () => 'lte')
            .with('>', () => 'gt')
            .with('>=', () => 'gte')
            .otherwise(() => {
                throw new Error(`Unsupported operator: ${expr.operator}`);
            });

        let result = `{ kind: '${op}', left: ${leftOperand}, right: ${rightOperand} }`;
        if (expr.operator === '!=') {
            result = `{ kind: 'not', children: [${result}] }`;
        }

        return result;
    }

    private getComparisonOperand(expr: Expression) {
        if (isLiteralExpr(expr)) {
            return this.transformLiteral(expr);
        }

        const fieldAccess = this.getFieldAccess(expr);
        if (fieldAccess) {
            const mappedType = this.mapType(expr);
            if (mappedType) {
                return this.variable(fieldAccess.name, mappedType);
            } else {
                return undefined;
            }
        }

        const authAccess = this.getAuthAccess(expr);
        if (authAccess) {
            const fieldAccess = `${this.options.authAccessor}?.${authAccess}`;
            const mappedType = this.mapType(expr);
            if (mappedType) {
                return `${fieldAccess} === undefined ? ${this.expressionVariable(expr, mappedType)} : ${this.value(
                    fieldAccess,
                    mappedType
                )}`;
            } else {
                return undefined;
            }
        }

        return undefined;
    }

    private mapType(expression: Expression) {
        return match(expression.$resolvedType?.decl as ExpressionType)
            .with('Boolean', () => 'boolean')
            .with('Int', () => 'number')
            .with('String', () => 'string')
            .otherwise(() => undefined);
    }

    private getFieldAccess(expr: Expression) {
        if (isReferenceExpr(expr)) {
            return isDataModelField(expr.target.ref) ? { name: expr.target.$refText } : undefined;
        }
        if (isMemberAccessExpr(expr)) {
            return isThisExpr(expr.operand) ? { name: expr.member.$refText } : undefined;
        }
        return undefined;
    }

    private getAuthAccess(expr: Expression): string | undefined {
        if (!isMemberAccessExpr(expr)) {
            return undefined;
        }

        if (isAuthInvocation(expr.operand)) {
            return expr.member.$refText;
        } else {
            const operand = this.getAuthAccess(expr.operand);
            return operand ? `${operand}?.${expr.member.$refText}` : undefined;
        }
    }

    private nextVar(type = 'boolean') {
        return this.variable(`__var${this.varCounter++}`, type);
    }

    private expressionVariable(expr: Expression, type: string) {
        const name = new ZModelCodeGenerator().generate(expr);
        return this.variable(name, type);
    }

    private variable(name: string, type: string) {
        return `{ kind: 'variable', name: '${name}', type: '${type}' }`;
    }

    private value(value: string, type: string) {
        return `{ kind: 'value', value: ${value}, type: '${type}' }`;
    }
}
