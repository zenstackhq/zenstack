import {
    BinaryExpr,
    DataModel,
    Expression,
    InvocationExpr,
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
import { getLiteral, GUARD_FIELD_NAME, PluginError } from '@zenstackhq/sdk';
import { CodeBlockWriter } from 'ts-morph';
import { FILTER_OPERATOR_FUNCTIONS } from '../../language-server/constants';
import { getIdField, isAuthInvocation } from '../../utils/ast-utils';
import TypeScriptExpressionTransformer from './typescript-expression-transformer';
import { isFutureExpr } from './utils';

type ComparisonOperator = '==' | '!=' | '>' | '>=' | '<' | '<=';
type FilterOperators =
    | 'is'
    | 'some'
    | 'every'
    | 'none'
    | 'in'
    | 'contains'
    | 'search'
    | 'startsWith'
    | 'endsWith'
    | 'has'
    | 'hasEvery'
    | 'hasSome'
    | 'isEmpty';

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

            case InvocationExpr:
                this.writeInvocation(expr as InvocationExpr);
                break;

            default:
                throw new Error(`Not implemented: ${expr.$type}`);
        }
    }

    private writeReference(expr: ReferenceExpr) {
        if (isEnumField(expr.target.ref)) {
            throw new Error('We should never get here');
        } else {
            this.block(() => {
                this.writer.write(`${expr.target.ref?.name}: true`);
            });
        }
    }

    private writeMemberAccess(expr: MemberAccessExpr) {
        this.block(() => {
            // must be a boolean member
            this.writeFieldCondition(expr.operand, () => {
                this.block(() => {
                    this.writer.write(`${expr.member.ref?.name}: true`);
                });
            });
        });
    }

    private writeExprList(exprs: Expression[]) {
        this.writer.write('[');
        for (let i = 0; i < exprs.length; i++) {
            this.write(exprs[i]);
            if (i !== exprs.length - 1) {
                this.writer.write(',');
            }
        }
        this.writer.write(']');
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

            case 'in':
                this.writeIn(expr);
                break;

            case '?':
            case '!':
            case '^':
                this.writeCollectionPredicate(expr, expr.operator);
                break;
        }
    }

    private writeIn(expr: BinaryExpr) {
        this.block(() => {
            this.writeFieldCondition(
                expr.left,
                () => {
                    this.plain(expr.right);
                },
                'in'
            );
        });
    }

    private writeCollectionPredicate(expr: BinaryExpr, operator: string) {
        this.block(() => {
            this.writeFieldCondition(
                expr.left,
                () => {
                    this.write(expr.right);
                },
                operator === '?' ? 'some' : operator === '!' ? 'every' : 'none'
            );
        });
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
            this.block(() => {
                this.guard(() => {
                    this.plain(expr.left);
                    this.writer.write(' ' + operator + ' ');
                    this.plain(expr.right);
                });
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

        // if the operand refers to auth(), need to build a guard to avoid
        // using undefined user as filter (which means no filter to Prisma)
        // if auth() evaluates falsy, just treat the condition as false
        if (this.isAuthOrAuthMemberAccess(operand)) {
            this.writer.write(`!user ? { ${GUARD_FIELD_NAME}: false } : `);
        }

        this.block(() => {
            this.writeFieldCondition(fieldAccess, () => {
                this.block(
                    () => {
                        const dataModel = this.isModelTyped(fieldAccess);
                        if (dataModel) {
                            const idField = getIdField(dataModel);
                            if (!idField) {
                                throw new PluginError(`Data model ${dataModel.name} does not have an id field`);
                            }
                            // comparing with an object, convert to "id" comparison instead
                            this.writer.write(`${idField.name}: `);
                            this.block(() => {
                                this.writeOperator(operator, () => {
                                    // operand ? operand.field : null
                                    this.writer.write('(');
                                    this.plain(operand);
                                    this.writer.write(' ? ');
                                    this.plain(operand);
                                    this.writer.write(`.${idField.name}`);
                                    this.writer.write(' : null');
                                    this.writer.write(')');
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
            });
        });
    }

    private isAuthOrAuthMemberAccess(expr: Expression) {
        return isAuthInvocation(expr) || (isMemberAccessExpr(expr) && isAuthInvocation(expr.operand));
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
        filterOp?: FilterOperators,
        extraArgs?: Record<string, Expression>
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

        const writerFilterOutput = () => {
            this.writer.write(selector + ': ');
            if (filterOp) {
                this.block(() => {
                    this.writer.write(`${filterOp}: `);
                    writeCondition();

                    if (extraArgs) {
                        for (const [k, v] of Object.entries(extraArgs)) {
                            this.writer.write(`,\n${k}: `);
                            this.plain(v);
                        }
                    }
                });
            } else {
                writeCondition();
            }
        };

        if (operand) {
            // member access expression
            this.writeFieldCondition(operand, () => {
                this.block(
                    writerFilterOutput,
                    // if operand is "this", it doesn't really generate a new layer of query,
                    // so we should avoid generating a new block
                    !isThisExpr(operand)
                );
            });
        } else {
            writerFilterOutput();
        }
    }

    private block(write: () => void, condition = true) {
        if (condition) {
            this.writer.inlineBlock(write);
        } else {
            write();
        }
    }

    private isModelTyped(expr: Expression) {
        return isDataModel(expr.$resolvedType?.decl) ? (expr.$resolvedType?.decl as DataModel) : undefined;
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
        this.block(() => {
            this.writer.write(`${operator === '&&' ? 'AND' : 'OR'}: `);
            this.writeExprList([expr.left, expr.right]);
        });
    }

    private writeUnary(expr: UnaryExpr) {
        if (expr.operator !== '!') {
            throw new PluginError(`Unary operator "${expr.operator}" is not supported`);
        }

        this.block(() => {
            this.writer.write('NOT: ');
            this.write(expr.operand);
        });
    }

    private writeLiteral(expr: LiteralExpr) {
        this.block(() => {
            this.guard(() => {
                this.plain(expr);
            });
        });
    }

    private writeInvocation(expr: InvocationExpr) {
        const funcDecl = expr.function.ref;
        if (!funcDecl) {
            throw new PluginError(`Failed to resolve function declaration`);
        }

        if (FILTER_OPERATOR_FUNCTIONS.includes(funcDecl.name)) {
            let valueArg = expr.args[1]?.value;

            // isEmpty function is zero arity, it's mapped to a boolean literal
            if (funcDecl.name === 'isEmpty') {
                valueArg = { $type: LiteralExpr, value: true } as LiteralExpr;
            }

            // contains function has a 3rd argument that indicates whether the comparison should be case-insensitive
            let extraArgs: Record<string, Expression> | undefined = undefined;
            if (funcDecl.name === 'contains') {
                if (getLiteral<boolean>(expr.args[2]?.value) === true) {
                    extraArgs = { mode: { $type: LiteralExpr, value: 'insensitive' } as LiteralExpr };
                }
            }

            this.block(() => {
                this.writeFieldCondition(
                    expr.args[0].value,
                    () => {
                        this.plain(valueArg);
                    },
                    funcDecl.name as FilterOperators,
                    extraArgs
                );
            });
        } else {
            throw new PluginError(`Unsupported function ${funcDecl.name}`);
        }
    }
}
