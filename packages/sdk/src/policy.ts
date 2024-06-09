import type { DataModel, DataModelAttribute } from './ast';
import { getLiteral } from './utils';
import { hasValidationAttributes } from './validation';

export type PolicyAnalysisResult = ReturnType<typeof analyzePolicies>;

export function analyzePolicies(dataModel: DataModel) {
    const allows = dataModel.attributes.filter((attr) => attr.decl.ref?.name === '@@allow');
    const denies = dataModel.attributes.filter((attr) => attr.decl.ref?.name === '@@deny');

    const create = toStaticPolicy('create', allows, denies);
    const read = toStaticPolicy('read', allows, denies);
    const update = toStaticPolicy('update', allows, denies);
    const del = toStaticPolicy('delete', allows, denies);
    const hasFieldValidation = hasValidationAttributes(dataModel);

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
    operation: string,
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

function forOperation(operation: string, rules: DataModelAttribute[]) {
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
