import {
    BuiltinType,
    Expression,
    ExpressionType,
    isDataModelField,
    isMemberAccessExpr,
    isStringLiteral,
} from '@zenstackhq/language/ast';
import { isAuthInvocation } from '@zenstackhq/sdk';
import { AstNode, ValidationAcceptor } from 'langium';

/**
 * Checks if the given declarations have duplicated names
 */
export function validateDuplicatedDeclarations(
    container: AstNode,
    decls: Array<AstNode & { name: string }>,
    accept: ValidationAcceptor
): void {
    const groupByName = decls.reduce<Record<string, Array<AstNode & { name: string }>>>((group, decl) => {
        group[decl.name] = group[decl.name] ?? [];
        group[decl.name].push(decl);
        return group;
    }, {});

    for (const [name, decls] of Object.entries<AstNode[]>(groupByName)) {
        if (decls.length > 1) {
            let errorField = decls[1];
            if (isDataModelField(decls[0])) {
                const nonInheritedFields = decls.filter((x) => !(isDataModelField(x) && x.$container !== container));
                if (nonInheritedFields.length > 0) {
                    errorField = nonInheritedFields.slice(-1)[0];
                }
            }

            accept('error', `Duplicated declaration name "${name}"`, {
                node: errorField,
            });
        }
    }
}

/**
 * Try getting string value from a potential string literal expression
 */
export function getStringLiteral(node: AstNode | undefined): string | undefined {
    return isStringLiteral(node) ? node.value : undefined;
}

const isoDateTimeRegex = /^\d{4}(-\d\d(-\d\d(T\d\d:\d\d(:\d\d)?(\.\d+)?(([+-]\d\d:\d\d)|Z)?)?)?)?$/i;

/**
 * Determines if the given sourceType is assignable to a destination of destType
 */
export function typeAssignable(destType: ExpressionType, sourceType: ExpressionType, sourceExpr?: Expression): boolean {
    // implicit conversion from ISO datetime string to datetime
    if (destType === 'DateTime' && sourceType === 'String' && sourceExpr && isStringLiteral(sourceExpr)) {
        const literal = getStringLiteral(sourceExpr);
        if (literal && isoDateTimeRegex.test(literal)) {
            // implicitly convert to DateTime
            sourceType = 'DateTime';
        }
    }

    switch (destType) {
        case 'Any':
            return true;
        case 'Float':
            return sourceType === 'Any' || sourceType === 'Int' || sourceType === 'Float';
        default:
            return sourceType === 'Any' || sourceType === destType;
    }
}

/**
 * Maps a ZModel builtin type to expression type
 */
export function mapBuiltinTypeToExpressionType(
    type: BuiltinType | 'Any' | 'Object' | 'Null' | 'Unsupported'
): ExpressionType | 'Any' {
    switch (type) {
        case 'Any':
        case 'Boolean':
        case 'String':
        case 'DateTime':
        case 'Int':
        case 'Float':
        case 'Null':
        case 'Object':
        case 'Unsupported':
            return type;
        case 'BigInt':
            return 'Int';
        case 'Decimal':
            return 'Float';
        case 'Json':
        case 'Bytes':
            return 'Any';
    }
}

export function isAuthOrAuthMemberAccess(expr: Expression): boolean {
    return isAuthInvocation(expr) || (isMemberAccessExpr(expr) && isAuthOrAuthMemberAccess(expr.operand));
}
