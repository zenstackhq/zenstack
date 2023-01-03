import {
    BinaryExpr,
    Expression,
    isDataModel,
    isDataModelField,
    isEnumField,
    isMemberAccessExpr,
    isReferenceExpr,
    isThisExpr,
    LiteralExpr,
    MemberAccessExpr,
    ReferenceExpr,
    UnaryExpr,
} from '@zenstackhq/language/ast';
import { GUARD_FIELD_NAME, PluginError } from '@zenstackhq/sdk';
import { CodeBlockWriter } from 'ts-morph';
import TypeScriptExpressionTransformer from './typescript-expression-transformer';
import { isFutureExpr } from './utils';

type ComparisonOperator = '==' | '!=' | '>' | '>=' | '<' | '<=';

/**
 * Utility for writing ZModel expression as Prisma query argument objects into a ts-morph writer
 */
export class ExpressionWriter {
    private readonly plainExprBuilder: TypeScriptExpressionTransformer;

    /**
     * Constructs a new ExpressionWriter
     *
     * @param isPostGuard indicates if we're writing for post-update conditions
     */
    constructor(private readonly writer: CodeBlockWriter, private readonly isPostGuard = false) {
        this.plainExprBuilder = new TypeScriptExpressionTransformer(this.isPostGuard);
    }

    /**
     * Writes the given ZModel expression.
     */
    write(expr: Expression): void {
        const _write = () => {
            switch (expr.$type) {
                case LiteralExpr:
                    this.writeLiteral(expr as LiteralExpr);
                    break;

                case UnaryExpr:
                    this.writeUnary(expr as UnaryExpr);
                    break;

                case BinaryExpr:
                    this.writeBinary(expr as BinaryExpr);
                    break;

                case ReferenceExpr:
                    this.writeReference(expr as ReferenceExpr);
                    break;

                case MemberAccessExpr:
                    this.writeMemberAccess(expr as MemberAccessExpr);
                    break;

                default:
                    throw new Error(`Not implemented: ${expr.$type}`);
            }
        };

        this.block(_write);
    }

    private writeReference(expr: ReferenceExpr) {
        if (isEnumField(expr.target.ref)) {
            throw new Error('We should never get here');
        } else {
            this.writer.write(`${expr.target.ref?.name}: true`);
        }
    }

    private writeMemberAccess(expr: MemberAccessExpr) {
        this.writeFieldCondition(
            expr.operand,
            () => {
                this.block(() => {
                    this.writer.write(`${expr.member.ref?.name}: true`);
                });
            },
            'is'
        );
    }

    private writeExprList(exprs: Expression[]) {
        this.writer.writeLine('[');
        for (let i = 0; i < exprs.length; i++) {
            this.write(exprs[i]);
            if (i !== exprs.length - 1) {
                this.writer.writeLine(',');
            }
        }
        this.writer.writeLine(']');
    }

    private writeBinary(expr: BinaryExpr) {
        switch (expr.operator) {
            case '&&':
            case '||':
                this.writeLogical(expr, expr.operator);
                break;

            case '==':
            case '!=':
            case '>':
            case '>=':
            case '<':
            case '<=':
                this.writeComparison(expr, expr.operator);
                break;

            case '?':
            case '!':
            case '^':
                this.writeCollectionPredicate(expr, expr.operator);
                break;
        }
    }

    private writeCollectionPredicate(expr: BinaryExpr, operator: string) {
        this.writeFieldCondition(
            expr.left,
            () => {
                this.write(expr.right);
            },
            operator === '?' ? 'some' : operator === '!' ? 'every' : 'none'
        );
    }

    private isFieldAccess(expr: Expression): boolean {
        if (isThisExpr(expr)) {
            return true;
        }

        if (isMemberAccessExpr(expr)) {
            if (isFutureExpr(expr.operand) && this.isPostGuard) {
                // when writing for post-update, future().field.x is a field access
                return true;
            } else {
                return this.isFieldAccess(expr.operand);
            }
        }
        if (isReferenceExpr(expr) && isDataModelField(expr.target.ref) && !this.isPostGuard) {
            return true;
        }
        return false;
    }

    private guard(write: () => void) {
        this.writer.write(`${GUARD_FIELD_NAME}: `);
        write();
    }

    private plain(expr: Expression) {
        this.writer.write(this.plainExprBuilder.transform(expr));
    }

    private writeComparison(expr: BinaryExpr, operator: ComparisonOperator) {
        const leftIsFieldAccess = this.isFieldAccess(expr.left);
        const rightIsFieldAccess = this.isFieldAccess(expr.right);

        if (leftIsFieldAccess && rightIsFieldAccess) {
            throw new PluginError(`Comparison between fields are not supported yet`);
        }

        if (!leftIsFieldAccess && !rightIsFieldAccess) {
            // compile down to a plain expression
            this.guard(() => {
                this.plain(expr.left);
                this.writer.write(' ' + operator + ' ');
                this.plain(expr.right);
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

        if (isMemberAccessExpr(fieldAccess) && isFutureExpr(fieldAccess.operand)) {
            // future().field should be treated as the "field" directly, so we
            // strip 'future().' and synthesize a reference expr
            fieldAccess = {
                $type: ReferenceExpr,
                $container: fieldAccess.$container,
                target: fieldAccess.member,
                $resolvedType: fieldAccess.$resolvedType,
            } as ReferenceExpr;
        }

        this.writeFieldCondition(
            fieldAccess,
            () => {
                this.block(
                    () => {
                        if (this.isModelTyped(fieldAccess)) {
                            // comparing with an object, conver to "id" comparison instead
                            this.writer.write('id: ');
                            this.block(() => {
                                this.writeOperator(operator, () => {
                                    this.plain(operand);
                                    this.writer.write('?.id');
                                });
                            });
                        } else {
                            this.writeOperator(operator, () => {
                                this.plain(operand);
                            });
                        }
                    },
                    // "this" expression is compiled away (to .id access), so we should
                    // avoid generating a new layer
                    !isThisExpr(fieldAccess)
                );
            },
            'is'
        );
    }

    private writeOperator(operator: ComparisonOperator, writeOperand: () => void) {
        if (operator === '!=') {
            // wrap a 'not'
            this.writer.write('not: ');
            this.block(() => {
                this.writeOperator('==', writeOperand);
            });
        } else {
            this.writer.write(`${this.mapOperator(operator)}: `);
            writeOperand();
        }
    }

    private writeFieldCondition(
        fieldAccess: Expression,
        writeCondition: () => void,
        relationOp: 'is' | 'some' | 'every' | 'none'
    ) {
        let selector: string | undefined;
        let operand: Expression | undefined;

        if (isThisExpr(fieldAccess)) {
            // pass on
            writeCondition();
            return;
        } else if (isReferenceExpr(fieldAccess)) {
            selector = fieldAccess.target.ref?.name;
        } else if (isMemberAccessExpr(fieldAccess)) {
            if (isFutureExpr(fieldAccess.operand)) {
                // future().field should be treated as the "field"
                selector = fieldAccess.member.ref?.name;
            } else {
                selector = fieldAccess.member.ref?.name;
                operand = fieldAccess.operand;
            }
        } else {
            throw new PluginError(`Unsupported expression type: ${fieldAccess.$type}`);
        }

        if (!selector) {
            throw new PluginError(`Failed to write FieldAccess expression`);
        }

        if (operand) {
            // member access expression
            this.writeFieldCondition(
                operand,
                () => {
                    this.block(
                        () => {
                            this.writer.write(selector + ': ');
                            if (this.isModelTyped(fieldAccess)) {
                                // expression is resolved to a model, generate relation query
                                this.block(() => {
                                    this.writer.write(`${relationOp}: `);
                                    writeCondition();
                                });
                            } else {
                                // generate plain query
                                writeCondition();
                            }
                        },
                        // if operand is "this", it doesn't really generate a new layer of query,
                        // so we should avoid generating a new block
                        !isThisExpr(operand)
                    );
                },
                'is'
            );
        } else if (this.isModelTyped(fieldAccess)) {
            // reference resolved to a model, generate relation query
            this.writer.write(selector + ': ');
            this.block(() => {
                this.writer.write(`${relationOp}: `);
                writeCondition();
            });
        } else {
            // generate a plain query
            this.writer.write(selector + ': ');
            writeCondition();
        }
    }

    private block(write: () => void, condition = true) {
        if (condition) {
            this.writer.block(write);
        } else {
            write();
        }
    }

    private isModelTyped(expr: Expression) {
        return isDataModel(expr.$resolvedType?.decl);
    }

    private mapOperator(operator: '==' | '!=' | '>' | '>=' | '<' | '<=') {
        switch (operator) {
            case '==':
                return 'equals';
            case '!=':
                throw new Error('Operation != should have been compiled away');
            case '>':
                return 'gt';
            case '>=':
                return 'gte';
            case '<':
                return 'lt';
            case '<=':
                return 'lte';
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

    private writeLogical(expr: BinaryExpr, operator: '&&' | '||') {
        this.writer.writeLine(`${operator === '&&' ? 'AND' : 'OR'}: `);
        this.writeExprList([expr.left, expr.right]);
    }

    private writeUnary(expr: UnaryExpr) {
        if (expr.operator !== '!') {
            throw new PluginError(`Unary operator "${expr.operator}" is not supported`);
        }

        this.writer.writeLine('NOT: ');
        this.write(expr.operand);
    }

    private writeLiteral(expr: LiteralExpr) {
        this.guard(() => {
            this.plain(expr);
        });
    }
}
