import {
    ArrayExpr,
    AttributeArg,
    AttributeParam,
    BinaryExpr,
    BooleanLiteral,
    DataModel,
    DataModelField,
    DataModelFieldType,
    Enum,
    EnumField,
    ExpressionType,
    FunctionDecl,
    FunctionParam,
    FunctionParamType,
    InvocationExpr,
    LiteralExpr,
    MemberAccessExpr,
    NullExpr,
    NumberLiteral,
    ObjectExpr,
    ReferenceExpr,
    ReferenceTarget,
    ResolvedShape,
    StringLiteral,
    ThisExpr,
    UnaryExpr,
    isArrayExpr,
    isBooleanLiteral,
    isDataModel,
    isDataModelField,
    isDataModelFieldType,
    isEnum,
    isNumberLiteral,
    isReferenceExpr,
    isStringLiteral,
} from '@zenstackhq/language/ast';
import {
    getContainingModel,
    getModelFieldsWithBases,
    hasAttribute,
    isAuthInvocation,
    isFutureExpr,
} from '@zenstackhq/sdk';
import {
    AstNode,
    AstNodeDescription,
    AstNodeDescriptionProvider,
    DefaultLinker,
    DocumentState,
    LangiumDocument,
    LangiumServices,
    LinkingError,
    Reference,
    interruptAndCheck,
    isReference,
    streamContents,
} from 'langium';
import { match } from 'ts-pattern';
import { CancellationToken } from 'vscode-jsonrpc';
import { getAllDeclarationsFromImports, getContainingDataModel } from '../utils/ast-utils';
import { mapBuiltinTypeToExpressionType } from './validator/utils';

interface DefaultReference extends Reference {
    _ref?: AstNode | LinkingError;
    _nodeDescription?: AstNodeDescription;
}

type ScopeProvider = (name: string) => ReferenceTarget | DataModel | undefined;

/**
 * Langium linker implementation which links references and resolves expression types
 */
export class ZModelLinker extends DefaultLinker {
    private readonly descriptions: AstNodeDescriptionProvider;

    constructor(services: LangiumServices) {
        super(services);
        this.descriptions = services.workspace.AstNodeDescriptionProvider;
    }

    //#region Reference linking

    async link(document: LangiumDocument, cancelToken = CancellationToken.None): Promise<void> {
        if (document.parseResult.lexerErrors?.length > 0 || document.parseResult.parserErrors?.length > 0) {
            return;
        }

        for (const node of streamContents(document.parseResult.value)) {
            await interruptAndCheck(cancelToken);
            this.resolve(node, document);
        }
        document.state = DocumentState.Linked;
    }

    private linkReference(
        container: AstNode,
        property: string,
        document: LangiumDocument,
        extraScopes: ScopeProvider[]
    ) {
        if (this.resolveFromScopeProviders(container, property, document, extraScopes)) {
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const reference: DefaultReference = (container as any)[property];
        this.doLink({ reference, container, property }, document);
    }

    //#endregion

    //#region Expression type resolving

    private resolveFromScopeProviders(
        node: AstNode,
        property: string,
        document: LangiumDocument,
        providers: ScopeProvider[]
    ) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const reference: DefaultReference = (node as any)[property];
        for (const provider of providers) {
            const target = provider(reference.$refText);
            if (target) {
                reference._ref = target;
                reference._nodeDescription = this.descriptions.createDescription(target, target.name, document);

                // Add the reference to the document's array of references
                document.references.push(reference);

                return target;
            }
        }
        return null;
    }

    private resolve(node: AstNode, document: LangiumDocument, extraScopes: ScopeProvider[] = []) {
        switch (node.$type) {
            case StringLiteral:
            case NumberLiteral:
            case BooleanLiteral:
                this.resolveLiteral(node as LiteralExpr);
                break;

            case InvocationExpr:
                this.resolveInvocation(node as InvocationExpr, document, extraScopes);
                break;

            case ArrayExpr:
                this.resolveArray(node as ArrayExpr, document, extraScopes);
                break;

            case ReferenceExpr:
                this.resolveReference(node as ReferenceExpr, document, extraScopes);
                break;

            case MemberAccessExpr:
                this.resolveMemberAccess(node as MemberAccessExpr, document, extraScopes);
                break;

            case UnaryExpr:
                this.resolveUnary(node as UnaryExpr, document, extraScopes);
                break;

            case BinaryExpr:
                this.resolveBinary(node as BinaryExpr, document, extraScopes);
                break;

            case ObjectExpr:
                this.resolveObject(node as ObjectExpr, document, extraScopes);
                break;

            case ThisExpr:
                this.resolveThis(node as ThisExpr, document, extraScopes);
                break;

            case NullExpr:
                this.resolveNull(node as NullExpr, document, extraScopes);
                break;

            case AttributeArg:
                this.resolveAttributeArg(node as AttributeArg, document, extraScopes);
                break;

            case DataModel:
                this.resolveDataModel(node as DataModel, document, extraScopes);
                break;

            case DataModelField:
                this.resolveDataModelField(node as DataModelField, document, extraScopes);
                break;

            default:
                this.resolveDefault(node, document, extraScopes);
                break;
        }
    }

    private resolveBinary(node: BinaryExpr, document: LangiumDocument<AstNode>, extraScopes: ScopeProvider[]) {
        switch (node.operator) {
            // TODO: support arithmetics?
            // case '+':
            // case '-':
            // case '*':
            // case '/':
            //     this.resolve(node.left, document, extraScopes);
            //     this.resolve(node.right, document, extraScopes);
            //     this.resolveToBuiltinTypeOrDecl(node, 'Int');
            //     break;

            case '>':
            case '>=':
            case '<':
            case '<=':
            case '==':
            case '!=':
            case '&&':
            case '||':
            case 'in':
                this.resolve(node.left, document, extraScopes);
                this.resolve(node.right, document, extraScopes);
                this.resolveToBuiltinTypeOrDecl(node, 'Boolean');
                break;

            case '?':
            case '!':
            case '^':
                this.resolveCollectionPredicate(node, document, extraScopes);
                break;

            default:
                throw Error(`Unsupported binary operator: ${node.operator}`);
        }
    }

    private resolveUnary(node: UnaryExpr, document: LangiumDocument<AstNode>, extraScopes: ScopeProvider[]) {
        this.resolve(node.operand, document, extraScopes);
        switch (node.operator) {
            case '!':
                this.resolveToBuiltinTypeOrDecl(node, 'Boolean');
                break;
            default:
                throw Error(`Unsupported unary operator: ${node.operator}`);
        }
    }

    private resolveObject(node: ObjectExpr, document: LangiumDocument<AstNode>, extraScopes: ScopeProvider[]) {
        node.fields.forEach((field) => this.resolve(field.value, document, extraScopes));
        this.resolveToBuiltinTypeOrDecl(node, 'Object');
    }

    private resolveReference(node: ReferenceExpr, document: LangiumDocument<AstNode>, extraScopes: ScopeProvider[]) {
        this.resolveDefault(node, document, extraScopes);

        if (node.target.ref) {
            // resolve type
            if (node.target.ref.$type === EnumField) {
                this.resolveToBuiltinTypeOrDecl(node, node.target.ref.$container);
            } else {
                this.resolveToDeclaredType(node, (node.target.ref as DataModelField | FunctionParam).type);
            }
        }
    }

    private resolveArray(node: ArrayExpr, document: LangiumDocument<AstNode>, extraScopes: ScopeProvider[]) {
        node.items.forEach((item) => this.resolve(item, document, extraScopes));

        if (node.items.length > 0) {
            const itemType = node.items[0].$resolvedType;
            if (itemType?.decl) {
                this.resolveToBuiltinTypeOrDecl(node, itemType.decl, true);
            }
        } else {
            this.resolveToBuiltinTypeOrDecl(node, 'Any', true);
        }
    }

    private resolveInvocation(node: InvocationExpr, document: LangiumDocument, extraScopes: ScopeProvider[]) {
        this.linkReference(node, 'function', document, extraScopes);
        node.args.forEach((arg) => this.resolve(arg, document, extraScopes));
        if (node.function.ref) {
            // eslint-disable-next-line @typescript-eslint/ban-types
            const funcDecl = node.function.ref as FunctionDecl;
            if (isAuthInvocation(node)) {
                // auth() function is resolved to User model in the current document
                const model = getContainingModel(node);

                if (model) {
                    let authModel = getAllDeclarationsFromImports(this.langiumDocuments(), model).find((d) => {
                        return isDataModel(d) && hasAttribute(d, '@@auth');
                    });
                    if (!authModel) {
                        authModel = getAllDeclarationsFromImports(this.langiumDocuments(), model).find((d) => {
                            return isDataModel(d) && d.name === 'User';
                        });
                    }
                    if (authModel) {
                        node.$resolvedType = { decl: authModel, nullable: true };
                    }
                }
            } else if (isFutureExpr(node)) {
                // future() function is resolved to current model
                node.$resolvedType = { decl: getContainingDataModel(node) };
            } else {
                this.resolveToDeclaredType(node, funcDecl.returnType);
            }
        }
    }

    private resolveLiteral(node: LiteralExpr) {
        const type = match<LiteralExpr, ExpressionType>(node)
            .when(isStringLiteral, () => 'String')
            .when(isBooleanLiteral, () => 'Boolean')
            .when(isNumberLiteral, () => 'Int')
            .exhaustive();

        if (type) {
            this.resolveToBuiltinTypeOrDecl(node, type);
        }
    }

    private resolveMemberAccess(
        node: MemberAccessExpr,
        document: LangiumDocument<AstNode>,
        extraScopes: ScopeProvider[]
    ) {
        this.resolveDefault(node, document, extraScopes);
        const operandResolved = node.operand.$resolvedType;

        if (operandResolved && !operandResolved.array && isDataModel(operandResolved.decl)) {
            // member access is resolved only in the context of the operand type
            if (node.member.ref) {
                this.resolveToDeclaredType(node, node.member.ref.type);

                if (node.$resolvedType && isAuthInvocation(node.operand)) {
                    // member access on auth() function is nullable
                    // because user may not have provided all fields
                    node.$resolvedType.nullable = true;
                }
            }
        }
    }

    private resolveCollectionPredicate(node: BinaryExpr, document: LangiumDocument, extraScopes: ScopeProvider[]) {
        this.resolveDefault(node, document, extraScopes);

        const resolvedType = node.left.$resolvedType;
        if (resolvedType && isDataModel(resolvedType.decl) && resolvedType.array) {
            this.resolveToBuiltinTypeOrDecl(node, 'Boolean');
        } else {
            // error is reported in validation pass
        }
    }

    private resolveThis(node: ThisExpr, _document: LangiumDocument<AstNode>, extraScopes: ScopeProvider[]) {
        // resolve from scopes first
        for (const scope of extraScopes) {
            const r = scope('this');
            if (isDataModel(r)) {
                this.resolveToBuiltinTypeOrDecl(node, r);
                return;
            }
        }

        let decl: AstNode | undefined = node.$container;

        while (decl && !isDataModel(decl)) {
            decl = decl.$container;
        }

        if (decl) {
            this.resolveToBuiltinTypeOrDecl(node, decl);
        }
    }

    private resolveNull(node: NullExpr, _document: LangiumDocument<AstNode>, _extraScopes: ScopeProvider[]) {
        // TODO: how to really resolve null?
        this.resolveToBuiltinTypeOrDecl(node, 'Null');
    }

    private resolveAttributeArg(node: AttributeArg, document: LangiumDocument<AstNode>, extraScopes: ScopeProvider[]) {
        const attrParam = this.findAttrParamForArg(node);
        const attrAppliedOn = node.$container.$container;

        if (attrParam?.type.type === 'TransitiveFieldReference' && isDataModelField(attrAppliedOn)) {
            // "TransitiveFieldReference" is resolved in the context of the containing model of the field
            // where the attribute is applied
            //
            // E.g.:
            //
            // model A {
            //   myId @id String
            // }
            //
            // model B {
            //   id @id String
            //   a A @relation(fields: [id], references: [myId])
            // }
            //
            // In model B, the attribute argument "myId" is resolved to the field "myId" in model A

            const transitiveDataModel = attrAppliedOn.type.reference?.ref as DataModel;
            if (transitiveDataModel) {
                // resolve references in the context of the transitive data model
                const scopeProvider = (name: string) =>
                    getModelFieldsWithBases(transitiveDataModel).find((f) => f.name === name);
                if (isArrayExpr(node.value)) {
                    node.value.items.forEach((item) => {
                        if (isReferenceExpr(item)) {
                            const resolved = this.resolveFromScopeProviders(item, 'target', document, [scopeProvider]);
                            if (resolved) {
                                this.resolveToDeclaredType(item, (resolved as DataModelField).type);
                            } else {
                                // mark unresolvable
                                this.unresolvableRefExpr(item);
                            }
                        }
                    });
                    if (node.value.items[0]?.$resolvedType?.decl) {
                        this.resolveToBuiltinTypeOrDecl(node.value, node.value.items[0].$resolvedType.decl, true);
                    }
                } else if (isReferenceExpr(node.value)) {
                    const resolved = this.resolveFromScopeProviders(node.value, 'target', document, [scopeProvider]);
                    if (resolved) {
                        this.resolveToDeclaredType(node.value, (resolved as DataModelField).type);
                    } else {
                        // mark unresolvable
                        this.unresolvableRefExpr(node.value);
                    }
                }
            }
        } else {
            this.resolve(node.value, document, extraScopes);
        }
        node.$resolvedType = node.value.$resolvedType;
    }

    private unresolvableRefExpr(item: ReferenceExpr) {
        const ref = item.target as DefaultReference;
        ref._ref = this.createLinkingError({
            reference: ref,
            container: item,
            property: 'target',
        });
    }

    private findAttrParamForArg(arg: AttributeArg): AttributeParam | undefined {
        const attr = arg.$container.decl.ref;
        if (!attr) {
            return undefined;
        }
        if (arg.name) {
            return attr.params?.find((p) => p.name === arg.name);
        } else {
            const index = arg.$container.args.findIndex((a) => a === arg);
            return attr.params[index];
        }
    }

    private resolveDataModel(node: DataModel, document: LangiumDocument<AstNode>, extraScopes: ScopeProvider[]) {
        return this.resolveDefault(node, document, extraScopes);
    }

    private resolveDataModelField(
        node: DataModelField,
        document: LangiumDocument<AstNode>,
        extraScopes: ScopeProvider[]
    ) {
        // Field declaration may contain enum references, and enum fields are pushed to the global
        // scope, so if there're enums with fields with the same name, an arbitrary one will be
        // used as resolution target. The correct behavior is to resolve to the enum that's used
        // as the declaration type of the field:
        //
        // enum FirstEnum {
        //     E1
        //     E2
        // }

        // enum SecondEnum  {
        //     E1
        //     E3
        //     E4
        // }

        // model M {
        //     id Int @id
        //     first  SecondEnum @default(E1) <- should resolve to SecondEnum
        //     second FirstEnum @default(E1) <- should resolve to FirstEnum
        // }
        //

        // make sure type is resolved first
        this.resolve(node.type, document, extraScopes);

        let scopes = extraScopes;

        // if the field has enum declaration type, resolve the rest with that enum's fields on top of the scopes
        if (node.type.reference?.ref && isEnum(node.type.reference.ref)) {
            const contextEnum = node.type.reference.ref as Enum;
            const enumScope: ScopeProvider = (name) => contextEnum.fields.find((f) => f.name === name);
            scopes = [enumScope, ...scopes];
        }

        this.resolveDefault(node, document, scopes);
    }

    private resolveDefault(node: AstNode, document: LangiumDocument<AstNode>, extraScopes: ScopeProvider[]) {
        for (const [property, value] of Object.entries(node)) {
            if (!property.startsWith('$')) {
                if (isReference(value)) {
                    this.linkReference(node, property, document, extraScopes);
                }
            }
        }
        for (const child of streamContents(node)) {
            this.resolve(child, document, extraScopes);
        }
    }

    //#endregion

    //#region Utils

    private resolveToDeclaredType(node: AstNode, type: FunctionParamType | DataModelFieldType) {
        let nullable = false;
        if (isDataModelFieldType(type)) {
            nullable = type.optional;

            // referencing a field of 'Unsupported' type
            if (type.unsupported) {
                node.$resolvedType = { decl: 'Unsupported', array: type.array, nullable };
                return;
            }
        }

        if (type.type) {
            const mappedType = mapBuiltinTypeToExpressionType(type.type);
            node.$resolvedType = { decl: mappedType, array: type.array, nullable: nullable };
        } else if (type.reference) {
            node.$resolvedType = {
                decl: type.reference.ref,
                array: type.array,
                nullable: nullable,
            };
        }
    }

    private resolveToBuiltinTypeOrDecl(node: AstNode, type: ResolvedShape, array = false, nullable = false) {
        node.$resolvedType = { decl: type, array, nullable };
    }

    //#endregion
}
