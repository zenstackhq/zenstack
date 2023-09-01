import {
    BinaryExpr,
    BooleanLiteral,
    DataModel,
    Expression,
    InvocationExpr,
    isDataModel,
    isEnumField,
    isMemberAccessExpr,
    isReferenceExpr,
    isThisExpr,
    LiteralExpr,
    MemberAccessExpr,
    NumberLiteral,
    ReferenceExpr,
    StringLiteral,
    UnaryExpr,
} from '@zenstackhq/language/ast';
import {
    ExpressionContext,
    getFunctionExpressionContext,
    getLiteral,
    isDataModelFieldReference,
    isFutureExpr,
    PluginError,
} from '@zenstackhq/sdk';
import { lowerCaseFirst } from 'lower-case-first';
import { CodeBlockWriter } from 'ts-morph';
import { name } from '.';
import { getIdFields, isAuthInvocation } from '../../utils/ast-utils';
import {
    TypeScriptExpressionTransformer,
    TypeScriptExpressionTransformerError,
} from '../../utils/typescript-expression-transformer';

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

// { OR: [] } filters to nothing, { AND: [] } includes everything
// https://www.prisma.io/docs/concepts/components/prisma-client/null-and-undefined#the-effect-of-null-and-undefined-on-conditionals
export const TRUE = '{ AND: [] }';
export const FALSE = '{ OR: [] }';

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
        this.plainExprBuilder = new TypeScriptExpressionTransformer({
            context: ExpressionContext.AccessPolicy,
            isPostGuard: this.isPostGuard,
        });
    }

    /**
     * Writes the given ZModel expression.
     */
    write(expr: Expression): void {
        switch (expr.$type) {
            case StringLiteral:
            case NumberLiteral:
            case BooleanLiteral:
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
        if (this.isAuthOrAuthMemberAccess(expr)) {
            // member access of `auth()`, generate plain expression
            this.guard(() => this.plain(expr), true);
        } else {
            this.block(() => {
                // must be a boolean member
                this.writeFieldCondition(expr.operand, () => {
                    this.block(() => {
                        this.writer.write(`${expr.member.ref?.name}: true`);
                    });
                });
            });
        }
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
        const leftIsFieldAccess = this.isFieldAccess(expr.left);
        const rightIsFieldAccess = this.isFieldAccess(expr.right);

        if (!leftIsFieldAccess && !rightIsFieldAccess) {
            // 'in' without referencing fields
            this.guard(() => this.plain(expr));
        } else {
            this.block(() => {
                if (leftIsFieldAccess && !rightIsFieldAccess) {
                    // 'in' with left referencing a field, right is an array literal
                    this.writeFieldCondition(
                        expr.left,
                        () => {
                            this.plain(expr.right);
                        },
                        'in'
                    );
                } else if (!leftIsFieldAccess && rightIsFieldAccess) {
                    // 'in' with right referencing an array field, left is a literal
                    // transform it into a 'has' filter
                    this.writeFieldCondition(
                        expr.right,
                        () => {
                            this.plain(expr.left);
                        },
                        'has'
                    );
                } else if (
                    isDataModelFieldReference(expr.left) &&
                    isDataModelFieldReference(expr.right) &&
                    expr.left.target.ref?.$container === expr.right.target.ref?.$container
                ) {
                    // comparing two fields of the same model
                    this.writeFieldCondition(
                        expr.left,
                        () => {
                            this.writeFieldReference(expr.right as ReferenceExpr);
                        },
                        'in'
                    );
                } else {
                    throw new PluginError(name, '"in" operator cannot be used with field references on both sides');
                }
            });
        }
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
        if (isDataModelFieldReference(expr) && !this.isPostGuard) {
            return true;
        }
        return false;
    }

    private guard(condition: () => void, cast = false) {
        if (cast) {
            this.writer.write('!!');
            condition();
        } else {
            condition();
        }
        this.writer.write(` ? ${TRUE} : ${FALSE}`);
    }

    private plain(expr: Expression) {
        try {
            this.writer.write(this.plainExprBuilder.transform(expr));
        } catch (err) {
            if (err instanceof TypeScriptExpressionTransformerError) {
                throw new PluginError(name, err.message);
            } else {
                throw err;
            }
        }
    }

    private writeComparison(expr: BinaryExpr, operator: ComparisonOperator) {
        const leftIsFieldAccess = this.isFieldAccess(expr.left);
        const rightIsFieldAccess = this.isFieldAccess(expr.right);

        if (leftIsFieldAccess && rightIsFieldAccess) {
            if (
                isDataModelFieldReference(expr.left) &&
                isDataModelFieldReference(expr.right) &&
                expr.left.target.ref?.$container === expr.right.target.ref?.$container
            ) {
                // comparing fields from the same model
            } else {
                throw new PluginError(name, `Comparing fields from different models is not supported`);
            }
        }

        if (!leftIsFieldAccess && !rightIsFieldAccess) {
            // compile down to a plain expression
            this.guard(() => {
                this.plain(expr);
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

        // guard member access of `auth()` with null check
        if (this.isAuthOrAuthMemberAccess(operand) && !fieldAccess.$resolvedType?.nullable) {
            try {
                this.writer.write(
                    `(${this.plainExprBuilder.transform(operand)} == null) ? ${
                        // auth().x != user.x is true when auth().x is null and user is not nullable
                        // other expressions are evaluated to false when null is involved
                        operator === '!=' ? TRUE : FALSE
                    } : `
                );
            } catch (err) {
                if (err instanceof TypeScriptExpressionTransformerError) {
                    throw new PluginError(name, err.message);
                } else {
                    throw err;
                }
            }
        }

        this.block(
            () => {
                this.writeFieldCondition(fieldAccess, () => {
                    this.block(() => {
                        const dataModel = this.isModelTyped(fieldAccess);
                        if (dataModel && isAuthInvocation(operand)) {
                            // right now this branch only serves comparison with `auth`, like
                            //     @@allow('all', owner == auth())

                            const idFields = getIdFields(dataModel);
                            if (!idFields || idFields.length === 0) {
                                throw new PluginError(name, `Data model ${dataModel.name} does not have an id field`);
                            }

                            if (operator !== '==' && operator !== '!=') {
                                throw new PluginError(name, 'Only == and != operators are allowed');
                            }

                            if (!isThisExpr(fieldAccess)) {
                                this.writer.writeLine(operator === '==' ? 'is:' : 'isNot:');
                                const fieldIsNullable = !!fieldAccess.$resolvedType?.nullable;
                                if (fieldIsNullable) {
                                    // if field is nullable, we can generate "null" check condition
                                    this.writer.write(`(user == null) ? null : `);
                                }
                            }

                            this.block(() => {
                                idFields.forEach((idField, idx) => {
                                    const writeIdsCheck = () => {
                                        // id: user.id
                                        this.writer.write(`${idField.name}:`);
                                        this.plain(operand);
                                        this.writer.write(`.${idField.name}`);
                                        if (idx !== idFields.length - 1) {
                                            this.writer.write(',');
                                        }
                                    };

                                    if (isThisExpr(fieldAccess) && operator === '!=') {
                                        // wrap a not
                                        this.writer.writeLine('NOT:');
                                        this.block(() => writeIdsCheck());
                                    } else {
                                        writeIdsCheck();
                                    }
                                });
                            });
                        } else {
                            this.writeOperator(operator, fieldAccess, () => {
                                if (isDataModelFieldReference(operand) && !this.isPostGuard) {
                                    // if operand is a field reference and we're not generating for post-update guard,
                                    // we should generate a field reference (comparing fields in the same model)
                                    this.writeFieldReference(operand);
                                } else {
                                    this.plain(operand);
                                }
                            });
                        }
                    }, !isThisExpr(fieldAccess));
                });
            },
            // "this" expression is compiled away (to .id access), so we should
            // avoid generating a new layer
            !isThisExpr(fieldAccess)
        );
    }

    // https://www.prisma.io/docs/reference/api-reference/prisma-client-reference#compare-columns-in-the-same-table
    private writeFieldReference(expr: ReferenceExpr) {
        if (!expr.target.ref) {
            throw new PluginError(name, `Unresolved reference "${expr.target.$refText}"`);
        }
        const containingModel = expr.target.ref.$container;
        this.writer.write(`db.${lowerCaseFirst(containingModel.name)}.fields.${expr.target.ref.name}`);
    }

    private isAuthOrAuthMemberAccess(expr: Expression) {
        return isAuthInvocation(expr) || (isMemberAccessExpr(expr) && isAuthInvocation(expr.operand));
    }

    private writeOperator(operator: ComparisonOperator, fieldAccess: Expression, writeOperand: () => void) {
        if (isDataModel(fieldAccess.$resolvedType?.decl)) {
            if (operator === '==') {
                this.writer.write('is: ');
            } else if (operator === '!=') {
                this.writer.write('isNot: ');
            } else {
                throw new PluginError(name, 'Only == and != operators are allowed for data model comparison');
            }
            writeOperand();
        } else {
            if (operator === '!=') {
                // wrap a 'not'
                this.writer.write('not: ');
                this.block(() => {
                    this.writer.write(`${this.mapOperator('==')}: `);
                    writeOperand();
                });
            } else {
                this.writer.write(`${this.mapOperator(operator)}: `);
                writeOperand();
            }
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
            throw new PluginError(name, `Unsupported expression type: ${fieldAccess.$type}`);
        }

        if (!selector) {
            throw new PluginError(name, `Failed to write FieldAccess expression`);
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
        // TODO: do we need short-circuit for logical operators?

        if (operator === '&&') {
            // // && short-circuit: left && right -> left ? right : FALSE
            // if (!this.hasFieldAccess(expr.left)) {
            //     this.plain(expr.left);
            //     this.writer.write(' ? ');
            //     this.write(expr.right);
            //     this.writer.write(' : ');
            //     this.block(() => this.guard(() => this.writer.write('false')));
            // } else {
            this.block(() => {
                this.writer.write('AND:');
                this.writeExprList([expr.left, expr.right]);
            });
            // }
        } else {
            // // || short-circuit: left || right -> left ? TRUE : right
            // if (!this.hasFieldAccess(expr.left)) {
            //     this.plain(expr.left);
            //     this.writer.write(' ? ');
            //     this.block(() => this.guard(() => this.writer.write('true')));
            //     this.writer.write(' : ');
            //     this.write(expr.right);
            // } else {
            this.block(() => {
                this.writer.write('OR:');
                this.writeExprList([expr.left, expr.right]);
            });
            // }
        }
    }

    private writeUnary(expr: UnaryExpr) {
        if (expr.operator !== '!') {
            throw new PluginError(name, `Unary operator "${expr.operator}" is not supported`);
        }

        this.block(() => {
            this.writer.write('NOT: ');
            this.write(expr.operand);
        });
    }

    private writeLiteral(expr: LiteralExpr) {
        if (expr.value === true) {
            this.writer.write(TRUE);
        } else if (expr.value === false) {
            this.writer.write(FALSE);
        } else {
            this.guard(() => {
                this.plain(expr);
            });
        }
    }

    private writeInvocation(expr: InvocationExpr) {
        const funcDecl = expr.function.ref;
        if (!funcDecl) {
            throw new PluginError(name, `Failed to resolve function declaration`);
        }

        const functionAllowedContext = getFunctionExpressionContext(funcDecl);
        if (
            functionAllowedContext.includes(ExpressionContext.AccessPolicy) ||
            functionAllowedContext.includes(ExpressionContext.ValidationRule)
        ) {
            if (!expr.args.some((arg) => this.isFieldAccess(arg.value))) {
                // filter functions without referencing fields
                this.guard(() => this.plain(expr));
                return;
            }

            let valueArg = expr.args[1]?.value;

            // isEmpty function is zero arity, it's mapped to a boolean literal
            if (funcDecl.name === 'isEmpty') {
                valueArg = { $type: BooleanLiteral, value: true } as LiteralExpr;
            }

            // contains function has a 3rd argument that indicates whether the comparison should be case-insensitive
            let extraArgs: Record<string, Expression> | undefined = undefined;
            if (funcDecl.name === 'contains') {
                if (getLiteral<boolean>(expr.args[2]?.value) === true) {
                    extraArgs = { mode: { $type: StringLiteral, value: 'insensitive' } as LiteralExpr };
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
            throw new PluginError(name, `Unsupported function ${funcDecl.name}`);
        }
    }
}
