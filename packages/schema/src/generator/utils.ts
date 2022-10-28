import { DataModel, isDataModel, Model } from '@lang/generated/ast';
import { AstNode, Reference } from 'langium';
import { GeneratorError } from './types';

export function extractDataModelsWithAllowRules(model: Model): DataModel[] {
    return model.declarations.filter(
        (d) =>
            isDataModel(d) &&
            !!d.attributes.find((attr) => attr.decl.ref?.name === '@@allow')
    ) as DataModel[];
}

export function resolved<T extends AstNode>(ref: Reference<T>): T {
    if (!ref.ref) {
        throw new GeneratorError(`Reference not resolved: ${ref.$refText}`);
    }
    return ref.ref;
}
