import {
    BinaryExpr,
    DataModel,
    Expression,
    InheritableNode,
    isBinaryExpr,
    isDataModel,
    isModel,
    Model,
    ModelImport,
} from '@zenstackhq/language/ast';
import {
    AstNode,
    CstNode,
    GenericAstNode,
    getContainerOfType,
    getDocument,
    isAstNode,
    isReference,
    LangiumDocuments,
    linkContentToContainer,
    Linker,
    Mutable,
    Reference,
} from 'langium';
import { URI, Utils } from 'vscode-uri';

export function extractDataModelsWithAllowRules(model: Model): DataModel[] {
    return model.declarations.filter(
        (d) => isDataModel(d) && d.attributes.some((attr) => attr.decl.ref?.name === '@@allow')
    ) as DataModel[];
}

type BuildReference = (
    node: AstNode,
    property: string,
    refNode: CstNode | undefined,
    refText: string
) => Reference<AstNode>;

export function mergeBaseModel(model: Model, linker: Linker) {
    const buildReference = linker.buildReference.bind(linker);

    model.declarations
        .filter((x) => x.$type === 'DataModel')
        .forEach((decl) => {
            const dataModel = decl as DataModel;

            dataModel.fields = dataModel.superTypes
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                .flatMap((superType) => superType.ref!.fields)
                .map((f) => cloneAst(f, dataModel, buildReference))
                .concat(dataModel.fields);

            dataModel.attributes = dataModel.superTypes
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                .flatMap((superType) => superType.ref!.attributes)
                .map((attr) => cloneAst(attr, dataModel, buildReference))
                .concat(dataModel.attributes);
        });

    // remove abstract models
    model.declarations = model.declarations.filter((x) => !(isDataModel(x) && x.isAbstract));
}

// deep clone an AST, relink references, and set its container
function cloneAst<T extends InheritableNode>(
    node: T,
    newContainer: AstNode,
    buildReference: BuildReference
): Mutable<T> {
    const clone = copyAstNode(node, buildReference) as Mutable<T>;
    clone.$container = newContainer;
    clone.$containerProperty = node.$containerProperty;
    clone.$containerIndex = node.$containerIndex;
    clone.$inheritedFrom = getContainerOfType(node, isDataModel);
    return clone;
}

// this function is copied from Langium's ast-utils, but copying $resolvedType as well
function copyAstNode<T extends AstNode = AstNode>(node: T, buildReference: BuildReference): T {
    const copy: GenericAstNode = { $type: node.$type, $resolvedType: node.$resolvedType };

    for (const [name, value] of Object.entries(node)) {
        if (!name.startsWith('$')) {
            if (isAstNode(value)) {
                copy[name] = copyAstNode(value, buildReference);
            } else if (isReference(value)) {
                copy[name] = buildReference(copy, name, value.$refNode, value.$refText);
            } else if (Array.isArray(value)) {
                const copiedArray: unknown[] = [];
                for (const element of value) {
                    if (isAstNode(element)) {
                        copiedArray.push(copyAstNode(element, buildReference));
                    } else if (isReference(element)) {
                        copiedArray.push(buildReference(copy, name, element.$refNode, element.$refText));
                    } else {
                        copiedArray.push(element);
                    }
                }
                copy[name] = copiedArray;
            } else {
                copy[name] = value;
            }
        }
    }

    linkContentToContainer(copy);
    return copy as unknown as T;
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
