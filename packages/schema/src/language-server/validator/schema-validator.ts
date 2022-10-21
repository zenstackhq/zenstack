import { isDataSource, Model } from '@lang/generated/ast';
import { AstValidator } from '@lang/types';
import { ValidationAcceptor } from 'langium';
import { validateDuplicatedDeclarations } from './utils';

export default class SchemaValidator implements AstValidator<Model> {
    validate(model: Model, accept: ValidationAcceptor): void {
        validateDuplicatedDeclarations(model.declarations, accept);
        this.validateDataSources(model, accept);
    }

    private validateDataSources(model: Model, accept: ValidationAcceptor) {
        const dataSources = model.declarations.filter((d) => isDataSource(d));
        if (dataSources.length === 0) {
            accept('error', 'Model must define a datasource', { node: model });
        } else if (dataSources.length > 1) {
            accept(
                'error',
                'Multiple datasource declarations are not allowed',
                { node: dataSources[1] }
            );
        }
    }
}
