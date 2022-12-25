import {
    DataModel,
    DataModelAttribute,
    Model,
    isDataModel,
} from '@zenstackhq/language/ast';
import { getLiteral } from '@zenstackhq/sdk/utils';
import { ALL_OPERATION_KINDS } from '../plugins/constants';

export function extractDataModelsWithAllowRules(model: Model): DataModel[] {
    return model.declarations.filter(
        (d) =>
            isDataModel(d) &&
            !!d.attributes.find((attr) => attr.decl.ref?.name === '@@allow')
    ) as DataModel[];
}

export function analyzePolicies(dataModel: DataModel) {
    const allows = dataModel.attributes.filter(
        (attr) => attr.decl.ref?.name === '@@allow'
    );
    const denies = dataModel.attributes.filter(
        (attr) => attr.decl.ref?.name === '@@deny'
    );

    return {
        allows,
        denies,
        allowAll: allowAll(allows, denies),
        denyAll: denyAll(allows, denies),
    };
}

function allowAll(allows: DataModelAttribute[], denies: DataModelAttribute[]) {
    if (denies.length > 0) {
        return false;
    }
    return allows.some((attr) => allOpsTrue(attr));
}

function denyAll(allows: DataModelAttribute[], denies: DataModelAttribute[]) {
    return allows.length === 0 || denies.some((attr) => allOpsTrue(attr));
}

function allOpsTrue(attr: DataModelAttribute) {
    const ret = getLiteral<boolean>(attr.args[1].value);
    if (ret !== true) {
        return false;
    }
    const ops = getLiteral<string>(attr.args[0].value);
    if (ops === 'all') {
        return true;
    } else if (ops) {
        const splitOps = ops.split(',').map((p) => p.trim());
        return ALL_OPERATION_KINDS.every((op) => splitOps.includes(op));
    } else {
        return false;
    }
}
