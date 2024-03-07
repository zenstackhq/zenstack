import { isAuthInvocation } from '@zenstackhq/sdk';
import type { DataModelFieldAttribute } from '@zenstackhq/sdk/ast';
import { streamAst } from 'langium';

/**
 * Check if the given field attribute is a `@default` with `auth()` invocation
 */
export function isDefaultWithAuth(attr: DataModelFieldAttribute) {
    if (attr.decl.ref?.name !== '@default') {
        return false;
    }

    const expr = attr.args[0]?.value;
    if (!expr) {
        return false;
    }

    // find `auth()` in default value expression
    return streamAst(expr).some(isAuthInvocation);
}
