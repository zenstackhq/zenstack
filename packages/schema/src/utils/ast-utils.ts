import {
    DataModel,
    DataModelAttribute,
    Expression,
    isDataModel,
    isInvocationExpr,
    Model,
} from '@zenstackhq/language/ast';
import { PolicyOperationKind } from '@zenstackhq/runtime';
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

export function getIdField(dataModel: DataModel) {
    return dataModel.fields.find((f) => f.attributes.some((attr) => attr.decl.$refText === '@id'));
}

export function isAuthInvocation(expr: Expression) {
    return isInvocationExpr(expr) && expr.function.ref?.name === 'auth' && isFromStdlib(expr.function.ref);
}
