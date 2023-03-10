import { PLUGIN_MODULE_NAME, STD_LIB_MODULE_NAME } from '../constants';
import { isDataSource, Model } from '@zenstackhq/language/ast';
import { AstValidator } from '../types';
import { ValidationAcceptor } from 'langium';
import { validateDuplicatedDeclarations } from './utils';

/**
 * Validates toplevel schema.
 */
export default class SchemaValidator implements AstValidator<Model> {
    validate(model: Model, accept: ValidationAcceptor): void {
        validateDuplicatedDeclarations(model.declarations, accept);

        if (
            !model.$document?.uri.path.endsWith(STD_LIB_MODULE_NAME) &&
            !model.$document?.uri.path.endsWith(PLUGIN_MODULE_NAME)
        ) {
            this.validateDataSources(model, accept);
        }
    }

    private validateDataSources(model: Model, accept: ValidationAcceptor) {
        const dataSources = model.declarations.filter((d) => isDataSource(d));
        if (dataSources.length === 0) {
            accept('error', 'Model must define a datasource', { node: model });
        } else if (dataSources.length > 1) {
            accept('error', 'Multiple datasource declarations are not allowed', { node: dataSources[1] });
        }
    }
}
