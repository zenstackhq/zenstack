import {
    DataModel,
    DataModelField,
    isArrayExpr,
    isModel,
    isReferenceExpr,
    Model,
    ReferenceExpr,
} from '@zenstackhq/language/ast';
import { resolved } from '@zenstackhq/sdk';
import { AstNode } from 'langium';
import { STD_LIB_MODULE_NAME } from './constants';

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

/**
 * Gets lists of unique fields declared at the data model level
 */
export function getUniqueFields(model: DataModel) {
    const uniqueAttrs = model.attributes.filter(
        (attr) => attr.decl.ref?.name === '@@unique' || attr.decl.ref?.name === '@@id'
    );
    return uniqueAttrs.map((uniqueAttr) => {
        const fieldsArg = uniqueAttr.args.find((a) => a.$resolvedParam?.name === 'fields');
        if (!fieldsArg || !isArrayExpr(fieldsArg.value)) {
            return [];
        }

        return fieldsArg.value.items
            .filter((item): item is ReferenceExpr => isReferenceExpr(item))
            .map((item) => resolved(item.target) as DataModelField);
    });
}
