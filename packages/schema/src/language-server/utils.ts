import {
    isArrayExpr,
    isReferenceExpr,
    type DataModel,
    type DataModelField,
    type ReferenceExpr,
} from '@zenstackhq/language/ast';
import { resolved } from '@zenstackhq/sdk';

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
