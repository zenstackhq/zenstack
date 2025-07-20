import {
    BinaryExpr,
    DataModel,
    DataModelAttribute,
    DataModelField,
    Expression,
    InheritableNode,
    isBinaryExpr,
    isDataModel,
    isDataModelField,
    isInvocationExpr,
    isModel,
    isReferenceExpr,
    isAliasDecl,
    isTypeDef,
    Model,
    ModelImport,
    AliasDecl,
    TypeDef,
} from '@zenstackhq/language/ast';
import {
    getAttribute,
    getInheritanceChain,
    getRecursiveBases,
    hasAttribute,
    isDelegateModel,
    isFromStdlib,
} from '@zenstackhq/sdk';
import {
    AstNode,
    copyAstNode,
    CstNode,
    getContainerOfType,
    getDocument,
    LangiumDocuments,
    linkContentToContainer,
    Linker,
    Mutable,
    Reference,
} from 'langium';
import path from 'node:path';
import { URI, Utils } from 'vscode-uri';
import { findNodeModulesFile } from './pkg-utils';

export function extractDataModelsWithAllowAliass(model: Model): DataModel[] {
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

export function mergeBaseModels(model: Model, linker: Linker) {
    const buildReference = linker.buildReference.bind(linker);

    model.declarations.filter(isDataModel).forEach((dataModel) => {
        const bases = getRecursiveBases(dataModel).reverse();
        if (bases.length > 0) {
            dataModel.fields = bases
                .flatMap((base) => base.fields)
                // don't inherit skip-level fields
                .filter((f) => !f.$inheritedFrom)
                .map((f) => cloneAst(f, dataModel, buildReference))
                .concat(dataModel.fields);

            dataModel.attributes = bases
                .flatMap((base) => base.attributes.filter((attr) => filterBaseAttribute(dataModel, base, attr)))
                .map((attr) => cloneAst(attr, dataModel, buildReference))
                .concat(dataModel.attributes);
        }

        // mark base merged
        dataModel.$baseMerged = true;
    });

    // remove abstract models
    model.declarations = model.declarations.filter((x) => !(isDataModel(x) && x.isAbstract));

    model.declarations.filter(isDataModel).forEach((dm) => {
        // remove abstract super types
        dm.superTypes = dm.superTypes.filter((t) => t.ref && isDelegateModel(t.ref));

        // fix $containerIndex
        linkContentToContainer(dm);
    });

    // fix $containerIndex after deleting abstract models
    linkContentToContainer(model);
}

function filterBaseAttribute(forModel: DataModel, base: DataModel, attr: DataModelAttribute) {
    if (attr.$inheritedFrom) {
        // don't inherit from skip-level base
        return false;
    }

    // uninheritable attributes for all inheritance
    const uninheritableAttributes = ['@@delegate', '@@map'];

    // uninheritable attributes for delegate inheritance (they reference fields from the base)
    const uninheritableFromDelegateAttributes = ['@@unique', '@@index', '@@fulltext'];

    // attributes that are inherited but can be overridden
    const overrideAttributes = ['@@schema'];

    if (uninheritableAttributes.includes(attr.decl.$refText)) {
        return false;
    }

    if (
        // checks if the inheritance is from a delegate model or through one, if so,
        // the attribute shouldn't be inherited as the delegate already inherits it
        isInheritedFromOrThroughDelegate(forModel, base) &&
        uninheritableFromDelegateAttributes.includes(attr.decl.$refText)
    ) {
        return false;
    }

    if (hasAttribute(forModel, attr.decl.$refText) && overrideAttributes.includes(attr.decl.$refText)) {
        // don't inherit an attribute if it's overridden in the sub model
        return false;
    }

    return true;
}

function isInheritedFromOrThroughDelegate(model: DataModel, base: DataModel) {
    if (isDelegateModel(base)) {
        return true;
    }
    const chain = getInheritanceChain(model, base);
    return !!chain?.some(isDelegateModel);
}

// deep clone an AST, relink references, and set its container
function cloneAst<T extends InheritableNode>(
    node: T,
    newContainer: AstNode,
    buildReference: BuildReference
): Mutable<T> {
    const clone = copyAstNode(node, buildReference) as Mutable<T>;
    clone.$container = newContainer;

    if (isDataModel(newContainer) && isDataModelField(node)) {
        // walk up the hierarchy to find the upper-most delegate ancestor that defines the field
        const delegateBases = getRecursiveBases(newContainer).filter(isDelegateModel);
        clone.$inheritedFrom = delegateBases.findLast((base) => base.fields.some((f) => f.name === node.name));
    }

    if (!clone.$inheritedFrom) {
        clone.$inheritedFrom = node.$inheritedFrom ?? getContainerOfType(node, isDataModel);
    }

    return clone;
}

export function isAuthInvocation(node: AstNode) {
    return isInvocationExpr(node) && node.function.ref?.name === 'auth' && isFromStdlib(node.function.ref);
}

export function isFutureInvocation(node: AstNode) {
    return isInvocationExpr(node) && node.function.ref?.name === 'future' && isFromStdlib(node.function.ref);
}

export function isCheckInvocation(node: AstNode) {
    return isInvocationExpr(node) && node.function.ref?.name === 'check' && isFromStdlib(node.function.ref);
}

export function isAliasInvocation(node: AstNode) {
    // check if a matching alias exists
    const allAlias = getContainerOfType(node, isModel)?.declarations.filter(isAliasDecl) ?? [];
    // const aliasDecls = getAllLoadedAlias(this.langiumDocuments());
    return isInvocationExpr(node) && allAlias.some((alias) => alias.name === node.function.$refText);
    // (!node.function.ref || !isFromStdlib(node.function.ref)) /*  && isAliasDecl(node.function.ref) */
}

export function resolveImportUri(imp: ModelImport): URI | undefined {
    if (!imp.path) return undefined; // This will return true if imp.path is undefined, null, or an empty string ("").

    if (!imp.path.endsWith('.zmodel')) {
        imp.path += '.zmodel';
    }

    if (
        !imp.path.startsWith('.') && // Respect relative paths
        !path.isAbsolute(imp.path) // Respect Absolute paths
    ) {
        // use the current model's path as the search context
        const contextPath = imp.$container.$document
            ? path.dirname(imp.$container.$document.uri.fsPath)
            : process.cwd();
        imp.path = findNodeModulesFile(imp.path, contextPath) ?? imp.path;
    }

    const dirUri = Utils.dirname(getDocument(imp).uri);
    return Utils.resolvePath(dirUri, imp.path);
}

export function resolveTransitiveImports(documents: LangiumDocuments, model: Model): Model[] {
    return resolveTransitiveImportsInternal(documents, model);
}

function resolveTransitiveImportsInternal(
    documents: LangiumDocuments,
    model: Model,
    initialModel = model,
    visited: Set<string> = new Set(),
    models: Set<Model> = new Set()
): Model[] {
    const doc = getDocument(model);
    const initialDoc = getDocument(initialModel);

    if (initialDoc.uri.fsPath.toLowerCase() !== doc.uri.fsPath.toLowerCase()) {
        models.add(model);
    }

    const normalizedPath = doc.uri.fsPath.toLowerCase();
    if (!visited.has(normalizedPath)) {
        visited.add(normalizedPath);
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

export function getAllDeclarationsIncludingImports(documents: LangiumDocuments, model: Model) {
    const imports = resolveTransitiveImports(documents, model);
    return model.declarations.concat(...imports.map((imp) => imp.declarations));
}

export function getAllDataModelsIncludingImports(documents: LangiumDocuments, model: Model) {
    return getAllDeclarationsIncludingImports(documents, model).filter(isDataModel);
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

/**
 * Walk upward from the current AST node to find the first node that satisfies the predicate.
 */
export function findUpAst(node: AstNode, predicate: (node: AstNode) => boolean): AstNode | undefined {
    let curr: AstNode | undefined = node;
    while (curr) {
        if (predicate(curr)) {
            return curr;
        }
        curr = curr.$container;
    }
    return undefined;
}

/**
 * Gets all data models and type defs from all loaded documents
 */
export function getAllLoadedDataModelsAndTypeDefs(langiumDocuments: LangiumDocuments) {
    return langiumDocuments.all
        .map((doc) => doc.parseResult.value as Model)
        .flatMap((model) => model.declarations.filter((d): d is DataModel | TypeDef => isDataModel(d) || isTypeDef(d)))
        .toArray();
}

/**
 * Gets all data models and type defs from loaded and reachable documents
 */
export function getAllLoadedAndReachableDataModelsAndTypeDefs(
    langiumDocuments: LangiumDocuments,
    fromModel?: DataModel
) {
    // get all data models from loaded documents
    const allDataModels = getAllLoadedDataModelsAndTypeDefs(langiumDocuments);

    if (fromModel) {
        // merge data models transitively reached from the current model
        const model = getContainerOfType(fromModel, isModel);
        if (model) {
            const transitiveDataModels = getAllDataModelsIncludingImports(langiumDocuments, model);
            transitiveDataModels.forEach((dm) => {
                if (!allDataModels.includes(dm)) {
                    allDataModels.push(dm);
                }
            });
        }
    }

    return allDataModels;
}

/**
 * Gets all data models and type defs from all loaded documents
 */
export function getAllLoadedAlias(langiumDocuments: LangiumDocuments) {
    return langiumDocuments.all
        .map((doc) => doc.parseResult.value as Model)
        .flatMap((model) => model.declarations.filter((d): d is AliasDecl => isAliasDecl(d)))
        .toArray();
}

/**
 * Walk up the inheritance chain to find the path from the start model to the target model
 */
export function findUpInheritance(start: DataModel, target: DataModel): DataModel[] | undefined {
    for (const base of start.superTypes) {
        if (base.ref === target) {
            return [base.ref];
        }
        const path = findUpInheritance(base.ref as DataModel, target);
        if (path) {
            return [base.ref as DataModel, ...path];
        }
    }
    return undefined;
}

/**
 * Gets all concrete models that inherit from the given delegate model
 */
export function getConcreteModels(dataModel: DataModel): DataModel[] {
    if (!isDelegateModel(dataModel)) {
        return [];
    }
    return dataModel.$container.declarations.filter(
        (d): d is DataModel => isDataModel(d) && d !== dataModel && d.superTypes.some((base) => base.ref === dataModel)
    );
}

/**
 * Gets the discriminator field for the given delegate model
 */
export function getDiscriminatorField(dataModel: DataModel) {
    const delegateAttr = getAttribute(dataModel, '@@delegate');
    if (!delegateAttr) {
        return undefined;
    }
    const arg = delegateAttr.args[0]?.value;
    return isReferenceExpr(arg) ? (arg.target.ref as DataModelField) : undefined;
}
