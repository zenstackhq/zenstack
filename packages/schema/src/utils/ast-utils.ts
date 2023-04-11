import {
    DataModel,
    DataModelField,
    Expression,
    isArrayExpr,
    isDataModelField,
    isEnumField,
    isInvocationExpr,
    isMemberAccessExpr,
    isReferenceExpr,
    ReferenceExpr,
} from '@zenstackhq/language/ast';
import { isFromStdlib } from '../language-server/utils';

export function getIdFields(dataModel: DataModel) {
    const fieldLevelId = dataModel.fields.find((f) => f.attributes.some((attr) => attr.decl.$refText === '@id'));
    if (fieldLevelId) {
        return [fieldLevelId];
    } else {
        // get model level @@id attribute
        const modelIdAttr = dataModel.attributes.find((attr) => attr.decl?.ref?.name === '@@id');
        if (modelIdAttr) {
            // get fields referenced in the attribute: @@id([field1, field2]])
            if (!isArrayExpr(modelIdAttr.args[0].value)) {
                return [];
            }
            const argValue = modelIdAttr.args[0].value;
            return argValue.items
                .filter((expr): expr is ReferenceExpr => isReferenceExpr(expr) && !!getDataModelFieldReference(expr))
                .map((expr) => expr.target.ref as DataModelField);
        }
    }
    return [];
}

export function isAuthInvocation(expr: Expression) {
    return isInvocationExpr(expr) && expr.function.ref?.name === 'auth' && isFromStdlib(expr.function.ref);
}

export function isEnumFieldReference(expr: Expression) {
    return isReferenceExpr(expr) && isEnumField(expr.target.ref);
}

export function getDataModelFieldReference(expr: Expression): DataModelField | undefined {
    if (isReferenceExpr(expr) && isDataModelField(expr.target.ref)) {
        return expr.target.ref;
    } else if (isMemberAccessExpr(expr) && isDataModelField(expr.member.ref)) {
        return expr.member.ref;
    } else {
        return undefined;
    }
}
