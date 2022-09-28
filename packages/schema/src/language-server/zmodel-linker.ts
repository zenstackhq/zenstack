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
    AbstractDeclaration,
    DataModelField,
    isArrayExpr,
    isBinaryExpr,
    isDataModel,
    isEnumField,
    isExpression,
    isInvocationExpr,
    isLiteralExpr,
    isMemberAccessExpr,
    isReferenceExpr,
    isUnaryExpr,
} from './generated/ast';

interface DefaultReference extends Reference {
    _ref?: AstNode | LinkingError;
    _nodeDescription?: AstNodeDescription;
}

export class ZModelLinker extends DefaultLinker {
    private readonly descriptions: AstNodeDescriptionProvider;

    constructor(services: LangiumServices) {
        super(services);
        this.descriptions = services.workspace.AstNodeDescriptionProvider;
    }

    async link(
        document: LangiumDocument,
        cancelToken = CancellationToken.None
    ): Promise<void> {
        for (const node of streamContents(document.parseResult.value)) {
            await interruptAndCheck(cancelToken);
            this.resolve(node, document);
        }
        document.state = DocumentState.Linked;
    }

    resolve(node: AstNode, document: LangiumDocument) {
        type TypedNode = AstNode & {
            $resolvedType?: {
                decl?: string | AbstractDeclaration;
                array?: boolean;
            };
        };
        const _node: TypedNode = node;

        if (isExpression(node)) {
            if (isLiteralExpr(node)) {
                _node.$resolvedType = {
                    decl:
                        typeof node.value === 'string'
                            ? 'String'
                            : typeof node.value === 'boolean'
                            ? 'Boolean'
                            : typeof node.value === 'number'
                            ? 'Int'
                            : undefined,
                };
            } else if (isInvocationExpr(node)) {
                this.doLink(
                    {
                        reference: node.function,
                        container: node,
                        property: 'function',
                    },
                    document
                );
                node.args.forEach((arg) => this.resolve(arg, document));
                _node.$resolvedType = { decl: 'Boolean' };
            } else if (isArrayExpr(node)) {
                node.items.forEach((item) => this.resolve(item, document));
                _node.$resolvedType = {
                    decl: (node.items[0] as TypedNode).$resolvedType?.decl,
                    array: true,
                };
            } else if (isReferenceExpr(node)) {
                // resolve reference: enum field, data model field
                this.doLink(
                    {
                        reference: node.target,
                        container: node,
                        property: 'target',
                    },
                    document
                );

                if (node.target.ref) {
                    // resolve type
                    if (isEnumField(node.target.ref)) {
                        _node.$resolvedType = {
                            decl: node.target.ref.$container,
                        };
                    } else {
                        if (node.target.ref.type.type) {
                            _node.$resolvedType = {
                                decl: node.target.ref.type.type,
                                array: node.target.ref.type.array,
                            };
                        } else if (node.target.ref.type.reference) {
                            _node.$resolvedType = {
                                decl: node.target.ref.type.reference.ref,
                                array: node.target.ref.type.array,
                            };
                        }
                    }
                } else {
                    throw new Error(
                        `Unresolved reference: ${node.target.$refText}`
                    );
                }
            } else if (isMemberAccessExpr(node)) {
                this.resolve(node.operand, document);
                const operandResolved = (node.operand as TypedNode)
                    .$resolvedType;

                const extraScope: DataModelField[] = [];
                if (operandResolved && !operandResolved.array) {
                    if (isDataModel(operandResolved.decl)) {
                        extraScope.push(...operandResolved.decl.fields);
                    }
                }

                const fromExtraScope = extraScope.find(
                    (d) => d.name === node.member.$refText
                );
                if (fromExtraScope) {
                    const ref = node.member as DefaultReference;
                    ref._ref = fromExtraScope;
                    ref._nodeDescription = this.descriptions.createDescription(
                        fromExtraScope,
                        fromExtraScope.name,
                        document
                    );
                } else {
                    this.doLink(
                        {
                            reference: node.member,
                            container: node,
                            property: 'member',
                        },
                        document
                    );
                }
                if (node.member.ref) {
                    const targetDecl =
                        node.member.ref.type.type ||
                        node.member.ref.type.reference?.ref;
                    _node.$resolvedType = {
                        decl: targetDecl,
                        array: node.member.ref.type.array,
                    };
                } else {
                    throw new Error(
                        `Unresolved member: ${node.member.$refText}`
                    );
                }
            } else if (isBinaryExpr(node)) {
                this.resolve(node.left, document);
                this.resolve(node.right, document);
                switch (node.operator) {
                    case '+':
                    case '-':
                    case '*':
                    case '/':
                        _node.$resolvedType = { decl: 'Int' };
                        break;

                    case '>':
                    case '>=':
                    case '<':
                    case '<=':
                    case '==':
                    case '!=':
                    case '&&':
                    case '||':
                        _node.$resolvedType = { decl: 'Boolean' };
                        break;
                }
            } else if (isUnaryExpr(node)) {
                this.resolve(node.arg, document);
                _node.$resolvedType = (node.arg as TypedNode).$resolvedType;
            }
        } else {
            for (const property of Object.keys(node)) {
                if (!property.startsWith('$')) {
                    const value = (node as any)[property];
                    if (isReference(value)) {
                        const info = {
                            reference: value,
                            container: node,
                            property,
                        };
                        this.doLink(info, document);
                    }
                }
            }
            for (const child of streamContents(node)) {
                this.resolve(child, document);
            }
        }
    }
}
