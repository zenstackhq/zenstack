import {
    ArrayExpr,
    BinaryExpr,
    Expression,
    InvocationExpr,
    isDataModel,
    isDataModelField,
    isMemberAccessExpr,
    isReferenceExpr,
    LiteralExpr,
    MemberAccessExpr,
    NullExpr,
    ReferenceExpr,
    ThisExpr,
    UnaryExpr,
} from '../../language-server/generated/ast';
import { CodeBlockWriter } from 'ts-morph';
import { GeneratorError } from '../types';
import { TypedNode } from 'language-server/types';

const AUX_GUARD_FIELD = 'zenstack_guard';

type Context = {
    nested: boolean;
};

type ComparisonOperator = '==' | '!=' | '>' | '>=' | '<' | '<=';

export default class ExpressionWriter {
    constructor(private readonly writer: CodeBlockWriter) {}

    write(expr: Expression, context: Context = { nested: false }) {
        const _write = () => {
            switch (expr.$type) {
                case LiteralExpr:
                    this.writeLiteral(expr as LiteralExpr, context);
                    break;

                case UnaryExpr:
                    this.writeUnary(expr as UnaryExpr, context);
                    break;

                case BinaryExpr:
                    this.writeBinary(expr as BinaryExpr, context);
                    break;

                case ReferenceExpr:
                    this.writeReference(expr as ReferenceExpr, context);
                    break;

                case InvocationExpr:
                    this.writeInvocation(expr as InvocationExpr, context);
                    break;

                case MemberAccessExpr:
                    this.writeMemberAccess(expr as MemberAccessExpr, context);
                    break;

                case ArrayExpr:
                    throw new Error('Not implemented');

                case NullExpr:
                    this.writeNull(context);
                    break;

                case ThisExpr:
                    throw new Error('Not implemented');

                default:
                    throw new Error(`Not implemented: ${expr.$type}`);
            }
        };

        if (context.nested) {
            _write();
        } else {
            this.writer.block(_write);
        }
    }

    private writeReference(expr: ReferenceExpr, context: Context) {
        if (!isDataModelField(expr.target.ref)) {
            throw new GeneratorError('must be a field in current model');
        }
        this.writer.write(`${expr.target.ref.name}: true`);
    }

    private writeMemberAccess(expr: MemberAccessExpr, context: Context) {
        this.write(expr.operand, context);
        this.writer.write('.' + expr.member.ref?.name);
    }

    private writeNull(context: Context) {
        this.writer.write('null');
    }

    private writeInvocation(expr: InvocationExpr, context: Context) {
        if (expr.function.ref?.name !== 'auth') {
            throw new GeneratorError(
                `Function invocation is not supported: ${expr.function.ref?.name}`
            );
        }

        this.writer.write('user');
    }

    private writeExprList(exprs: Expression[], context: Context) {
        this.writer.writeLine('[');
        for (let i = 0; i < exprs.length; i++) {
            this.write(exprs[i], context);
            if (i !== exprs.length - 1) {
                this.writer.writeLine(',');
            }
        }
        this.writer.writeLine(']');
    }

    private writeBinary(expr: BinaryExpr, context: Context) {
        switch (expr.operator) {
            case '&&':
            case '||':
                this.writeLogical(expr, expr.operator, context);
                break;

            case '==':
            case '!=':
            case '>':
            case '>=':
            case '<':
            case '<=':
                this.writeComparison(expr, expr.operator, context);
                break;
        }
    }

    private isFieldRef(expr: Expression): expr is ReferenceExpr {
        if (isReferenceExpr(expr) && isDataModelField(expr.target.ref)) {
            return true;
        } else {
            return false;
        }
    }

    private guard(write: () => void) {
        this.writer.write(`${AUX_GUARD_FIELD}: `);
        write();
    }

    private quote(write: () => void) {
        this.writer.write('(');
        write();
        this.writer.write(')');
    }

    private writeComparison(
        expr: BinaryExpr,
        operator: ComparisonOperator,
        context: Context
    ) {
        const leftIsFieldAccess =
            this.isFieldRef(expr.left) || this.isRelationFieldAccess(expr.left);
        const rightIsFieldAccess =
            this.isFieldRef(expr.right) ||
            this.isRelationFieldAccess(expr.right);

        if (leftIsFieldAccess && rightIsFieldAccess) {
            throw new GeneratorError(
                `Comparison between fields are not supported yet`
            );
        }

        if (!leftIsFieldAccess && !rightIsFieldAccess) {
            // compile down to a plain expression
            const newContext = { ...context, nested: true };
            this.guard(() => {
                this.write(expr.left, newContext);
                this.writer.write(' ' + operator + ' ');
                this.write(expr.right, newContext);
            });
            return;
        }

        let fieldAccess: Expression;
        let operand: Expression;
        if (leftIsFieldAccess) {
            fieldAccess = expr.left;
            operand = expr.right;
        } else {
            fieldAccess = expr.right;
            operand = expr.left;
            operator = this.negateOperator(operator);
        }

        const type = (fieldAccess as TypedNode).$resolvedType?.decl;

        this.writeFieldCondition(fieldAccess, () => {
            this.writer.block(() => {
                if (isDataModel(type)) {
                    // comparing with an object, conver to "id" comparison instead
                    this.writer.write('id: ');
                    this.writer.block(() => {
                        this.writeOperator(operator, () => {
                            this.write(operand, { ...context, nested: true });
                            this.writer.write('.id');
                        });
                    });
                } else {
                    this.writeOperator(operator, () => {
                        this.write(operand, { ...context, nested: true });
                    });
                }
            });
        });
    }

    private writeOperator(
        operator: ComparisonOperator,
        writeOperand: () => void
    ) {
        if (operator === '!=') {
            // wrap a 'not'
            this.writer.write('not: ');
            this.writer.block(() => {
                this.writeOperator('==', writeOperand);
            });
        } else {
            this.writer.write(`${this.mapOperator(operator)}: `);
            writeOperand();
        }
    }

    private writeFieldCondition(
        fieldAccess: Expression,
        writeCondition: () => void
    ) {
        if (isReferenceExpr(fieldAccess)) {
            if (this.isRelationFieldAccess(fieldAccess)) {
                this.writer.write(fieldAccess.target.ref?.name! + ': ');
                this.writer.block(() => {
                    this.writer.write('is: ');
                    writeCondition();
                });
            } else {
                this.writer.write(fieldAccess.target.ref?.name! + ': ');
                writeCondition();
            }
        } else if (isMemberAccessExpr(fieldAccess)) {
            this.writeFieldCondition(fieldAccess.operand, () => {
                this.writer.block(() => {
                    this.writer.write(fieldAccess.member.ref?.name! + ': ');
                    writeCondition();
                });
            });
        } else {
            throw new GeneratorError(
                `Unsupported expression type: ${fieldAccess.$type}`
            );
        }
    }

    private isRelationFieldAccess(expr: Expression): boolean {
        if (isMemberAccessExpr(expr)) {
            return this.isRelationFieldAccess(expr.operand);
        }

        if (
            isReferenceExpr(expr) &&
            isDataModelField(expr.target.ref) &&
            expr.target.ref.type.reference &&
            isDataModel(expr.target.ref.type.reference.ref)
        ) {
            return true;
        }

        return false;
    }

    mapOperator(operator: '==' | '!=' | '>' | '>=' | '<' | '<=') {
        switch (operator) {
            case '==':
                return 'equals';
            case '!=':
                // TODO
                return 'not_equal';
            case '>':
                return 'gt';
            case '>=':
                return 'ge';
            case '<':
                return 'lt';
            case '<=':
                return 'le';
        }
    }

    private negateOperator(operator: '==' | '!=' | '>' | '>=' | '<' | '<=') {
        switch (operator) {
            case '>':
                return '<=';
            case '<':
                return '>=';
            case '>=':
                return '<';
            case '<=':
                return '>';
            default:
                return operator;
        }
    }

    private writeLogical(
        expr: BinaryExpr,
        operator: '&&' | '||',
        context: Context
    ) {
        if (context.nested) {
            this.quote(() => this.write(expr.left, context));
            this.writer.write(operator);
            this.quote(() => this.write(expr.right, context));
        } else {
            this.writer.writeLine(`${operator === '&&' ? 'AND' : 'OR'}: `);
            this.writeExprList([expr.left, expr.right], context);
        }
    }

    private writeUnary(expr: UnaryExpr, context: Context) {
        if (expr.operator !== '!') {
            throw new GeneratorError(
                `Unary operator "${expr.operator}" is not supported`
            );
        }

        if (context.nested) {
            this.writer.write(expr.operator);
            this.quote(() => this.write(expr.operand, context));
        } else {
            this.writer.writeLine('NOT: ');
            this.write(expr.operand, context);
        }
    }

    private writeLiteral(expr: LiteralExpr, context: Context) {
        if (context.nested) {
            if (typeof expr.value === 'string') {
                this.writer.write(`'${expr.value.toString()}'`);
            } else {
                this.writer.write(expr.value.toString());
            }
        } else {
            this.guard(() => {
                this.writer.write(expr.value.toString());
            });
        }
    }
}
