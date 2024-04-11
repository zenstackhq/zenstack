import type { DMMF } from '../types';
import { addMissingInputObjectTypesForAggregate } from './aggregate-helpers';
import { addMissingInputObjectTypesForInclude } from './include-helpers';
import { addMissingInputObjectTypesForModelArgs } from './modelArgs-helpers';
import { addMissingInputObjectTypesForSelect } from './select-helpers';

export function addMissingInputObjectTypes(
    inputObjectTypes: DMMF.InputType[],
    outputObjectTypes: DMMF.OutputType[],
    models: DMMF.Model[]
) {
    addMissingInputObjectTypesForAggregate(inputObjectTypes, outputObjectTypes);
    addMissingInputObjectTypesForSelect(inputObjectTypes, outputObjectTypes, models);
    addMissingInputObjectTypesForModelArgs(inputObjectTypes, models);
    addMissingInputObjectTypesForInclude(inputObjectTypes, models);
}
