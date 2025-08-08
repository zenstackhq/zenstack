import {
    isAliasDecl,
    isAttribute,
    isAttributeArg,
    isConfigField,
    isDataModel,
    isDataModelAttribute,
    isDataModelField,
    isDataModelFieldAttribute,
    isDataModelFieldType,
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
    isTypeDefField,
} from '@zenstackhq/language/ast';
import { AbstractSemanticTokenProvider, AstNode, SemanticTokenAcceptor } from 'langium';
import { SemanticTokenTypes } from 'vscode-languageserver';

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
                property: 'superTypes',
                type: SemanticTokenTypes.type,
            });
        } else if (isDataSource(node) || isGeneratorDecl(node) || isPlugin(node) || isEnum(node) || isTypeDef(node)) {
            acceptor({
                node,
                property: 'name',
                type: SemanticTokenTypes.type,
            });
        } else if (
            isDataModelField(node) ||
            isTypeDefField(node) ||
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
        } else if (isDataModelFieldType(node)) {
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
        } else if (isDataModelAttribute(node) || isDataModelFieldAttribute(node) || isInternalAttribute(node)) {
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
        } else if (isFunctionDecl(node) || isAliasDecl(node) || isAttribute(node)) {
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
