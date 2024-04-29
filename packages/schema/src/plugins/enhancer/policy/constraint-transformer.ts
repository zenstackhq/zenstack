import { ZModelCodeGenerator, getLiteral, isAuthInvocation } from '@zenstackhq/sdk';
import {
    BinaryExpr,
    Expression,
    ExpressionType,
    LiteralExpr,
    MemberAccessExpr,
    ReferenceExpr,
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

        if (allows.length === 0 && denies.length === 0) {
            return `{ value: true, type: 'boolean' }`;
        }

        if (allows.length === 0) {
            return `{ value: false, type: 'boolean' }`;
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

        return result;
    }

    private and(...constraints: string[]) {
        if (constraints.length === 0) {
            throw new Error('No expressions to combine');
        }
        return constraints.length === 1 ? `{ and: [ ${constraints.join(', ')} ] }` : constraints[0];
    }

    private or(...constraints: string[]) {
        if (constraints.length === 0) {
            throw new Error('No expressions to combine');
        }
        return constraints.length === 1 ? `{ or: [ ${constraints.join(', ')} ] }` : constraints[0];
    }

    private not(constraint: string) {
        return `{ not: ${constraint} }`;
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
        const value = getLiteral<boolean>(expr);
        return value ? `{ value: true, type: 'boolean' }` : `{ value: false, type: 'boolean' }`;
    }

    private transformReference(expr: ReferenceExpr) {
        return `{ name: '${expr.target.$refText}', type: 'boolean' }`;
    }

    private transformMemberAccess(expr: MemberAccessExpr) {
        if (isThisExpr(expr.operand)) {
            return `{ name: '${expr.member.$refText}', type: 'boolean' }`;
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
            .otherwise(() => this.nextVar());
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

        let result = `{ ${op}: { left: ${leftOperand}, right: ${rightOperand} } }`;
        if (expr.operator === '!=') {
            result = `{ not: ${result} }`;
        }

        return result;
    }

    private getComparisonOperand(expr: Expression) {
        if (isLiteralExpr(expr)) {
            const mappedType = this.mapType(expr.$resolvedType?.decl as ExpressionType);
            if (mappedType) {
                return `{ value: ${expr.value}, type: '${mappedType}' }`;
            } else {
                return undefined;
            }
        }

        const fieldAccess = this.getFieldAccess(expr);
        if (fieldAccess) {
            const fieldType = expr.$resolvedType?.decl;
            if (!fieldType) {
                return undefined;
            }

            const mappedType = this.mapType(fieldType as ExpressionType);
            if (mappedType) {
                return `{ name: '${fieldAccess.name}', type: '${mappedType}' }`;
            } else {
                return undefined;
            }
        }

        const authAccess = this.getAuthAccess(expr);
        if (authAccess) {
            const fieldType = expr.$resolvedType?.decl;
            if (!fieldType) {
                return undefined;
            }

            const mappedType = this.mapType(fieldType as ExpressionType);
            if (mappedType) {
                return `{ value: ${this.options.authAccessor}?.${authAccess.name}, type: '${mappedType}' }`;
            } else {
                return undefined;
            }
        }

        return undefined;
    }

    private mapType(fieldType: ExpressionType) {
        return match(fieldType)
            .with('Boolean', () => 'boolean')
            .with('Int', () => 'number')
            .with('String', () => 'string')
            .otherwise(() => undefined);
    }

    // private transformEquality(left: Expression, right: Expression) {
    //     if (this.isFieldAccess(left) || this.isFieldAccess(right)) {
    //         const variable = this.isFieldAccess(left) ? left : right;
    //         const value = this.isFieldAccess(left) ? right : left;

    //         const value = this.getExprValue(right);
    //         if (value !== undefined) {
    //             if (value === true) {
    //                 return `{ var: '${this.getFieldName(left)}' }`;
    //             } else if (value === false) {
    //                 return `{ not: { var: '${this.getFieldName(left)}' } }`;
    //             } else {
    //                 return `{ eq: { ${this.getFieldName(left)}: ${this.encodeValue(value)} } }`;
    //             }
    //         }
    //     }

    //     if (this.isFieldAccess(right)) {
    //         const value = this.getExprValue(left);
    //         if (value !== undefined) {
    //             return `'${this.getFieldName(right)} == ${value}'`;
    //         }
    //     }

    //     if (this.isAuthAccess(left)) {
    //         const value = this.getExprValue(right);
    //         if (value !== undefined) {
    //             return `${this.options.authAccessor}?.${left.member.$refText} === ${value}`;
    //         }
    //     }

    //     if (this.isAuthAccess(right)) {
    //         const value = this.getExprValue(left);
    //         if (value !== undefined) {
    //             return `${this.options.authAccessor}?.${right.member.$refText} === ${value}`;
    //         }
    //     }

    //     return this.nextVar();
    // }

    // private encodeValue(value: string | number | boolean) {
    //     if (typeof value === 'number' || typeof value === 'boolean') {
    //         return value;
    //     } else {
    //         const index = this.stringTable.indexOf(value);
    //         if (index === -1) {
    //             this.stringTable.push(value);
    //             return this.stringTable.length - 1;
    //         } else {
    //             return index;
    //         }
    //     }
    // }

    private getFieldAccess(expr: Expression) {
        if (isReferenceExpr(expr)) {
            return isDataModelField(expr.target.ref) ? { name: expr.target.$refText } : undefined;
        }
        if (isMemberAccessExpr(expr)) {
            return isThisExpr(expr.operand) ? { name: expr.member.$refText } : undefined;
        }
        return undefined;
    }

    // private getFieldName(expr: ReferenceExpr | MemberAccessExpr): string {
    //     return isReferenceExpr(expr) ? expr.target.$refText : expr.member.$refText;
    // }

    // private getExprValue(expr: Expression): string | boolean | number | undefined {
    //     if (isLiteralExpr(expr)) {
    //         return expr.value;
    //     }

    //     if (this.isAuthAccess(expr)) {
    //         return `${this.options.authAccessor}?.${expr.member.$refText}`;
    //     }

    //     return undefined;
    // }

    private getAuthAccess(expr: Expression) {
        return isMemberAccessExpr(expr) && isAuthInvocation(expr.operand) ? { name: expr.member.$refText } : undefined;
    }

    private nextVar() {
        return `'__var${this.varCounter++}'`;
    }

    private expressionVariable(expr: Expression) {
        return new ZModelCodeGenerator().generate(expr);
    }
}
