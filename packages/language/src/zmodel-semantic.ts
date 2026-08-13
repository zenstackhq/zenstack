import { AbstractSemanticTokenProvider, type SemanticTokenAcceptor } from 'langium/lsp';
import { SemanticTokenTypes } from 'vscode-languageserver';
import {
    isAttribute,
    isAttributeArg,
    isConfigField,
    isDataField,
    isDataFieldAttribute,
    isDataFieldType,
    isDataModel,
    isDataModelAttribute,
    isDataSource,
    isEnum,
    isEnumField,
    isFunctionDecl,
    isGeneratorDecl,
    isInternalAttribute,
    isInvocationExpr,
    isMemberAccessExpr,
    isPlugin,
    isPluginField,
    isReferenceExpr,
    isTypeDef,
    isProcedure,
    isFunctionParamType,
    type AstNode,
} from './ast';

export class ZModelSemanticTokenProvider extends AbstractSemanticTokenProvider {
    protected highlightElement(node: AstNode, acceptor: SemanticTokenAcceptor): void {
        if (isDataModel(node)) {
            acceptor({
                node,
                property: 'name',
                type: SemanticTokenTypes.type,
            });

            acceptor({
                node,
                property: 'mixins',
                type: SemanticTokenTypes.type,
            });

            acceptor({
                node,
                property: 'baseModel',
                type: SemanticTokenTypes.type,
            });
        } else if (isDataSource(node) || isGeneratorDecl(node) || isPlugin(node) || isEnum(node) || isTypeDef(node)) {
            acceptor({
                node,
                property: 'name',
                type: SemanticTokenTypes.type,
            });
        } else if (
            isDataField(node) ||
            isConfigField(node) ||
            isAttributeArg(node) ||
            isPluginField(node) ||
            isEnumField(node)
        ) {
            acceptor({
                node,
                property: 'name',
                type: SemanticTokenTypes.variable,
            });
        } else if (isDataFieldType(node) || isFunctionParamType(node)) {
            if (node.type) {
                acceptor({
                    node,
                    property: 'type',
                    type: SemanticTokenTypes.type,
                });
            } else {
                acceptor({
                    node,
                    property: 'reference',
                    type: SemanticTokenTypes.macro,
                });
            }
        } else if (isDataModelAttribute(node) || isDataFieldAttribute(node) || isInternalAttribute(node)) {
            acceptor({
                node,
                property: 'decl',
                type: SemanticTokenTypes.function,
            });
        } else if (isInvocationExpr(node)) {
            acceptor({
                node,
                property: 'function',
                type: SemanticTokenTypes.function,
            });
        } else if (isFunctionDecl(node) || isAttribute(node) || isProcedure(node)) {
            acceptor({
                node,
                property: 'name',
                type: SemanticTokenTypes.function,
            });
        } else if (isReferenceExpr(node)) {
            acceptor({
                node,
                property: 'target',
                type: SemanticTokenTypes.variable,
            });
        } else if (isMemberAccessExpr(node)) {
            acceptor({
                node,
                property: 'member',
                type: SemanticTokenTypes.property,
            });
        }
    }
}
