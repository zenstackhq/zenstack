import { AstNode } from 'langium';
import { STD_LIB_MODULE_NAME } from './constants';
import { isModel, Model } from '@zenstackhq/language/ast';

/**
 * Gets the toplevel Model containing the given node.
 */
export function getContainingModel(node: AstNode | undefined): Model | null {
    if (!node) {
        return null;
    }
    return isModel(node) ? node : getContainingModel(node.$container);
}

/**
 * Returns if the given node is declared in stdlib.
 */
export function isFromStdlib(node: AstNode) {
    const model = getContainingModel(node);
    return !!model && !!model.$document && model.$document.uri.path.endsWith(STD_LIB_MODULE_NAME);
}
