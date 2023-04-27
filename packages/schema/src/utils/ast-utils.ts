import {
    DataModel,
    DataModelField,
    Expression,
    isArrayExpr,
    isDataModelField,
    isEnumField,
    isInvocationExpr,
    isMemberAccessExpr,
    isModel,
    isReferenceExpr,
    Model,
    ModelImport,
    ReferenceExpr,
} from '@zenstackhq/language/ast';
import { getDocument, LangiumDocuments } from 'langium';
import { URI, Utils } from 'vscode-uri';
import { isFromStdlib } from '../language-server/utils';

export function getIdFields(dataModel: DataModel) {
    const fieldLevelId = dataModel.fields.find((f) => f.attributes.some((attr) => attr.decl.$refText === '@id'));
    if (fieldLevelId) {
        return [fieldLevelId];
    } else {
        // get model level @@id attribute
        const modelIdAttr = dataModel.attributes.find((attr) => attr.decl?.ref?.name === '@@id');
        if (modelIdAttr) {
            // get fields referenced in the attribute: @@id([field1, field2]])
            if (!isArrayExpr(modelIdAttr.args[0].value)) {
                return [];
            }
            const argValue = modelIdAttr.args[0].value;
            return argValue.items
                .filter((expr): expr is ReferenceExpr => isReferenceExpr(expr) && !!getDataModelFieldReference(expr))
                .map((expr) => expr.target.ref as DataModelField);
        }
    }
    return [];
}

export function isAuthInvocation(expr: Expression) {
    return isInvocationExpr(expr) && expr.function.ref?.name === 'auth' && isFromStdlib(expr.function.ref);
}

export function isEnumFieldReference(expr: Expression) {
    return isReferenceExpr(expr) && isEnumField(expr.target.ref);
}

export function getDataModelFieldReference(expr: Expression): DataModelField | undefined {
    if (isReferenceExpr(expr) && isDataModelField(expr.target.ref)) {
        return expr.target.ref;
    } else if (isMemberAccessExpr(expr) && isDataModelField(expr.member.ref)) {
        return expr.member.ref;
    } else {
        return undefined;
    }
}

export function resolveImportUri(imp: ModelImport): URI | undefined {
    if (imp.path === undefined || imp.path.length === 0) {
        return undefined;
    }
    const dirUri = Utils.dirname(getDocument(imp).uri);
    let grammarPath = imp.path;
    if (!grammarPath.endsWith('.zmodel')) {
        grammarPath += '.zmodel';
    }
    return Utils.resolvePath(dirUri, grammarPath);
}

export function resolveTransitiveImports(documents: LangiumDocuments, model: Model): Model[] {
    return resolveTransitiveImportsInternal(documents, model);
}

function resolveTransitiveImportsInternal(
    documents: LangiumDocuments,
    model: Model,
    initialModel = model,
    visited: Set<URI> = new Set(),
    models: Set<Model> = new Set()
): Model[] {
    const doc = getDocument(model);
    if (initialModel !== model) {
        models.add(model);
    }
    if (!visited.has(doc.uri)) {
        visited.add(doc.uri);
        for (const imp of model.imports) {
            const importedGrammar = resolveImport(documents, imp);
            if (importedGrammar) {
                resolveTransitiveImportsInternal(documents, importedGrammar, initialModel, visited, models);
            }
        }
    }
    return Array.from(models);
}

export function resolveImport(documents: LangiumDocuments, imp: ModelImport): Model | undefined {
    const resolvedUri = resolveImportUri(imp);
    try {
        if (resolvedUri) {
            const resolvedDocument = documents.getOrCreateDocument(resolvedUri);
            const node = resolvedDocument.parseResult.value;
            if (isModel(node)) {
                return node;
            }
        }
    } catch {
        // NOOP
    }
    return undefined;
}

export function getAllDeclarationsFromImports(documents: LangiumDocuments, model: Model) {
    const imports = resolveTransitiveImports(documents, model);
    return model.declarations.concat(...imports.map((imp) => imp.declarations));
}
