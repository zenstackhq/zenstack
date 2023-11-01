import { Model, isDataModel, isDataSource } from '@zenstackhq/language/ast';
import { hasAttribute } from '@zenstackhq/sdk';
import { LangiumDocuments, ValidationAcceptor } from 'langium';
import { getAllDeclarationsFromImports, resolveImport, resolveTransitiveImports } from '../../utils/ast-utils';
import { PLUGIN_MODULE_NAME, STD_LIB_MODULE_NAME } from '../constants';
import { AstValidator } from '../types';
import { validateDuplicatedDeclarations } from './utils';

/**
 * Validates toplevel schema.
 */
export default class SchemaValidator implements AstValidator<Model> {
    constructor(protected readonly documents: LangiumDocuments) {}
    validate(model: Model, accept: ValidationAcceptor): void {
        this.validateImports(model, accept);
        validateDuplicatedDeclarations(model.declarations, accept);

        const importedModels = resolveTransitiveImports(this.documents, model);

        const importedNames = new Set(importedModels.flatMap((m) => m.declarations.map((d) => d.name)));

        for (const declaration of model.declarations) {
            if (importedNames.has(declaration.name)) {
                accept('error', `A ${declaration.name} already exists in an imported module`, {
                    node: declaration,
                    property: 'name',
                });
            }
        }

        if (
            !model.$document?.uri.path.endsWith(STD_LIB_MODULE_NAME) &&
            !model.$document?.uri.path.endsWith(PLUGIN_MODULE_NAME)
        ) {
            this.validateDataSources(model, accept);
        }

        // at most one `@@auth` model
        const authModels = model.declarations.filter((d) => isDataModel(d) && hasAttribute(d, '@@auth'));
        if (authModels.length > 1) {
            accept('error', 'Multiple `@@auth` models are not allowed', { node: authModels[1] });
        }
    }

    private validateDataSources(model: Model, accept: ValidationAcceptor) {
        const dataSources = getAllDeclarationsFromImports(this.documents, model).filter((d) => isDataSource(d));
        if (dataSources.length > 1) {
            accept('error', 'Multiple datasource declarations are not allowed', { node: dataSources[1] });
        }
    }

    private validateImports(model: Model, accept: ValidationAcceptor) {
        model.imports.forEach((imp) => {
            const importedModel = resolveImport(this.documents, imp);
            if (!importedModel) {
                accept('error', `Cannot find model file ${imp.path}.zmodel`, { node: imp });
            }
        });
    }
}
