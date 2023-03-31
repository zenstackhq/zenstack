import {
    DataModel,
    DataModelAttribute,
    DataModelField,
    Expression,
    isArrayExpr,
    isDataModel,
    isDataModelField,
    isEnumField,
    isInvocationExpr,
    isMemberAccessExpr,
    isReferenceExpr,
    Model,
    ReferenceExpr,
} from '@zenstackhq/language/ast';
import type { PolicyOperationKind } from '@zenstackhq/runtime';
import { getLiteral } from '@zenstackhq/sdk';
import { isFromStdlib } from '../language-server/utils';

export function extractDataModelsWithAllowRules(model: Model): DataModel[] {
    return model.declarations.filter(
        (d) => isDataModel(d) && d.attributes.some((attr) => attr.decl.ref?.name === '@@allow')
    ) as DataModel[];
}

export function analyzePolicies(dataModel: DataModel) {
    const allows = dataModel.attributes.filter((attr) => attr.decl.ref?.name === '@@allow');
    const denies = dataModel.attributes.filter((attr) => attr.decl.ref?.name === '@@deny');

    const create = toStaticPolicy('create', allows, denies);
    const read = toStaticPolicy('read', allows, denies);
    const update = toStaticPolicy('update', allows, denies);
    const del = toStaticPolicy('delete', allows, denies);
    const hasFieldValidation = dataModel.fields.some((field) =>
        field.attributes.some((attr) => VALIDATION_ATTRIBUTES.includes(attr.decl.$refText))
    );

    return {
        allows,
        denies,
        create,
        read,
        update,
        delete: del,
        allowAll: create === true && read === true && update === true && del === true,
        denyAll: create === false && read === false && update === false && del === false,
        hasFieldValidation,
    };
}

function toStaticPolicy(
    operation: PolicyOperationKind,
    allows: DataModelAttribute[],
    denies: DataModelAttribute[]
): boolean | undefined {
    const filteredDenies = forOperation(operation, denies);
    if (filteredDenies.some((rule) => getLiteral<boolean>(rule.args[1].value) === true)) {
        // any constant true deny rule
        return false;
    }

    const filteredAllows = forOperation(operation, allows);
    if (filteredAllows.length === 0) {
        // no allow rule
        return false;
    }

    if (
        filteredDenies.length === 0 &&
        filteredAllows.some((rule) => getLiteral<boolean>(rule.args[1].value) === true)
    ) {
        // any constant true allow rule
        return true;
    }
    return undefined;
}

function forOperation(operation: PolicyOperationKind, rules: DataModelAttribute[]) {
    return rules.filter((rule) => {
        const ops = getLiteral<string>(rule.args[0].value);
        if (!ops) {
            return false;
        }
        if (ops === 'all') {
            return true;
        }
        const splitOps = ops.split(',').map((p) => p.trim());
        return splitOps.includes(operation);
    });
}

export const VALIDATION_ATTRIBUTES = [
    '@length',
    '@regex',
    '@startsWith',
    '@endsWith',
    '@email',
    '@url',
    '@datetime',
    '@gt',
    '@gte',
    '@lt',
    '@lte',
];

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
