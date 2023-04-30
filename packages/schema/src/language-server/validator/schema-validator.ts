import { PLUGIN_MODULE_NAME, STD_LIB_MODULE_NAME } from '../constants';
import { isDataSource, Model } from '@zenstackhq/language/ast';
import { AstValidator } from '../types';
import { LangiumDocuments, ValidationAcceptor } from 'langium';
import { validateDuplicatedDeclarations } from './utils';
import { getAllDeclarationsFromImports, resolveImport, resolveTransitiveImports } from '../../utils/ast-utils';

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
