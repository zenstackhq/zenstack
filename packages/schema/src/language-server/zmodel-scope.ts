import {
    BinaryExpr,
    MemberAccessExpr,
    isAliasDecl,
    isDataModel,
    isDataModelField,
    isEnumField,
    isInvocationExpr,
    isMemberAccessExpr,
    isModel,
    isReferenceExpr,
    isThisExpr,
    isTypeDef,
    isTypeDefField,
} from '@zenstackhq/language/ast';
import { getAuthDecl, getModelFieldsWithBases, getRecursiveBases, isAuthInvocation } from '@zenstackhq/sdk';
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
import {
    getAllLoadedAndReachableDataModelsAndTypeDefs,
    isCollectionPredicate,
    isFutureInvocation,
    resolveImportUri,
} from '../utils/ast-utils';
import { PLUGIN_MODULE_NAME, STD_LIB_MODULE_NAME } from './constants';
import { isAuthOrAuthMemberAccess } from './validator/utils';

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

        if (isDataModel(node) && !node.$baseMerged) {
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
    constructor(private readonly services: LangiumServices) {
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
                importedUris.some((importedUri) => equalURI(des.documentUri, importedUri))
        );
        return new StreamScope(importedElements);
    }

    override getScope(context: ReferenceInfo): Scope {
        if (isMemberAccessExpr(context.container) && context.container.operand && context.property === 'member') {
            // Check if we're inside an alias first
            const aliasDecl = getContainerOfType(context.container, isAliasDecl);
            if (aliasDecl) {
                return this.getAliasMemberAccessScope(context);
            }
            return this.getMemberAccessScope(context);
        }

        if (isReferenceExpr(context.container) && context.property === 'target') {
            // when reference expression is resolved inside a collection predicate, the scope is the collection
            const containerCollectionPredicate = getCollectionPredicateContext(context.container);
            if (containerCollectionPredicate) {
                return this.getCollectionPredicateScope(context, containerCollectionPredicate);
            }
            
            // Check if we're inside an alias declaration - if so, get scope from containing model
            const aliasDecl = getContainerOfType(context.container, isAliasDecl);
            if (aliasDecl) {
                return this.getAliasScope(context);
            }
        }

        return super.getScope(context);
    }

    private getMemberAccessScope(context: ReferenceInfo) {
        const referenceType = this.reflection.getReferenceType(context);
        const globalScope = this.getGlobalScope(referenceType, context);
        const node = context.container as MemberAccessExpr;

        // typedef's fields are only added to the scope if the access starts with `auth().`
        // or the member access resides inside a typedef
        const allowTypeDefScope = isAuthOrAuthMemberAccess(node.operand) || !!getContainerOfType(node, isTypeDef);

        return match(node.operand)
            .when(isReferenceExpr, (operand) => {
                // operand is a reference, it can only be a model/type-def field
                const ref = operand.target.ref;
                if (isDataModelField(ref) || isTypeDefField(ref)) {
                    return this.createScopeForContainer(ref.type.reference?.ref, globalScope, allowTypeDefScope);
                }
                return EMPTY_SCOPE;
            })
            .when(isMemberAccessExpr, (operand) => {
                // operand is a member access, it must be resolved to a non-array model/typedef type
                const ref = operand.member.ref;
                if (isDataModelField(ref) && !ref.type.array) {
                    return this.createScopeForContainer(ref.type.reference?.ref, globalScope, allowTypeDefScope);
                }
                if (isTypeDefField(ref) && !ref.type.array) {
                    return this.createScopeForContainer(ref.type.reference?.ref, globalScope, allowTypeDefScope);
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
                    // resolve to `User` or `@@auth` decl
                    return this.createScopeForAuth(node, globalScope);
                }
                if (isFutureInvocation(operand)) {
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

        // typedef's fields are only added to the scope if the access starts with `auth().`
        const allowTypeDefScope = isAuthOrAuthMemberAccess(collection);

        return match(collection)
            .when(isReferenceExpr, (expr) => {
                // collection is a reference - model or typedef field
                const ref = expr.target.ref;
                if (isDataModelField(ref) || isTypeDefField(ref)) {
                    return this.createScopeForContainer(ref.type.reference?.ref, globalScope, allowTypeDefScope);
                }
                return EMPTY_SCOPE;
            })
            .when(isMemberAccessExpr, (expr) => {
                // collection is a member access, it can only be resolved to a model or typedef field
                const ref = expr.member.ref;
                if (isDataModelField(ref) || isTypeDefField(ref)) {
                    return this.createScopeForContainer(ref.type.reference?.ref, globalScope, allowTypeDefScope);
                }
                return EMPTY_SCOPE;
            })
            .when(isAuthInvocation, (expr) => {
                return this.createScopeForAuth(expr, globalScope);
            })
            .otherwise(() => EMPTY_SCOPE);
    }

    private createScopeForContainingModel(node: AstNode, globalScope: Scope) {
        const model = getContainerOfType(node, isDataModel);
        if (model) {
            return this.createScopeForContainer(model, globalScope);
        } else {
            return EMPTY_SCOPE;
        }
    }

    private createScopeForContainer(node: AstNode | undefined, globalScope: Scope, includeTypeDefScope = false): Scope {
        if (isDataModel(node)) {
            return this.createScopeForNodes(getModelFieldsWithBases(node), globalScope);
        } else if (includeTypeDefScope && isTypeDef(node)) {
            return this.createScopeForNodes(node.fields, globalScope);
        } else {
            return EMPTY_SCOPE;
        }
    }

    private createScopeForAuth(node: AstNode, globalScope: Scope) {
        // get all data models and type defs from loaded and reachable documents
        const decls = getAllLoadedAndReachableDataModelsAndTypeDefs(
            this.services.shared.workspace.LangiumDocuments,
            getContainerOfType(node, isDataModel)
        );

        const authDecl = getAuthDecl(decls);
        if (authDecl) {
            return this.createScopeForContainer(authDecl, globalScope, true);
        } else {
            return EMPTY_SCOPE;
        }
    }
    
    private getAliasScope(context: ReferenceInfo): Scope {
        const referenceType = this.reflection.getReferenceType(context);
        const globalScope = this.getGlobalScope(referenceType, context);
        
        // In aliases, we want to resolve references against all possible models
        const model = getContainerOfType(context.container, isModel);
        if (!model) {
            return globalScope;
        }
        
        // Collect all fields from all models
        const allFields: AstNode[] = [];
        for (const decl of model.declarations) {
            if (isDataModel(decl)) {
                allFields.push(...getModelFieldsWithBases(decl));
            }
        }
        
        return this.createScopeForNodes(allFields, globalScope);
    }
    
    private getAliasMemberAccessScope(context: ReferenceInfo): Scope {
        const referenceType = this.reflection.getReferenceType(context);
        const globalScope = this.getGlobalScope(referenceType, context);
        const node = context.container as MemberAccessExpr;
        
        // For member access in aliases, we need to check all possible contexts
        if (isReferenceExpr(node.operand)) {
            const operandName = node.operand.$cstNode?.text;
            if (!operandName) {
                return EMPTY_SCOPE;
            }
            
            // Check if this is used in an invocation context
            let invocationContext: AstNode | undefined = node.$container;
            while (invocationContext && !isInvocationExpr(invocationContext)) {
                invocationContext = invocationContext.$container;
            }
            
            if (invocationContext && isInvocationExpr(invocationContext)) {
                // Find the model where this invocation is used
                const containingModel = getContainerOfType(invocationContext, isDataModel);
                if (containingModel) {
                    const field = getModelFieldsWithBases(containingModel).find(
                        (f) => f.name === operandName
                    );
                    if (field && field.type.reference?.ref) {
                        return this.createScopeForContainer(field.type.reference.ref, globalScope);
                    }
                }
            }
            
            // Otherwise, check all models for possible matches
            const model = getContainerOfType(context.container, isModel);
            if (!model) {
                return EMPTY_SCOPE;
            }
            
            // Collect all possible scopes from all models
            const allScopes: Scope[] = [];
            for (const decl of model.declarations) {
                if (isDataModel(decl)) {
                    const field = getModelFieldsWithBases(decl).find(
                        (f) => f.name === operandName
                    );
                    if (field && field.type.reference?.ref) {
                        allScopes.push(this.createScopeForContainer(field.type.reference.ref, globalScope));
                    }
                }
            }
            
            // Combine all scopes
            if (allScopes.length > 0) {
                return this.combineScopes(allScopes);
            }
        }
        
        return EMPTY_SCOPE;
    }
    
    private combineScopes(scopes: Scope[]): Scope {
        const allElements: AstNodeDescription[] = [];
        for (const scope of scopes) {
            const elements = scope.getAllElements();
            for (const element of elements) {
                // Avoid duplicates
                if (!allElements.some(e => e.name === element.name && e.type === element.type)) {
                    allElements.push(element);
                }
            }
        }
        return new StreamScope(stream(allElements));
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
