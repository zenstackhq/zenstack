import { ZModelCodeGenerator, getRelationKeyPairs, isAuthInvocation, isDataModelFieldReference } from '@zenstackhq/sdk';
import {
    BinaryExpr,
    BooleanLiteral,
    DataModelField,
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
    isNullExpr,
    isReferenceExpr,
    isThisExpr,
    isUnaryExpr,
} from '@zenstackhq/sdk/ast';
import { P, match } from 'ts-pattern';

/**
 * Options for {@link ConstraintTransformer}.
 */
export type ConstraintTransformerOptions = {
    authAccessor: string;
};

/**
 * Transform a set of allow and deny rules into a single constraint expression.
 */
export class ConstraintTransformer {
    // a counter for generating unique variable names
    private varCounter = 0;

    constructor(private readonly options: ConstraintTransformerOptions) {}

    /**
     * Transforms a set of allow and deny rules into a single constraint expression.
     */
    transformRules(allows: Expression[], denies: Expression[]): string {
        // reset state
        this.varCounter = 0;

        if (allows.length === 0) {
            // unconditionally deny
            return this.value('false', 'boolean');
        }

        let result: string;

        // transform allow rules
        const allowConstraints = allows.map((allow) => this.transformExpression(allow));
        if (allowConstraints.length > 1) {
            result = this.and(...allowConstraints);
        } else {
            result = allowConstraints[0];
        }

        // transform deny rules and compose
        if (denies.length > 0) {
            const denyConstraints = denies.map((deny) => this.transformExpression(deny));
            result = this.and(result, this.not(this.or(...denyConstraints)));
        }

        // DEBUG:
        // console.log(`Constraint transformation result:\n${JSON.stringify(result, null, 2)}`);

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
            .with(NumberLiteral, () => {
                const parsed = parseFloat(expr.value as string);
                if (isNaN(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
                    // only non-negative integers are supported, for other cases,
                    // transform into a free variable
                    return this.nextVar('number');
                }
                return this.value(expr.value.toString(), 'number');
            })
            .with(StringLiteral, () => this.value(`'${expr.value}'`, 'string'))
            .with(BooleanLiteral, () => this.value(expr.value.toString(), 'boolean'))
            .exhaustive();
    }

    private transformReference(expr: ReferenceExpr) {
        // top-level reference is transformed into a named variable
        return this.variable(expr.target.$refText, 'boolean');
    }

    private transformMemberAccess(expr: MemberAccessExpr) {
        // "this.x" is transformed into a named variable
        if (isThisExpr(expr.operand)) {
            return this.variable(expr.member.$refText, 'boolean');
        }

        // top-level auth access
        const authAccess = this.getAuthAccess(expr);
        if (authAccess) {
            return this.value(`${authAccess} ?? false`, 'boolean');
        }

        // other top-level member access expressions are not supported
        // and thus transformed into a free variable
        return this.nextVar();
    }

    private transformBinary(expr: BinaryExpr): string {
        return (
            match(expr.operator)
                .with('&&', () => this.and(this.transformExpression(expr.left), this.transformExpression(expr.right)))
                .with('||', () => this.or(this.transformExpression(expr.left), this.transformExpression(expr.right)))
                .with(P.union('==', '!=', '<', '<=', '>', '>='), () => this.transformComparison(expr))
                // unsupported operators (e.g., collection predicate) are transformed into a free variable
                .otherwise(() => this.nextVar())
        );
    }

    private transformUnary(expr: UnaryExpr): string {
        return match(expr.operator)
            .with('!', () => this.not(this.transformExpression(expr.operand)))
            .exhaustive();
    }

    private transformComparison(expr: BinaryExpr) {
        if (isAuthInvocation(expr.left) || isAuthInvocation(expr.right)) {
            // handle the case if any operand is `auth()` invocation
            const authComparison = this.transformAuthComparison(expr);
            return authComparison ?? this.nextVar();
        }

        const leftOperand = this.getComparisonOperand(expr.left);
        const rightOperand = this.getComparisonOperand(expr.right);

        const op = this.mapOperatorToConstraintKind(expr.operator);
        const result = `{ kind: '${op}', left: ${leftOperand}, right: ${rightOperand} }`;

        // `auth()` member access can be undefined, when that happens, we assume a false condition
        // for the comparison

        const leftAuthAccess = this.getAuthAccess(expr.left);
        const rightAuthAccess = this.getAuthAccess(expr.right);

        if (leftAuthAccess && rightOperand) {
            // `auth().f op x` => `auth().f !== undefined && auth().f op x`
            return this.and(this.value(`${this.normalizeToNull(leftAuthAccess)} !== null`, 'boolean'), result);
        } else if (rightAuthAccess && leftOperand) {
            // `x op auth().f` => `auth().f !== undefined && x op auth().f`
            return this.and(this.value(`${this.normalizeToNull(rightAuthAccess)} !== null`, 'boolean'), result);
        }

        if (leftOperand === undefined || rightOperand === undefined) {
            // if either operand is not supported, transform into a free variable
            return this.nextVar();
        }

        return result;
    }

    private transformAuthComparison(expr: BinaryExpr) {
        if (this.isAuthEqualNull(expr)) {
            // `auth() == null` => `user === null`
            return this.value(`${this.options.authAccessor} === null`, 'boolean');
        }

        if (this.isAuthNotEqualNull(expr)) {
            // `auth() != null` => `user !== null`
            return this.value(`${this.options.authAccessor} !== null`, 'boolean');
        }

        // auth() equality check against a relation, translate to id-fk comparison
        const operand = isAuthInvocation(expr.left) ? expr.right : expr.left;
        if (!isDataModelFieldReference(operand)) {
            return undefined;
        }

        // get id-fk field pairs from the relation field
        const relationField = operand.target.ref as DataModelField;
        const idFkPairs = getRelationKeyPairs(relationField);

        // build id-fk field comparison constraints
        const fieldConstraints: string[] = [];

        idFkPairs.forEach(({ id, foreignKey }) => {
            const idFieldType = this.mapType(id.type.type as ExpressionType);
            if (!idFieldType) {
                return;
            }
            const fkFieldType = this.mapType(foreignKey.type.type as ExpressionType);
            if (!fkFieldType) {
                return;
            }

            const op = this.mapOperatorToConstraintKind(expr.operator);
            const authIdAccess = `${this.options.authAccessor}?.${id.name}`;

            fieldConstraints.push(
                this.and(
                    // `auth()?.id != null` guard
                    this.value(`${this.normalizeToNull(authIdAccess)} !== null`, 'boolean'),
                    // `auth()?.id [op] fkField`
                    `{ kind: '${op}', left: ${this.value(authIdAccess, idFieldType)}, right: ${this.variable(
                        foreignKey.name,
                        fkFieldType
                    )} }`
                )
            );
        });

        // combine field constraints
        if (fieldConstraints.length > 0) {
            return this.and(...fieldConstraints);
        }

        return undefined;
    }

    // normalize `auth()` access undefined value to null
    private normalizeToNull(expr: string) {
        return `(${expr} ?? null)`;
    }

    private isAuthEqualNull(expr: BinaryExpr) {
        return (
            expr.operator === '==' &&
            ((isAuthInvocation(expr.left) && isNullExpr(expr.right)) ||
                (isAuthInvocation(expr.right) && isNullExpr(expr.left)))
        );
    }

    private isAuthNotEqualNull(expr: BinaryExpr) {
        return (
            expr.operator === '!=' &&
            ((isAuthInvocation(expr.left) && isNullExpr(expr.right)) ||
                (isAuthInvocation(expr.right) && isNullExpr(expr.left)))
        );
    }

    private getComparisonOperand(expr: Expression) {
        if (isLiteralExpr(expr)) {
            return this.transformLiteral(expr);
        }

        const fieldAccess = this.getFieldAccess(expr);
        if (fieldAccess) {
            // model field access is transformed into a named variable
            const mappedType = this.mapExpressionType(expr);
            if (mappedType) {
                return this.variable(fieldAccess.name, mappedType);
            } else {
                return undefined;
            }
        }

        const authAccess = this.getAuthAccess(expr);
        if (authAccess) {
            const mappedType = this.mapExpressionType(expr);
            if (mappedType) {
                return `${this.value(authAccess, mappedType)}`;
            } else {
                return undefined;
            }
        }

        return undefined;
    }

    private mapExpressionType(expression: Expression) {
        return this.mapType(expression.$resolvedType?.decl as ExpressionType);
    }

    private mapType(type: ExpressionType) {
        return match(type)
            .with('Boolean', () => 'boolean')
            .with('Int', () => 'number')
            .with('String', () => 'string')
            .otherwise(() => undefined);
    }

    private mapOperatorToConstraintKind(operator: BinaryExpr['operator']) {
        return match(operator)
            .with('==', () => 'eq')
            .with('!=', () => 'ne')
            .with('<', () => 'lt')
            .with('<=', () => 'lte')
            .with('>', () => 'gt')
            .with('>=', () => 'gte')
            .otherwise(() => {
                throw new Error(`Unsupported operator: ${operator}`);
            });
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
            return `${this.options.authAccessor}?.${expr.member.$refText}`;
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
