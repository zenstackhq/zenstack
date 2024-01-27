import {
    BinaryExpr,
    MemberAccessExpr,
    isDataModel,
    isDataModelField,
    isEnumField,
    isInvocationExpr,
    isMemberAccessExpr,
    isModel,
    isReferenceExpr,
    isThisExpr,
} from '@zenstackhq/language/ast';
import {
    getAuthModel,
    getDataModels,
    getModelFieldsWithBases,
    getRecursiveBases,
    isAuthInvocation,
    isFutureExpr,
} from '@zenstackhq/sdk';
import {
    AstNode,
    AstNodeDescription,
    DefaultScopeComputation,
    DefaultScopeProvider,
    EMPTY_SCOPE,
    LangiumDocument,
    LangiumServices,
    PrecomputedScopes,
    ReferenceInfo,
    Scope,
    StreamScope,
    equalURI,
    getContainerOfType,
    interruptAndCheck,
    stream,
    streamAllContents,
} from 'langium';
import { match } from 'ts-pattern';
import { CancellationToken } from 'vscode-jsonrpc';
import { isCollectionPredicate, resolveImportUri } from '../utils/ast-utils';
import { PLUGIN_MODULE_NAME, STD_LIB_MODULE_NAME } from './constants';

/**
 * Custom Langium ScopeComputation implementation which adds enum fields into global scope
 */
export class ZModelScopeComputation extends DefaultScopeComputation {
    constructor(private readonly services: LangiumServices) {
        super(services);
    }

    async computeExports(
        document: LangiumDocument<AstNode>,
        cancelToken?: CancellationToken | undefined
    ): Promise<AstNodeDescription[]> {
        const result = await super.computeExports(document, cancelToken);

        // add enum fields so they can be globally resolved across modules
        for (const node of streamAllContents(document.parseResult.value)) {
            if (cancelToken) {
                await interruptAndCheck(cancelToken);
            }
            if (isEnumField(node)) {
                const desc = this.services.workspace.AstNodeDescriptionProvider.createDescription(
                    node,
                    node.name,
                    document
                );
                result.push(desc);
            }
        }

        return result;
    }

    override processNode(node: AstNode, document: LangiumDocument<AstNode>, scopes: PrecomputedScopes) {
        super.processNode(node, document, scopes);

        if (isDataModel(node)) {
            // add base fields to the scope recursively
            const bases = getRecursiveBases(node);
            for (const base of bases) {
                for (const field of base.fields) {
                    scopes.add(node, this.descriptions.createDescription(field, this.nameProvider.getName(field)));
                }
            }
        }
    }
}

export class ZModelScopeProvider extends DefaultScopeProvider {
    constructor(services: LangiumServices) {
        super(services);
    }

    protected override getGlobalScope(referenceType: string, context: ReferenceInfo): Scope {
        const model = getContainerOfType(context.container, isModel);
        if (!model) {
            return EMPTY_SCOPE;
        }

        const importedUris = stream(model.imports).map(resolveImportUri).nonNullable();
        const importedElements = this.indexManager.allElements(referenceType).filter(
            (des) =>
                // allow current document
                equalURI(des.documentUri, model.$document?.uri) ||
                // allow stdlib
                des.documentUri.path.endsWith(STD_LIB_MODULE_NAME) ||
                // allow plugin models
                des.documentUri.path.endsWith(PLUGIN_MODULE_NAME) ||
                // allow imported documents
                importedUris.some((importedUri) => (des.documentUri, importedUri))
        );
        return new StreamScope(importedElements);
    }

    override getScope(context: ReferenceInfo): Scope {
        if (isMemberAccessExpr(context.container) && context.container.operand && context.property === 'member') {
            return this.getMemberAccessScope(context);
        }

        if (isReferenceExpr(context.container) && context.property === 'target') {
            // when reference expression is resolved inside a collection predicate, the scope is the collection
            const containerCollectionPredicate = getCollectionPredicateContext(context.container);
            if (containerCollectionPredicate) {
                return this.getCollectionPredicateScope(context, containerCollectionPredicate);
            }
        }

        return super.getScope(context);
    }

    private getMemberAccessScope(context: ReferenceInfo) {
        const referenceType = this.reflection.getReferenceType(context);
        const globalScope = this.getGlobalScope(referenceType, context);
        const node = context.container as MemberAccessExpr;

        return match(node.operand)
            .when(isReferenceExpr, (operand) => {
                // operand is a reference, it can only be a model field
                const ref = operand.target.ref;
                if (isDataModelField(ref)) {
                    const targetModel = ref.type.reference?.ref;
                    return this.createScopeForModel(targetModel, globalScope);
                }
                return EMPTY_SCOPE;
            })
            .when(isMemberAccessExpr, (operand) => {
                // operand is a member access, it must be resolved to a
                const ref = operand.member.ref;
                if (isDataModelField(ref)) {
                    const targetModel = ref.type.reference?.ref;
                    return this.createScopeForModel(targetModel, globalScope);
                }
                return EMPTY_SCOPE;
            })
            .when(isThisExpr, () => {
                // operand is `this`, resolve to the containing model
                return this.createScopeForContainingModel(node, globalScope);
            })
            .when(isInvocationExpr, (operand) => {
                // deal with member access from `auth()` and `future()
                if (isAuthInvocation(operand)) {
                    // resolve to `User` or `@@auth` model
                    return this.createScopeForAuthModel(node, globalScope);
                }
                if (isFutureExpr(operand)) {
                    // resolve `future()` to the containing model
                    return this.createScopeForContainingModel(node, globalScope);
                }
                return EMPTY_SCOPE;
            })
            .otherwise(() => EMPTY_SCOPE);
    }

    private getCollectionPredicateScope(context: ReferenceInfo, collectionPredicate: BinaryExpr) {
        const referenceType = this.reflection.getReferenceType(context);
        const globalScope = this.getGlobalScope(referenceType, context);
        const collection = collectionPredicate.left;

        return match(collection)
            .when(isReferenceExpr, (expr) => {
                // collection is a reference, it can only be a model field
                const ref = expr.target.ref;
                if (isDataModelField(ref)) {
                    const targetModel = ref.type.reference?.ref;
                    return this.createScopeForModel(targetModel, globalScope);
                }
                return EMPTY_SCOPE;
            })
            .when(isMemberAccessExpr, (expr) => {
                // collection is a member access, it can only be resolved to a model field
                const ref = expr.member.ref;
                if (isDataModelField(ref)) {
                    const targetModel = ref.type.reference?.ref;
                    return this.createScopeForModel(targetModel, globalScope);
                }
                return EMPTY_SCOPE;
            })
            .when(isAuthInvocation, (expr) => {
                return this.createScopeForAuthModel(expr, globalScope);
            })
            .otherwise(() => EMPTY_SCOPE);
    }

    private createScopeForContainingModel(node: AstNode, globalScope: Scope) {
        const model = getContainerOfType(node, isDataModel);
        if (model) {
            return this.createScopeForNodes(model.fields, globalScope);
        } else {
            return EMPTY_SCOPE;
        }
    }

    private createScopeForModel(node: AstNode | undefined, globalScope: Scope) {
        if (isDataModel(node)) {
            return this.createScopeForNodes(getModelFieldsWithBases(node), globalScope);
        } else {
            return EMPTY_SCOPE;
        }
    }

    private createScopeForAuthModel(node: AstNode, globalScope: Scope) {
        const model = getContainerOfType(node, isModel);
        if (model) {
            const authModel = getAuthModel(getDataModels(model, true));
            if (authModel) {
                return this.createScopeForNodes(authModel.fields, globalScope);
            }
        }
        return EMPTY_SCOPE;
    }
}

function getCollectionPredicateContext(node: AstNode) {
    let curr: AstNode | undefined = node;
    while (curr) {
        if (curr.$container && isCollectionPredicate(curr.$container) && curr.$containerProperty === 'right') {
            return curr.$container;
        }
        curr = curr.$container;
    }
    return undefined;
}
