import { AstUtils, URI, type AstNode, type LangiumDocument, type LangiumDocuments, type Reference } from 'langium';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PLUGIN_MODULE_NAME, STD_LIB_MODULE_NAME, type ExpressionContext } from './constants';
import {
    InternalAttribute,
    isArrayExpr,
    isBinaryExpr,
    isConfigArrayExpr,
    isDataField,
    isDataModel,
    isEnumField,
    isExpression,
    isInvocationExpr,
    isLiteralExpr,
    isMemberAccessExpr,
    isModel,
    isObjectExpr,
    isPlugin,
    isReferenceExpr,
    isStringLiteral,
    isTypeDef,
    type Attribute,
    type AttributeParam,
    type BinaryExpr,
    type BuiltinType,
    type ConfigExpr,
    type DataField,
    type DataFieldAttribute,
    type DataModel,
    type DataModelAttribute,
    type Enum,
    type EnumField,
    type Expression,
    type ExpressionType,
    type FunctionDecl,
    type Model,
    type ModelImport,
    type ReferenceExpr,
    type TypeDef,
} from './generated/ast';

export type AttributeTarget =
    | DataModel
    | TypeDef
    | DataField
    | Enum
    | EnumField
    | FunctionDecl
    | Attribute
    | AttributeParam;

export function hasAttribute(decl: AttributeTarget, name: string) {
    return !!getAttribute(decl, name);
}

export function getAttribute(decl: AttributeTarget, name: string) {
    return (decl.attributes as (DataModelAttribute | DataFieldAttribute)[]).find((attr) => attr.decl.$refText === name);
}

export function isFromStdlib(node: AstNode) {
    const model = AstUtils.getContainerOfType(node, isModel);
    return !!model && !!model.$document && model.$document.uri.path.endsWith(STD_LIB_MODULE_NAME);
}

export function isAuthInvocation(node: AstNode) {
    return isInvocationExpr(node) && node.function.ref?.name === 'auth' && isFromStdlib(node.function.ref);
}

/**
 * Try getting string value from a potential string literal expression
 */
export function getStringLiteral(node: AstNode | undefined): string | undefined {
    return isStringLiteral(node) ? node.value : undefined;
}

const isoDateTimeRegex = /^\d{4}(-\d\d(-\d\d(T\d\d:\d\d(:\d\d)?(\.\d+)?(([+-]\d\d:\d\d)|Z)?)?)?)?$/i;

/**
 * Determines if the given sourceType is assignable to a destination of destType
 */
export function typeAssignable(destType: ExpressionType, sourceType: ExpressionType, sourceExpr?: Expression): boolean {
    // implicit conversion from ISO datetime string to datetime
    if (destType === 'DateTime' && sourceType === 'String' && sourceExpr && isStringLiteral(sourceExpr)) {
        const literal = getStringLiteral(sourceExpr);
        if (literal && isoDateTimeRegex.test(literal)) {
            // implicitly convert to DateTime
            sourceType = 'DateTime';
        }
    }

    switch (destType) {
        case 'Any':
            return true;
        case 'Float':
            return sourceType === 'Any' || sourceType === 'Int' || sourceType === 'Float';
        default:
            return sourceType === 'Any' || sourceType === destType;
    }
}

/**
 * Maps a ZModel builtin type to expression type
 */
export function mapBuiltinTypeToExpressionType(type: BuiltinType | ExpressionType): ExpressionType {
    switch (type) {
        case 'Any':
        case 'Boolean':
        case 'String':
        case 'DateTime':
        case 'Int':
        case 'Float':
        case 'Null':
        case 'Object':
        case 'Unsupported':
        case 'Void':
        case 'Undefined':
            return type;
        case 'BigInt':
            return 'Int';
        case 'Decimal':
            return 'Float';
        case 'Json':
        case 'Bytes':
            return 'Any';
    }
}

/**
 * Determines if the given expression is an invocation of `auth` or a member access on the result of an `auth` invocation (e.g. `auth().role`).
 */
export function isAuthOrAuthMemberAccess(expr: Expression): boolean {
    return isAuthInvocation(expr) || (isMemberAccessExpr(expr) && isAuthOrAuthMemberAccess(expr.operand));
}

/**
 * Determines if the given expression is a reference to an enum field.
 */
export function isEnumFieldReference(node: AstNode): node is ReferenceExpr {
    return isReferenceExpr(node) && isEnumField(node.target.ref);
}

/**
 * Determines if the given expression is a reference to a data field.
 */
export function isDataFieldReference(node: AstNode): node is ReferenceExpr {
    return isReferenceExpr(node) && isDataField(node.target.ref);
}

/**
 * Returns if the given field is a relation field.
 */
export function isRelationshipField(field: DataField) {
    return isDataModel(field.type.reference?.ref);
}

/**
 * Returns if the given field is a computed field.
 */
export function isComputedField(field: DataField) {
    return hasAttribute(field, '@computed');
}

/**
 * Determines if the given data model is a delegate model (i.e. marked with `@@delegate` attribute).
 */
export function isDelegateModel(node: AstNode) {
    return isDataModel(node) && hasAttribute(node, '@@delegate');
}

/**
 * Resolves the given reference and returns the target AST node. Throws an error if the reference is not resolved.
 */
export function resolved<T extends AstNode>(ref: Reference<T>): T {
    if (!ref.ref) {
        throw new Error(`Reference not resolved: ${ref.$refText}`);
    }
    return ref.ref;
}

/**
 * Gets all base models and mixins of a data model or type def, recursively.
 */
export function getRecursiveBases(
    decl: DataModel | TypeDef,
    includeDelegate = true,
    documents?: LangiumDocuments,
    seen = new Set<DataModel | TypeDef>(),
): (TypeDef | DataModel)[] {
    const result: (TypeDef | DataModel)[] = [];
    if (seen.has(decl)) {
        return result;
    }
    seen.add(decl);
    const bases = [...decl.mixins, ...(isDataModel(decl) && decl.baseModel ? [decl.baseModel] : [])];
    bases.forEach((base) => {
        let baseDecl: TypeDef | DataModel | undefined;

        if (base.ref && (isTypeDef(base.ref) || isDataModel(base.ref))) {
            // base is already resolved
            baseDecl = base.ref;
        } else {
            // otherwise, search by name, in all imported documents if provided
            const declarations = documents
                ? getAllDeclarationsIncludingImports(documents, decl.$container)
                : decl.$container.declarations;

            baseDecl = declarations.find(
                (d): d is TypeDef | DataModel => (isTypeDef(d) || isDataModel(d)) && d.name === base.$refText,
            );
        }

        if (baseDecl) {
            if (!includeDelegate && isDelegateModel(baseDecl)) {
                return;
            }
            result.push(baseDecl);
            result.push(...getRecursiveBases(baseDecl, includeDelegate, documents, seen));
        }
    });
    return result;
}

/**
 * Gets `@@id` fields declared at the data model level (including search in base models)
 */
export function getModelIdFields(model: DataModel) {
    const modelsToCheck = [model, ...getRecursiveBases(model)];

    for (const modelToCheck of modelsToCheck) {
        const allAttributes = getAllAttributes(modelToCheck);
        const idAttr = allAttributes.find((attr) => attr.decl.$refText === '@@id');
        if (!idAttr) {
            continue;
        }
        const fieldsArg = idAttr.args.find((a) => a.$resolvedParam?.name === 'fields');
        if (!fieldsArg || !isArrayExpr(fieldsArg.value)) {
            continue;
        }

        return fieldsArg.value.items
            .filter((item): item is ReferenceExpr => isReferenceExpr(item))
            .map((item) => resolved(item.target) as DataField);
    }

    return [];
}

/**
 * Gets `@@unique` fields declared at the data model level (including search in base models)
 */
export function getModelUniqueFields(model: DataModel) {
    const modelsToCheck = [model, ...getRecursiveBases(model)];

    for (const modelToCheck of modelsToCheck) {
        const allAttributes = getAllAttributes(modelToCheck);
        const uniqueAttr = allAttributes.find((attr) => attr.decl.$refText === '@@unique');
        if (!uniqueAttr) {
            continue;
        }
        const fieldsArg = uniqueAttr.args.find((a) => a.$resolvedParam?.name === 'fields');
        if (!fieldsArg || !isArrayExpr(fieldsArg.value)) {
            continue;
        }

        return fieldsArg.value.items
            .filter((item): item is ReferenceExpr => isReferenceExpr(item))
            .map((item) => resolved(item.target) as DataField);
    }

    return [];
}

/**
 * Gets lists of unique fields declared at the data model level
 *
 * TODO: merge this with {@link getModelUniqueFields}
 */
export function getUniqueFields(model: DataModel) {
    const uniqueAttrs = model.attributes.filter(
        (attr) => attr.decl.ref?.name === '@@unique' || attr.decl.ref?.name === '@@id',
    );
    return uniqueAttrs.map((uniqueAttr) => {
        const fieldsArg = uniqueAttr.args.find((a) => a.$resolvedParam?.name === 'fields');
        if (!fieldsArg || !isArrayExpr(fieldsArg.value)) {
            return [];
        }

        return fieldsArg.value.items
            .filter((item): item is ReferenceExpr => isReferenceExpr(item))
            .map((item) => resolved(item.target) as DataField);
    });
}

/**
 * Finds the first ancestor of the given AST node that satisfies the given predicate function. Returns `undefined` if no such ancestor is found.
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
 * Tries to get the literal value from the given expression. Returns `undefined` if the expression is not a literal or if the literal value cannot be determined.
 */
export function getLiteral<T extends string | number | boolean | any = any>(
    expr: Expression | ConfigExpr | undefined,
): T | undefined {
    switch (expr?.$type) {
        case 'ObjectExpr':
            return getObjectLiteral<T>(expr);
        case 'StringLiteral':
        case 'BooleanLiteral':
            return expr.value as T;
        case 'NumberLiteral':
            return parseFloat(expr.value) as T;
        default:
            return undefined;
    }
}

/**
 * Tries to get an object literal from the given expression. Returns `undefined` if the expression is not an object literal or if any of the field values cannot be determined.
 */
export function getObjectLiteral<T>(expr: Expression | ConfigExpr | undefined): T | undefined {
    if (!expr || !isObjectExpr(expr)) {
        return undefined;
    }
    const result: Record<string, unknown> = {};
    for (const field of expr.fields) {
        let fieldValue: unknown;
        if (isLiteralExpr(field.value)) {
            fieldValue = getLiteral(field.value);
        } else if (isArrayExpr(field.value)) {
            fieldValue = getLiteralArray(field.value);
        } else if (isObjectExpr(field.value)) {
            fieldValue = getObjectLiteral(field.value);
        }
        if (fieldValue === undefined) {
            return undefined;
        } else {
            result[field.name] = fieldValue;
        }
    }
    return result as T;
}

export function getLiteralArray<T extends string | number | boolean | any = any>(
    expr: Expression | ConfigExpr | undefined,
): T[] | undefined {
    const arr = getArray(expr);
    if (!arr) {
        return undefined;
    }
    return arr.map((item) => isExpression(item) && getLiteral<T>(item)).filter((v): v is T => v !== undefined);
}

function getArray(expr: Expression | ConfigExpr | undefined) {
    return isArrayExpr(expr) || isConfigArrayExpr(expr) ? expr.items : undefined;
}

/**
 * Gets the value of the argument with the given name from the given attribute. Returns `undefined` if no such argument is found or if the argument value cannot be determined.
 */
export function getAttributeArg(
    attr: DataModelAttribute | DataFieldAttribute | InternalAttribute,
    name: string,
): Expression | undefined {
    return attr.args.find((arg) => arg.$resolvedParam?.name === name)?.value;
}

/**
 * Gets the literal value of the argument with the given name from the given attribute. Returns `undefined` if no such argument is found or if the argument value cannot be determined or is not a literal.
 */
export function getAttributeArgLiteral<T extends string | number | boolean>(
    attr: DataModelAttribute | DataFieldAttribute | InternalAttribute,
    name: string,
): T | undefined {
    for (const arg of attr.args) {
        if (arg.$resolvedParam?.name === name) {
            return getLiteral<T>(arg.value);
        }
    }
    return undefined;
}

/**
 * Gets the allowed expression contexts for the given function declaration by looking for `@@expressionContext` attribute.
 * Returns an empty array if no such attribute is found or if the attribute value cannot be determined.
 */
export function getFunctionExpressionContext(funcDecl: FunctionDecl) {
    const funcAllowedContext: ExpressionContext[] = [];
    const funcAttr = funcDecl.attributes.find((attr) => attr.decl.$refText === '@@@expressionContext');
    if (funcAttr) {
        const contextArg = funcAttr.args[0]?.value;
        if (isArrayExpr(contextArg)) {
            contextArg.items.forEach((item) => {
                if (isEnumFieldReference(item)) {
                    funcAllowedContext.push(item.target.$refText as ExpressionContext);
                }
            });
        }
    }
    return funcAllowedContext;
}

/**
 * Gets the data field referenced by the given expression, if any. Returns `undefined` if the expression is not a reference to a data field.
 */
export function getFieldReference(expr: Expression): DataField | undefined {
    if (isReferenceExpr(expr) && isDataField(expr.target.ref)) {
        return expr.target.ref;
    } else if (isMemberAccessExpr(expr) && isDataField(expr.member.ref)) {
        return expr.member.ref;
    } else {
        return undefined;
    }
}

// TODO: move to policy plugin
export function isCheckInvocation(node: AstNode) {
    return isInvocationExpr(node) && node.function.ref?.name === 'check';
}

/**
 * Resolves the transitive imports of the given model and returns the list of imported models. The given model itself is not included in the result.
 */
export function resolveTransitiveImports(documents: LangiumDocuments, model: Model) {
    return resolveTransitiveImportsInternal(documents, model);
}

function resolveTransitiveImportsInternal(
    documents: LangiumDocuments,
    model: Model,
    initialModel = model,
    visited: Set<string> = new Set(),
    models: Set<Model> = new Set(),
) {
    const doc = AstUtils.getDocument(model);
    const initialDoc = AstUtils.getDocument(initialModel);

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

/**
 * Resolves the given import and returns the imported model. Returns `undefined`
 * if the import cannot be resolved.
 */
export function resolveImport(documents: LangiumDocuments, imp: ModelImport) {
    const resolvedUri = resolveImportUri(imp);
    try {
        if (resolvedUri) {
            let resolvedDocument = documents.getDocument(resolvedUri);
            if (!resolvedDocument) {
                const content = fs.readFileSync(resolvedUri.fsPath, 'utf-8');
                resolvedDocument = documents.createDocument(resolvedUri, content);
            }
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

/**
 * Resolves the given import and returns the URI of the imported model.
 * Returns `undefined` if the import cannot be resolved.
 */
export function resolveImportUri(imp: ModelImport) {
    if (!imp.path) {
        return undefined;
    }
    const doc = AstUtils.getDocument(imp);
    const dir = path.dirname(doc.uri.fsPath);
    const importPath = imp.path.endsWith('.zmodel') ? imp.path : `${imp.path}.zmodel`;
    return URI.file(path.resolve(dir, importPath));
}

/**
 * Gets data models and type defs in the ZModel schema.
 */
export function getDataModelAndTypeDefs(model: Model, includeIgnored = false) {
    const r = model.declarations.filter((d): d is DataModel | TypeDef => isDataModel(d) || isTypeDef(d));
    if (includeIgnored) {
        return r;
    } else {
        return r.filter((model) => !hasAttribute(model, '@@ignore'));
    }
}

/**
 * Gets all declarations of the given model and its transitive imports.
 */
export function getAllDeclarationsIncludingImports(documents: LangiumDocuments, model: Model) {
    const imports = resolveTransitiveImports(documents, model);
    return model.declarations.concat(...imports.map((imp) => imp.declarations));
}

/**
 * Gets the model used for auth context, by looking for a model with `@@auth` attribute or a model named `User`.
 * Returns `undefined` if no such model is found.
 */
export function getAuthDecl(decls: (DataModel | TypeDef)[]) {
    let authModel = decls.find((d) => hasAttribute(d, '@@auth'));
    if (!authModel) {
        authModel = decls.find((d) => d.name === 'User');
    }
    return authModel;
}

// TODO: move to policy plugin
export function isBeforeInvocation(node: AstNode) {
    return isInvocationExpr(node) && node.function.ref?.name === 'before';
}

/**
 * Determines if the given AST node is a collection predicate.
 */
export function isCollectionPredicate(node: AstNode): node is BinaryExpr {
    return isBinaryExpr(node) && ['?', '!', '^'].includes(node.operator);
}

/**
 * Gets all data models and type defs from the given documents registry.
 */
export function getAllLoadedDataModelsAndTypeDefs(langiumDocuments: LangiumDocuments) {
    return langiumDocuments.all
        .map((doc) => doc.parseResult.value as Model)
        .flatMap((model) => model.declarations.filter((d): d is DataModel | TypeDef => isDataModel(d) || isTypeDef(d)))
        .toArray();
}

/**
 * Gets all data models from the given documents registry and the transitive imports of the given model.
 */
export function getAllDataModelsIncludingImports(documents: LangiumDocuments, model: Model) {
    return getAllDeclarationsIncludingImports(documents, model).filter(isDataModel);
}

/**
 * Gets all data models and type defs from the given documents registry and the transitive imports
 * of the given model. If `fromModel` is not provided, returns all loaded data models and type defs.
 */
export function getAllLoadedAndReachableDataModelsAndTypeDefs(
    langiumDocuments: LangiumDocuments,
    fromModel?: DataModel,
) {
    // get all data models from loaded documents
    const allDataModels = getAllLoadedDataModelsAndTypeDefs(langiumDocuments);

    if (fromModel) {
        // merge data models transitively reached from the current model
        const model = AstUtils.getContainerOfType(fromModel, isModel);
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
 * Gets the containing data model of the given AST node, if any.
 * Returns `undefined` if the node is not contained in a data model.
 */
export function getContainingDataModel(node: AstNode): DataModel | undefined {
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
 * Determines if the given AST node can contain members.
 */
export function isMemberContainer(node: unknown): node is DataModel | TypeDef {
    return isDataModel(node) || isTypeDef(node);
}

/**
 * Gets all fields of a data model or type def, including inherited fields from base models and mixins.
 */
export function getAllFields(
    decl: DataModel | TypeDef,
    includeIgnored = false,
    seen: Set<DataModel | TypeDef> = new Set(),
): DataField[] {
    if (seen.has(decl)) {
        return [];
    }
    seen.add(decl);

    const fields: DataField[] = [];
    for (const mixin of decl.mixins) {
        if (mixin.ref) {
            fields.push(...getAllFields(mixin.ref, includeIgnored, seen));
        }
    }

    if (isDataModel(decl) && decl.baseModel) {
        if (decl.baseModel.ref) {
            fields.push(...getAllFields(decl.baseModel.ref, includeIgnored, seen));
        }
    }

    fields.push(...decl.fields.filter((f) => includeIgnored || !hasAttribute(f, '@ignore')));
    return fields;
}

/**
 * Gets all attributes of a data model or type def, including inherited attributes
 * from base models and mixins.
 */
export function getAllAttributes(
    decl: DataModel | TypeDef,
    seen: Set<DataModel | TypeDef> = new Set(),
): DataModelAttribute[] {
    if (seen.has(decl)) {
        return [];
    }
    seen.add(decl);

    const attributes: DataModelAttribute[] = [];
    for (const mixin of decl.mixins) {
        if (mixin.ref) {
            attributes.push(...getAllAttributes(mixin.ref, seen));
        }
    }

    if (isDataModel(decl) && decl.baseModel) {
        if (decl.baseModel.ref) {
            const attrs = getAllAttributes(decl.baseModel.ref, seen).filter((attr) => !isNonInheritableAttribute(attr));
            attributes.push(...attrs);
        }
    }

    attributes.push(...decl.attributes);
    return attributes;
}

function isNonInheritableAttribute(attr: DataModelAttribute) {
    const attrName = attr.decl.ref?.name ?? attr.decl.$refText;
    return ['@@map', '@@unique', '@@index'].includes(attrName);
}

/**
 * Retrieve the document in which the given AST node is contained. A reference to the document is
 * usually held by the root node of the AST.
 *
 * @throws an error if the node is not contained in a document.
 */
export function getDocument<T extends AstNode = AstNode>(node: AstNode): LangiumDocument<T> {
    const rootNode = findRootNode(node);
    const result = rootNode.$document;
    if (!result) {
        throw new Error('AST node has no document.');
    }
    return result as LangiumDocument<T>;
}

/**
 * Gets the list of plugin documents from the given model.
 */
export function getPluginDocuments(model: Model, schemaPath: string): string[] {
    // traverse plugins and collect "plugin.zmodel" documents
    const result: string[] = [];
    for (const decl of model.declarations.filter(isPlugin)) {
        const providerField = decl.fields.find((f) => f.name === 'provider');
        if (!providerField) {
            continue;
        }

        const provider = getLiteral<string>(providerField.value);
        if (!provider) {
            continue;
        }

        let pluginModelFile: string | undefined;

        // first try to treat provider as a path
        let providerPath = path.resolve(path.dirname(schemaPath), provider);
        if (fs.existsSync(providerPath)) {
            if (fs.statSync(providerPath).isDirectory()) {
                providerPath = path.join(providerPath, 'index.js');
            }

            // try plugin.zmodel next to the provider file
            pluginModelFile = path.resolve(path.dirname(providerPath), PLUGIN_MODULE_NAME);
            if (!fs.existsSync(pluginModelFile)) {
                // try to find upwards
                pluginModelFile = findUp([PLUGIN_MODULE_NAME], path.dirname(providerPath));
            }
        }

        if (!pluginModelFile) {
            if (typeof import.meta.resolve === 'function') {
                try {
                    // try loading as a ESM module
                    const resolvedUrl = import.meta.resolve(`${provider}/${PLUGIN_MODULE_NAME}`);
                    pluginModelFile = fileURLToPath(resolvedUrl);
                } catch {
                    // noop
                }
            }
        }

        if (!pluginModelFile) {
            // try loading as a CJS module
            try {
                const require = createRequire(pathToFileURL(schemaPath));
                pluginModelFile = require.resolve(`${provider}/${PLUGIN_MODULE_NAME}`);
            } catch {
                // noop
            }
        }

        if (pluginModelFile && fs.existsSync(pluginModelFile)) {
            result.push(pluginModelFile);
        }
    }
    return result;
}

type FindUpResult<Multiple extends boolean> = Multiple extends true ? string[] | undefined : string | undefined;

function findUp<Multiple extends boolean = false>(
    names: string[],
    cwd: string = process.cwd(),
    multiple: Multiple = false as Multiple,
    result: string[] = [],
): FindUpResult<Multiple> {
    if (!names.some((name) => !!name)) {
        return undefined;
    }
    const target = names.find((name) => fs.existsSync(path.join(cwd, name)));
    if (multiple === false && target) {
        return path.join(cwd, target) as FindUpResult<Multiple>;
    }
    if (target) {
        result.push(path.join(cwd, target));
    }
    const up = path.resolve(cwd, '..');
    if (up === cwd) {
        return (multiple && result.length > 0 ? result : undefined) as FindUpResult<Multiple>;
    }
    return findUp(names, up, multiple, result);
}

/**
 * Returns the root node of the given AST node by following the `$container` references.
 */
export function findRootNode(node: AstNode): AstNode {
    while (node.$container) {
        node = node.$container;
    }
    return node;
}
