import { Expression, isInvocationExpr } from '@zenstackhq/language/ast';
import { isFromStdlib } from '../../language-server/utils';

/**
 * Returns if the given expression is a "future()" method call.
 */
export function isFutureExpr(expr: Expression) {
    return !!(isInvocationExpr(expr) && expr.function.ref?.name === 'future' && isFromStdlib(expr.function.ref));
}
