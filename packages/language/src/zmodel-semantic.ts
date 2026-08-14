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
    isAttributeParamType,
    isUnaryExpr,
    isBinaryExpr,
    isBooleanLiteral,
    isNumberLiteral,
    isNullExpr,
    isCollectionPredicateBinding,
    isFunctionParam,
    isAttributeParam,
    isProcedureParam,
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
        } else if (isDataSource(node) || isGeneratorDecl(node) || isPlugin(node) || isTypeDef(node)) {
            acceptor({
                node,
                property: 'name',
                type: SemanticTokenTypes.type,
            });
        } else if (isDataField(node) || isConfigField(node) || isPluginField(node)) {
            acceptor({
                node,
                property: 'name',
                type: SemanticTokenTypes.property,
            });
        } else if (isDataFieldType(node) || isFunctionParamType(node) || isAttributeParamType(node)) {
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
                type: SemanticTokenTypes.decorator,
            });

            if (node.decl.$refText === '@regex' && node.args[0]) {
                acceptor({
                    node: node.args[0],
                    property: 'value',
                    type: SemanticTokenTypes.regexp,
                });
            }
        } else if (isAttribute(node)) {
            acceptor({
                node,
                property: 'name',
                type: SemanticTokenTypes.decorator,
            });
        } else if (isInvocationExpr(node)) {
            acceptor({
                node,
                property: 'function',
                type: SemanticTokenTypes.function,
            });
        } else if (isFunctionDecl(node) || isProcedure(node)) {
            acceptor({
                node,
                property: 'name',
                type: SemanticTokenTypes.function,
            });

            if ('mutation' in node && node.mutation) {
                acceptor({
                    node,
                    property: 'mutation',
                    type: SemanticTokenTypes.modifier,
                });
            }
        } else if (isReferenceExpr(node)) {
            acceptor({
                node,
                property: 'target',
                type: SemanticTokenTypes.property,
            });
        } else if (isMemberAccessExpr(node)) {
            acceptor({
                node,
                property: 'member',
                type: SemanticTokenTypes.property,
            });
        } else if (isNumberLiteral(node)) {
            acceptor({
                node,
                property: 'value',
                type: SemanticTokenTypes.number,
            });
        } else if (isBooleanLiteral(node) || isNullExpr(node)) {
            acceptor({
                node,
                property: 'value',
                type: SemanticTokenTypes.keyword,
            });
        } else if (isUnaryExpr(node) || isBinaryExpr(node)) {
            acceptor({
                node,
                property: 'operator',
                type: SemanticTokenTypes.operator,
            });
        } else if (isEnumField(node)) {
            acceptor({
                node,
                property: 'name',
                type: SemanticTokenTypes.enumMember,
            });
        } else if (isEnum(node)) {
            acceptor({
                node,
                property: 'name',
                type: SemanticTokenTypes.enum,
            });
        } else if (isFunctionParam(node) || isAttributeArg(node) || isAttributeParam(node) || isProcedureParam(node)) {
            acceptor({
                node,
                property: 'name',
                type: SemanticTokenTypes.parameter,
            });
        } else if (isCollectionPredicateBinding(node)) {
            acceptor({
                node,
                property: 'name',
                type: SemanticTokenTypes.variable,
            });
        }
    }
}
