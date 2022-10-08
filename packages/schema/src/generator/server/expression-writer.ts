import {
    BinaryExpr,
    Expression,
    isDataModel,
    isDataModelField,
    isMemberAccessExpr,
    isReferenceExpr,
    LiteralExpr,
    MemberAccessExpr,
    ReferenceExpr,
    ThisExpr,
    UnaryExpr,
} from '../../language-server/generated/ast';
import { CodeBlockWriter } from 'ts-morph';
import { GeneratorError } from '../types';
import { TypedNode } from '../../language-server/types';
import JsExpressionBuilder from './js-expression-builder';

const AUX_GUARD_FIELD = 'zenstack_guard';

type ComparisonOperator = '==' | '!=' | '>' | '>=' | '<' | '<=';

export default class ExpressionWriter {
    private readonly jsExpr = new JsExpressionBuilder();

    constructor(private readonly writer: CodeBlockWriter) {}

    write(expr: Expression) {
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

                case ThisExpr:
                    throw new Error('Not implemented');

                default:
                    throw new Error(`Not implemented: ${expr.$type}`);
            }
        };

        this.writer.block(_write);
    }

    private writeReference(expr: ReferenceExpr) {
        if (!isDataModelField(expr.target.ref)) {
            throw new GeneratorError('must be a field in current model');
        }
        this.writer.write(`${expr.target.ref.name}: true`);
    }

    private writeMemberAccess(expr: MemberAccessExpr) {
        this.write(expr.operand);
        this.writer.write('.' + expr.member.ref?.name);
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

    private plain(expr: Expression) {
        this.writer.write(this.jsExpr.build(expr));
    }

    private writeComparison(expr: BinaryExpr, operator: ComparisonOperator) {
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

        const type = (fieldAccess as TypedNode).$resolvedType?.decl;

        this.writeFieldCondition(
            fieldAccess,
            () => {
                this.writer.block(() => {
                    if (isDataModel(type)) {
                        // comparing with an object, conver to "id" comparison instead
                        this.writer.write('id: ');
                        this.writer.block(() => {
                            this.writeOperator(operator, () => {
                                this.plain(operand);
                                this.writer.write('.id');
                            });
                        });
                    } else {
                        this.writeOperator(operator, () => {
                            this.plain(operand);
                        });
                    }
                });
            },
            'is'
        );
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
        writeCondition: () => void,
        relationOp: 'is' | 'some' | 'every' | 'none'
    ) {
        let selector: string;
        let operand: Expression | undefined;

        if (isReferenceExpr(fieldAccess)) {
            selector = fieldAccess.target.ref?.name!;
        } else if (isMemberAccessExpr(fieldAccess)) {
            selector = fieldAccess.member.ref?.name!;
            operand = fieldAccess.operand;
        } else {
            throw new GeneratorError(
                `Unsupported expression type: ${fieldAccess.$type}`
            );
        }

        if (operand) {
            // member access expression
            this.writeFieldCondition(
                operand,
                () => {
                    this.writer.block(() => {
                        this.writer.write(selector + ': ');
                        if (this.isModelTyped(fieldAccess)) {
                            // expression is resolved to a model, generate relation query
                            this.writer.block(() => {
                                this.writer.write(`${relationOp}: `);
                                writeCondition();
                            });
                        } else {
                            // generate plain query
                            writeCondition();
                        }
                    });
                },
                'is'
            );
        } else if (this.isModelTyped(fieldAccess)) {
            // reference resolved to a model, generate relation query
            this.writer.write(selector + ': ');
            this.writer.block(() => {
                this.writer.write(`${relationOp}: `);
                writeCondition();
            });
        } else {
            // generate a plain query
            this.writer.write(selector + ': ');
            writeCondition();
        }
    }

    private isModelTyped(expr: Expression) {
        return isDataModel((expr as TypedNode).$resolvedType?.decl);
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

    private writeLogical(expr: BinaryExpr, operator: '&&' | '||') {
        this.writer.writeLine(`${operator === '&&' ? 'AND' : 'OR'}: `);
        this.writeExprList([expr.left, expr.right]);
    }

    private writeUnary(expr: UnaryExpr) {
        if (expr.operator !== '!') {
            throw new GeneratorError(
                `Unary operator "${expr.operator}" is not supported`
            );
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
