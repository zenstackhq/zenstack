import {
    BinaryExpr,
    BooleanLiteral,
    DataModel,
    DataModelField,
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
    NumberLiteral,
    ReferenceExpr,
    ReferenceTarget,
    StringLiteral,
    UnaryExpr,
} from '@zenstackhq/language/ast';
import { DELEGATE_AUX_RELATION_PREFIX, PolicyOperationKind } from '@zenstackhq/runtime';
import {
    ExpressionContext,
    getFunctionExpressionContext,
    getIdFields,
    getLiteral,
    getQueryGuardFunctionName,
    isAuthInvocation,
    isDataModelFieldReference,
    isDelegateModel,
    isFromStdlib,
    isFutureExpr,
    PluginError,
    TypeScriptExpressionTransformer,
    TypeScriptExpressionTransformerError,
} from '@zenstackhq/sdk';
import { lowerCaseFirst } from 'lower-case-first';
import invariant from 'tiny-invariant';
import { CodeBlockWriter } from 'ts-morph';
import { name } from '..';
import { isCheckInvocation } from '../../../utils/ast-utils';

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

export type ExpressionWriterOptions = {
    isPostGuard?: boolean;
    operationContext: PolicyOperationKind;
};

/**
 * Utility for writing ZModel expression as Prisma query argument objects into a ts-morph writer
 */
export class ExpressionWriter {
    private readonly plainExprBuilder: TypeScriptExpressionTransformer;

    /**
     * Constructs a new ExpressionWriter
     */
    constructor(private readonly writer: CodeBlockWriter, private readonly options: ExpressionWriterOptions) {
        this.plainExprBuilder = new TypeScriptExpressionTransformer({
            context: ExpressionContext.AccessPolicy,
            isPostGuard: this.options.isPostGuard,
            // in post-guard context, `this` references pre-update value
            thisExprContext: this.options.isPostGuard ? 'context.preValue' : undefined,
            operationContext: this.options.operationContext,
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
                const ref = expr.target.ref;
                invariant(ref);
                if (this.isFieldReferenceToDelegateModel(ref)) {
                    const thisModel = ref.$container as DataModel;
                    const targetBase = ref.$inheritedFrom;
                    this.writeBaseHierarchy(thisModel, targetBase, () => this.writer.write(`${ref.name}: true`));
                } else {
                    this.writer.write(`${ref.name}: true`);
                }
            });
        }
    }

    private writeBaseHierarchy(thisModel: DataModel, targetBase: DataModel | undefined, conditionWriter: () => void) {
        if (!targetBase || thisModel === targetBase) {
            conditionWriter();
            return;
        }

        const base = this.getDelegateBase(thisModel);
        if (!base) {
            throw new PluginError(name, `Failed to resolve delegate base model for "${thisModel.name}"`);
        }

        this.writer.write(`${`${DELEGATE_AUX_RELATION_PREFIX}_${lowerCaseFirst(base.name)}`}: `);
        this.writer.block(() => {
            this.writeBaseHierarchy(base, targetBase, conditionWriter);
        });
    }

    private getDelegateBase(model: DataModel) {
        return model.superTypes.map((t) => t.ref).filter((t) => t && isDelegateModel(t))?.[0];
    }

    private isFieldReferenceToDelegateModel(ref: ReferenceTarget): ref is DataModelField {
        return isDataModelField(ref) && !!ref.$inheritedFrom && isDelegateModel(ref.$inheritedFrom);
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
        // check if the operand should be compiled to a relation query
        // or a plain expression
        const compileToRelationQuery =
            // expression rooted to `auth()` is always compiled to plain expression
            !this.isAuthOrAuthMemberAccess(expr.left) &&
            // `future()` in post-update context
            ((this.options.isPostGuard && this.isFutureMemberAccess(expr.left)) ||
                // non-`future()` in pre-update context
                (!this.options.isPostGuard && !this.isFutureMemberAccess(expr.left)));

        if (compileToRelationQuery) {
            this.block(() => {
                this.writeFieldCondition(
                    expr.left,
                    () => {
                        // inner scope of collection expression is always compiled as non-post-guard
                        const innerWriter = new ExpressionWriter(this.writer, {
                            isPostGuard: false,
                            operationContext: this.options.operationContext,
                        });
                        innerWriter.write(expr.right);
                    },
                    operator === '?' ? 'some' : operator === '!' ? 'every' : 'none'
                );
            });
        } else {
            const plain = this.plainExprBuilder.transform(expr);
            this.writer.write(`${plain} ? ${TRUE} : ${FALSE}`);
        }
    }

    private isFieldAccess(expr: Expression): boolean {
        if (isThisExpr(expr)) {
            return true;
        }

        if (isMemberAccessExpr(expr)) {
            if (isFutureExpr(expr.operand) && this.options.isPostGuard) {
                // when writing for post-update, future().field.x is a field access
                return true;
            } else {
                return this.isFieldAccess(expr.operand);
            }
        }
        if (isDataModelFieldReference(expr) && !this.options.isPostGuard) {
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

    private writeIdFieldsCheck(model: DataModel, value: Expression) {
        const idFields = this.requireIdFields(model);
        idFields.forEach((idField, idx) => {
            // eg: id: user.id
            this.writer.write(`${idField.name}:`);
            this.plain(value);
            this.writer.write(`.${idField.name}`);
            if (idx !== idFields.length - 1) {
                this.writer.write(',');
            }
        });
    }

    private writeComparison(expr: BinaryExpr, operator: ComparisonOperator) {
        const leftIsFieldAccess = this.isFieldAccess(expr.left);
        const rightIsFieldAccess = this.isFieldAccess(expr.right);

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

        if (this.isFutureMemberAccess(fieldAccess)) {
            // future().field should be treated as the "field" directly, so we
            // strip 'future().' and synthesize a reference expr
            fieldAccess = {
                $type: ReferenceExpr,
                $container: fieldAccess.$container,
                target: fieldAccess.member,
                $resolvedType: fieldAccess.$resolvedType,
                $future: true,
            } as unknown as ReferenceExpr;
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
                                if (isThisExpr(fieldAccess) && operator === '!=') {
                                    // negate
                                    this.writer.writeLine('isNot:');
                                    this.block(() => this.writeIdFieldsCheck(dataModel, operand));
                                } else {
                                    this.writeIdFieldsCheck(dataModel, operand);
                                }
                            });
                        } else {
                            if (this.equivalentRefs(fieldAccess, operand)) {
                                // f == f or f != f
                                // this == this or this != this
                                this.writer.write(operator === '!=' ? TRUE : FALSE);
                            } else {
                                this.writeOperator(operator, fieldAccess, () => {
                                    if (isDataModelFieldReference(operand) && !this.options.isPostGuard) {
                                        // if operand is a field reference and we're not generating for post-update guard,
                                        // we should generate a field reference (comparing fields in the same model)
                                        this.writeFieldReference(operand);
                                    } else {
                                        if (dataModel && this.isModelTyped(operand)) {
                                            // the comparison is between model types, generate id fields comparison block
                                            this.block(() => this.writeIdFieldsCheck(dataModel, operand));
                                        } else {
                                            // scalar value, just generate the plain expression
                                            this.plain(operand);
                                        }
                                    }
                                });
                            }
                        }
                    }, !isThisExpr(fieldAccess));
                });
            },
            // "this" expression is compiled away (to .id access), so we should
            // avoid generating a new layer
            !isThisExpr(fieldAccess)
        );
    }

    private isFutureMemberAccess(expr: Expression): expr is MemberAccessExpr {
        if (!isMemberAccessExpr(expr)) {
            return false;
        }

        if (isFutureExpr(expr.operand)) {
            return true;
        }

        return this.isFutureMemberAccess(expr.operand);
    }

    private requireIdFields(dataModel: DataModel) {
        const idFields = getIdFields(dataModel);
        if (!idFields || idFields.length === 0) {
            throw new PluginError(name, `Data model ${dataModel.name} does not have an id field`);
        }
        return idFields;
    }

    private equivalentRefs(expr1: Expression, expr2: Expression) {
        if (isThisExpr(expr1) && isThisExpr(expr2)) {
            return true;
        }

        if (
            isReferenceExpr(expr1) &&
            isReferenceExpr(expr2) &&
            expr1.target.ref === expr2.target.ref &&
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (expr1 as any).$future === (expr2 as any).$future // either both future or both not
        ) {
            return true;
        }

        return false;
    }

    // https://www.prisma.io/docs/reference/api-reference/prisma-client-reference#compare-columns-in-the-same-table
    private writeFieldReference(expr: ReferenceExpr) {
        if (!expr.target.ref) {
            throw new PluginError(name, `Unresolved reference "${expr.target.$refText}"`);
        }
        const containingModel = expr.target.ref.$container;
        this.writer.write(`db.${lowerCaseFirst(containingModel.name)}.fields.${expr.target.ref.name}`);
    }

    private isAuthOrAuthMemberAccess(expr: Expression): boolean {
        // recursive check for auth().x.y.z
        return isAuthInvocation(expr) || (isMemberAccessExpr(expr) && this.isAuthOrAuthMemberAccess(expr.operand));
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
        // let selector: string | undefined;
        let operand: Expression | undefined;
        let fieldWriter: ((conditionWriter: () => void) => void) | undefined;

        if (isThisExpr(fieldAccess)) {
            // pass on
            writeCondition();
            return;
        } else if (isReferenceExpr(fieldAccess)) {
            const ref = fieldAccess.target.ref;
            invariant(ref);
            if (this.isFieldReferenceToDelegateModel(ref)) {
                const thisModel = ref.$container as DataModel;
                const targetBase = ref.$inheritedFrom;
                fieldWriter = (conditionWriter: () => void) =>
                    this.writeBaseHierarchy(thisModel, targetBase, () => {
                        this.writer.write(`${ref.name}: `);
                        conditionWriter();
                    });
            } else {
                fieldWriter = (conditionWriter: () => void) => {
                    this.writer.write(`${ref.name}: `);
                    conditionWriter();
                };
            }
        } else if (isMemberAccessExpr(fieldAccess)) {
            if (!isFutureExpr(fieldAccess.operand)) {
                // future().field should be treated as the "field"
                operand = fieldAccess.operand;
            }
            fieldWriter = (conditionWriter: () => void) => {
                this.writer.write(`${fieldAccess.member.ref?.name}: `);
                conditionWriter();
            };
        } else {
            throw new PluginError(name, `Unsupported expression type: ${fieldAccess.$type}`);
        }

        if (!fieldWriter) {
            throw new PluginError(name, `Failed to write FieldAccess expression`);
        }

        const writerFilterOutput = () => {
            // this.writer.write(selector + ': ');
            fieldWriter!(() => {
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
            });
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
            if (isCheckInvocation(expr)) {
                this.writeRelationCheck(expr);
                return;
            }

            if (!expr.args.some((arg) => this.isFieldAccess(arg.value))) {
                // filter functions without referencing fields
                this.guard(() => this.plain(expr));
                return;
            }

            let valueArg = expr.args[1]?.value;

            // isEmpty function is zero arity, it's mapped to a boolean literal
            if (isFromStdlib(funcDecl) && funcDecl.name === 'isEmpty') {
                valueArg = { $type: BooleanLiteral, value: true } as LiteralExpr;
            }

            // contains function has a 3rd argument that indicates whether the comparison should be case-insensitive
            let extraArgs: Record<string, Expression> | undefined = undefined;
            if (isFromStdlib(funcDecl) && funcDecl.name === 'contains') {
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

    private writeRelationCheck(expr: InvocationExpr) {
        if (!isDataModelFieldReference(expr.args[0].value)) {
            throw new PluginError(name, `First argument of check() must be a field`);
        }
        if (!isDataModel(expr.args[0].value.$resolvedType?.decl)) {
            throw new PluginError(name, `First argument of check() must be a relation field`);
        }

        const fieldRef = expr.args[0].value;
        const targetModel = fieldRef.$resolvedType?.decl as DataModel;

        let operation: string;
        if (expr.args[1]) {
            const literal = getLiteral<string>(expr.args[1].value);
            if (!literal) {
                throw new TypeScriptExpressionTransformerError(`Second argument of check() must be a string literal`);
            }
            if (!['read', 'create', 'update', 'delete'].includes(literal)) {
                throw new TypeScriptExpressionTransformerError(`Invalid check() operation "${literal}"`);
            }
            operation = literal;
        } else {
            if (!this.options.operationContext) {
                throw new TypeScriptExpressionTransformerError('Unable to determine CRUD operation from context');
            }
            operation = this.options.operationContext;
        }

        this.block(() => {
            const targetGuardFunc = getQueryGuardFunctionName(targetModel, undefined, false, operation);
            this.writer.write(`${fieldRef.target.$refText}: ${targetGuardFunc}(context, db)`);
        });
    }
}
