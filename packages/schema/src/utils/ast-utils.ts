import {
    BinaryExpr,
    DataModel,
    Expression,
    isBinaryExpr,
    isDataModel,
    isModel,
    Model,
    ModelImport,
} from '@zenstackhq/language/ast';
import { AstNode, getDocument, LangiumDocuments, Mutable } from 'langium';
import { URI, Utils } from 'vscode-uri';

export function extractDataModelsWithAllowRules(model: Model): DataModel[] {
    return model.declarations.filter(
        (d) => isDataModel(d) && d.attributes.some((attr) => attr.decl.ref?.name === '@@allow')
    ) as DataModel[];
}

export function mergeBaseModel(model: Model) {
    model.declarations
        .filter((x) => x.$type === 'DataModel')
        .forEach((decl) => {
            const dataModel = decl as DataModel;

            dataModel.fields = dataModel.superTypes
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                .flatMap((superType) => updateContainer(superType.ref!.fields, dataModel))
                .concat(dataModel.fields);

            dataModel.attributes = dataModel.superTypes
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                .flatMap((superType) => updateContainer(superType.ref!.attributes, dataModel))
                .concat(dataModel.attributes);
        });

    // remove abstract models
    model.declarations = model.declarations.filter((x) => !(x.$type == 'DataModel' && x.isAbstract));
}

function updateContainer<T extends AstNode>(nodes: T[], container: AstNode): Mutable<T>[] {
    return nodes.map((node) => {
        const cloneField = Object.assign({}, node);
        const mutable = cloneField as Mutable<T>;
        // update container
        mutable.$container = container;
        return mutable;
    });
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
            const importedModel = resolveImport(documents, imp);
            if (importedModel) {
                resolveTransitiveImportsInternal(documents, importedModel, initialModel, visited, models);
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

export function isCollectionPredicate(node: AstNode): node is BinaryExpr {
    return isBinaryExpr(node) && ['?', '!', '^'].includes(node.operator);
}

export function getContainingDataModel(node: Expression): DataModel | undefined {
    let curr: AstNode | undefined = node.$container;
    while (curr) {
        if (isDataModel(curr)) {
            return curr;
        }
        curr = curr.$container;
    }
    return undefined;
}
