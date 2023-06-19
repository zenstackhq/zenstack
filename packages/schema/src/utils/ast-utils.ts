import {
    DataModel,
    DataModelAttribute,
    DataModelField,
    Expression,
    isArrayExpr,
    isDataModel,
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
import { PolicyOperationKind } from '@zenstackhq/runtime';
import { getLiteral } from '@zenstackhq/sdk';
import { AstNode, getDocument, LangiumDocuments, Mutable } from 'langium';
import { URI, Utils } from 'vscode-uri';
import { isFromStdlib } from '../language-server/utils';

export function extractDataModelsWithAllowRules(model: Model): DataModel[] {
    return model.declarations.filter(
        (d) => isDataModel(d) && d.attributes.some((attr) => attr.decl.ref?.name === '@@allow')
    ) as DataModel[];
}

export function analyzePolicies(dataModel: DataModel) {
    const allows = dataModel.attributes.filter((attr) => attr.decl.ref?.name === '@@allow');
    const denies = dataModel.attributes.filter((attr) => attr.decl.ref?.name === '@@deny');

    const create = toStaticPolicy('create', allows, denies);
    const read = toStaticPolicy('read', allows, denies);
    const update = toStaticPolicy('update', allows, denies);
    const del = toStaticPolicy('delete', allows, denies);
    const hasFieldValidation = dataModel.$resolvedFields.some((field) =>
        field.attributes.some((attr) => VALIDATION_ATTRIBUTES.includes(attr.decl.$refText))
    );

    return {
        allows,
        denies,
        create,
        read,
        update,
        delete: del,
        allowAll: create === true && read === true && update === true && del === true,
        denyAll: create === false && read === false && update === false && del === false,
        hasFieldValidation,
    };
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

function toStaticPolicy(
    operation: PolicyOperationKind,
    allows: DataModelAttribute[],
    denies: DataModelAttribute[]
): boolean | undefined {
    const filteredDenies = forOperation(operation, denies);
    if (filteredDenies.some((rule) => getLiteral<boolean>(rule.args[1].value) === true)) {
        // any constant true deny rule
        return false;
    }

    const filteredAllows = forOperation(operation, allows);
    if (filteredAllows.length === 0) {
        // no allow rule
        return false;
    }

    if (
        filteredDenies.length === 0 &&
        filteredAllows.some((rule) => getLiteral<boolean>(rule.args[1].value) === true)
    ) {
        // any constant true allow rule
        return true;
    }
    return undefined;
}

function forOperation(operation: PolicyOperationKind, rules: DataModelAttribute[]) {
    return rules.filter((rule) => {
        const ops = getLiteral<string>(rule.args[0].value);
        if (!ops) {
            return false;
        }
        if (ops === 'all') {
            return true;
        }
        const splitOps = ops.split(',').map((p) => p.trim());
        return splitOps.includes(operation);
    });
}

export const VALIDATION_ATTRIBUTES = [
    '@length',
    '@regex',
    '@startsWith',
    '@endsWith',
    '@email',
    '@url',
    '@datetime',
    '@gt',
    '@gte',
    '@lt',
    '@lte',
];

export function getIdFields(dataModel: DataModel) {
    const fieldLevelId = dataModel.$resolvedFields.find((f) =>
        f.attributes.some((attr) => attr.decl.$refText === '@id')
    );
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

export function isAuthInvocation(node: AstNode) {
    return isInvocationExpr(node) && node.function.ref?.name === 'auth' && isFromStdlib(node.function.ref);
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
