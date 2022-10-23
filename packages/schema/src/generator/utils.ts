import { DataModel, isDataModel, Model } from '@lang/generated/ast';

export function extractDataModelsWithAllowRules(model: Model) {
    return model.declarations.filter(
        (d) =>
            isDataModel(d) &&
            !!d.attributes.find((attr) => attr.decl.ref?.name === '@@allow')
    ) as DataModel[];
}
