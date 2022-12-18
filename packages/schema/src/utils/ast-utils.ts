import { DataModel, isDataModel, Model } from '@zenstackhq/language/ast';

export function extractDataModelsWithAllowRules(model: Model): DataModel[] {
    return model.declarations.filter(
        (d) =>
            isDataModel(d) &&
            !!d.attributes.find((attr) => attr.decl.ref?.name === '@@allow')
    ) as DataModel[];
}
