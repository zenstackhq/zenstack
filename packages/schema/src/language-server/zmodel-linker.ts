import {
    AstNode,
    AstNodeDescription,
    AstNodeDescriptionProvider,
    DefaultLinker,
    DocumentState,
    interruptAndCheck,
    isReference,
    LangiumDocument,
    LangiumServices,
    LinkingError,
    Reference,
    streamContents,
} from 'langium';
import { CancellationToken } from 'vscode-jsonrpc';
import {
    ArrayExpr,
    AttributeArg,
    BinaryExpr,
    DataModel,
    DataModelField,
    DataModelFieldType,
    EnumField,
    Function,
    FunctionParam,
    FunctionParamType,
    InvocationExpr,
    isDataModel,
    LiteralExpr,
    MemberAccessExpr,
    NullExpr,
    ReferenceExpr,
    ReferenceTarget,
    ThisExpr,
    UnaryExpr,
    ResolvedShape,
} from '@zenstackhq/language/ast';
import { getContainingModel, isFromStdlib } from './utils';
import { mapBuiltinTypeToExpressionType } from './validator/utils';

interface DefaultReference extends Reference {
    _ref?: AstNode | LinkingError;
    _nodeDescription?: AstNodeDescription;
}

type ScopeProvider = (name: string) => ReferenceTarget | undefined;

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
        if (!this.resolveFromScopeProviders(container, property, document, extraScopes)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const reference: Reference<AstNode> = (container as any)[property];
            this.doLink({ reference, container, property }, document);
        }
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
                return target;
            }
        }
        return null;
    }

    private resolve(node: AstNode, document: LangiumDocument, extraScopes: ScopeProvider[] = []) {
        switch (node.$type) {
            case LiteralExpr:
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

            case ThisExpr:
                this.resolveThis(node as ThisExpr, document, extraScopes);
                break;

            case NullExpr:
                this.resolveNull(node as NullExpr, document, extraScopes);
                break;

            case 'AttributeArg':
                this.resolveAttributeArg(node as AttributeArg, document, extraScopes);
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
        node.$resolvedType = node.operand.$resolvedType;
    }

    private resolveReference(node: ReferenceExpr, document: LangiumDocument<AstNode>, extraScopes: ScopeProvider[]) {
        this.linkReference(node, 'target', document, extraScopes);
        node.args.forEach((arg) => this.resolve(arg, document, extraScopes));

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

        const itemType = node.items[0].$resolvedType;
        if (itemType?.decl) {
            this.resolveToBuiltinTypeOrDecl(node, itemType.decl, true);
        }
    }

    private resolveInvocation(node: InvocationExpr, document: LangiumDocument, extraScopes: ScopeProvider[]) {
        this.linkReference(node, 'function', document, extraScopes);
        node.args.forEach((arg) => this.resolve(arg, document, extraScopes));
        if (node.function.ref) {
            // eslint-disable-next-line @typescript-eslint/ban-types
            const funcDecl = node.function.ref as Function;
            if (funcDecl.name === 'auth' && isFromStdlib(funcDecl)) {
                // auth() function is resolved to User model in the current document
                const model = getContainingModel(node);
                const userModel = model?.declarations.find((d) => isDataModel(d) && d.name === 'User');
                if (userModel) {
                    node.$resolvedType = { decl: userModel };
                }
            } else {
                this.resolveToDeclaredType(node, funcDecl.returnType);
            }
        }
    }

    private resolveLiteral(node: LiteralExpr) {
        const type =
            typeof node.value === 'string'
                ? 'String'
                : typeof node.value === 'boolean'
                ? 'Boolean'
                : typeof node.value === 'number'
                ? 'Int'
                : undefined;

        if (type) {
            this.resolveToBuiltinTypeOrDecl(node, type);
        }
    }

    private resolveMemberAccess(
        node: MemberAccessExpr,
        document: LangiumDocument<AstNode>,
        extraScopes: ScopeProvider[]
    ) {
        this.resolve(node.operand, document, extraScopes);
        const operandResolved = node.operand.$resolvedType;

        if (operandResolved && !operandResolved.array && isDataModel(operandResolved.decl)) {
            const modelDecl = operandResolved.decl as DataModel;
            const provider = (name: string) => modelDecl.fields.find((f) => f.name === name);
            extraScopes = [provider, ...extraScopes];
        }

        this.linkReference(node, 'member', document, extraScopes);
        if (node.member.ref) {
            this.resolveToDeclaredType(node, node.member.ref.type);
        }
    }

    private resolveCollectionPredicate(node: BinaryExpr, document: LangiumDocument, extraScopes: ScopeProvider[]) {
        this.resolve(node.left, document, extraScopes);

        const resolvedType = node.left.$resolvedType;
        if (resolvedType && isDataModel(resolvedType.decl) && resolvedType.array) {
            const dataModelDecl = resolvedType.decl;
            const provider = (name: string) => dataModelDecl.fields.find((f) => f.name === name);
            extraScopes = [provider, ...extraScopes];
            this.resolve(node.right, document, extraScopes);
            this.resolveToBuiltinTypeOrDecl(node, 'Boolean');
        } else {
            // error is reported in validation pass
        }
    }

    private resolveThis(
        node: ThisExpr,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        document: LangiumDocument<AstNode>,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        extraScopes: ScopeProvider[]
    ) {
        let decl: AstNode | undefined = node.$container;

        while (decl && !isDataModel(decl)) {
            decl = decl.$container;
        }

        if (decl) {
            this.resolveToBuiltinTypeOrDecl(node, decl);
        }
    }

    private resolveNull(
        node: NullExpr,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        document: LangiumDocument<AstNode>,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        extraScopes: ScopeProvider[]
    ) {
        // TODO: how to really resolve null?
        this.resolveToBuiltinTypeOrDecl(node, 'Null');
    }

    private resolveAttributeArg(node: AttributeArg, document: LangiumDocument<AstNode>, extraScopes: ScopeProvider[]) {
        this.resolve(node.value, document, extraScopes);
        node.$resolvedType = node.value.$resolvedType;
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
        if (type.type) {
            const mappedType = mapBuiltinTypeToExpressionType(type.type);
            node.$resolvedType = { decl: mappedType, array: type.array };
        } else if (type.reference) {
            node.$resolvedType = {
                decl: type.reference.ref,
                array: type.array,
            };
        }
    }

    private resolveToBuiltinTypeOrDecl(node: AstNode, type: ResolvedShape, array = false) {
        node.$resolvedType = { decl: type, array };
    }

    //#endregion
}
