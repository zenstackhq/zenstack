import { type AstNode, type AstNodeDescription, type LangiumDocument, type MaybePromise } from 'langium';
import {
    DefaultCompletionProvider,
    type CompletionAcceptor,
    type CompletionContext,
    type CompletionProviderOptions,
    type CompletionValueItem,
    type LangiumServices,
    type NextFeature,
} from 'langium/lsp';
import fs from 'node:fs';
import { P, match } from 'ts-pattern';
import { CompletionItemKind, CompletionList, MarkupContent, type CompletionParams } from 'vscode-languageserver';
import {
    DataFieldAttribute,
    DataModelAttribute,
    ReferenceExpr,
    StringLiteral,
    isArrayExpr,
    isAttribute,
    isDataField,
    isDataFieldAttribute,
    isDataModel,
    isDataModelAttribute,
    isEnum,
    isEnumField,
    isFunctionDecl,
    isInvocationExpr,
    isMemberAccessExpr,
    isTypeDef,
} from './ast';
import { getAttribute, isEnumFieldReference, isFromStdlib } from './utils';
import { ZModelCodeGenerator } from './zmodel-code-generator';

export class ZModelCompletionProvider extends DefaultCompletionProvider {
    constructor(private readonly services: LangiumServices) {
        super(services);
    }

    override readonly completionOptions?: CompletionProviderOptions = {
        triggerCharacters: ['@', '(', ',', '.'],
    };

    override async getCompletion(
        document: LangiumDocument,
        params: CompletionParams,
    ): Promise<CompletionList | undefined> {
        try {
            return await super.getCompletion(document, params);
        } catch (e) {
            console.error('Completion error:', (e as Error).message);
            return undefined;
        }
    }

    override completionFor(
        context: CompletionContext,
        next: NextFeature,
        acceptor: CompletionAcceptor,
    ): MaybePromise<void> {
        if (isDataModelAttribute(context.node) || isDataFieldAttribute(context.node)) {
            const completions = this.getCompletionFromHint(context.node);
            if (completions) {
                completions.forEach((c) => acceptor(context, c));
                return;
            }
        }
        return super.completionFor(context, next, acceptor);
    }

    private getCompletionFromHint(
        contextNode: DataModelAttribute | DataFieldAttribute,
    ): CompletionValueItem[] | undefined {
        // get completion based on the hint on the next unfilled parameter
        const unfilledParams = this.getUnfilledAttributeParams(contextNode);
        const nextParam = unfilledParams[0];
        if (!nextParam) {
            return undefined;
        }

        const hintAttr = getAttribute(nextParam, '@@@completionHint');
        if (hintAttr) {
            const hint = hintAttr.args[0];
            if (hint?.value) {
                if (isArrayExpr(hint.value)) {
                    return hint.value.items.map((item) => {
                        return {
                            label: `${(item as StringLiteral).value}`,
                            kind: CompletionItemKind.Value,
                            detail: 'Parameter',
                            sortText: '0',
                        };
                    });
                }
            }
        }
        return undefined;
    }

    // TODO: this doesn't work when the file contains parse errors
    private getUnfilledAttributeParams(contextNode: DataModelAttribute | DataFieldAttribute) {
        try {
            const params = contextNode.decl.ref?.params;
            if (params) {
                const args = contextNode.args;
                let unfilledParams = [...params];
                args.forEach((arg) => {
                    if (arg.name) {
                        unfilledParams = unfilledParams.filter((p) => p.name !== arg.name);
                    } else {
                        unfilledParams.shift();
                    }
                });

                return unfilledParams;
            }
        } catch {
            // noop
        }
        return [];
    }

    override completionForCrossReference(
        context: CompletionContext,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        crossRef: any,
        acceptor: CompletionAcceptor,
    ): MaybePromise<void> {
        if (crossRef.property === 'member' && !isMemberAccessExpr(context.node)) {
            // for guarding an error in the base implementation
            return;
        }

        const customAcceptor = (context: CompletionContext, item: CompletionValueItem) => {
            // attributes starting with @@@ are for internal use only
            if (item.insertText?.startsWith('@@@') || item.label?.startsWith('@@@')) {
                return;
            }

            if ('nodeDescription' in item) {
                const node = this.getAstNode(item.nodeDescription);
                if (!node) {
                    return;
                }

                // enums in stdlib are not supposed to be referenced directly
                if ((isEnum(node) || isEnumField(node)) && isFromStdlib(node)) {
                    return;
                }

                if (
                    (isDataModelAttribute(context.node) || isDataFieldAttribute(context.node)) &&
                    !this.filterAttributeApplicationCompletion(context.node, node)
                ) {
                    // node not matching attribute context
                    return;
                }
            }
            acceptor(context, item);
        };

        return super.completionForCrossReference(context, crossRef, customAcceptor);
    }

    override completionForKeyword(
        context: CompletionContext,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        keyword: any,
        acceptor: CompletionAcceptor,
    ): MaybePromise<void> {
        const customAcceptor = (context: CompletionContext, item: CompletionValueItem) => {
            if (!this.filterKeywordForContext(context, keyword.value)) {
                return;
            }
            acceptor(context, item);
        };
        return super.completionForKeyword(context, keyword, customAcceptor);
    }

    private filterKeywordForContext(context: CompletionContext, keyword: string) {
        if (isInvocationExpr(context.node)) {
            return ['true', 'false', 'null', 'this'].includes(keyword);
        } else if (isDataModelAttribute(context.node) || isDataFieldAttribute(context.node)) {
            const exprContext = this.getAttributeContextType(context.node);
            if (exprContext === 'DefaultValue') {
                return ['true', 'false'].includes(keyword);
            } else {
                return ['true', 'false', 'null', 'this'].includes(keyword);
            }
        } else {
            return true;
        }
    }

    private filterAttributeApplicationCompletion(contextNode: DataModelAttribute | DataFieldAttribute, node: AstNode) {
        const attrContextType = this.getAttributeContextType(contextNode);

        if (isFunctionDecl(node) && attrContextType) {
            // functions are excluded if they are not allowed in the current context
            const funcExprContextAttr = getAttribute(node, '@@@expressionContext');
            if (funcExprContextAttr && funcExprContextAttr.args[0]) {
                const arg = funcExprContextAttr.args[0];
                if (isArrayExpr(arg.value)) {
                    return arg.value.items.some(
                        (item) =>
                            isEnumFieldReference(item) && (item as ReferenceExpr).target.$refText === attrContextType,
                    );
                }
            }
            return false;
        }

        if (isDataField(node)) {
            // model fields are not allowed in @default
            return attrContextType !== 'DefaultValue';
        }

        return true;
    }

    private getAttributeContextType(node: DataModelAttribute | DataFieldAttribute) {
        return match(node.decl.$refText)
            .with('@default', () => 'DefaultValue')
            .with(P.union('@@allow', '@allow', '@@deny', '@deny'), () => 'AccessPolicy')
            .with('@@validate', () => 'ValidationRule')
            .otherwise(() => undefined);
    }

    override createReferenceCompletionItem(nodeDescription: AstNodeDescription): CompletionValueItem {
        const node = this.getAstNode(nodeDescription);
        const documentation = this.getNodeDocumentation(node);

        return match(node)
            .when(isDataModel, () => ({
                nodeDescription,
                kind: CompletionItemKind.Class,
                detail: 'Model',
                sortText: '1',
                documentation,
            }))
            .when(isTypeDef, () => ({
                nodeDescription,
                kind: CompletionItemKind.Class,
                detail: 'Type',
                sortText: '1',
                documentation,
            }))
            .when(isDataField, () => ({
                nodeDescription,
                kind: CompletionItemKind.Field,
                detail: 'Field',
                sortText: '0',
                documentation,
            }))
            .when(isEnum, () => ({
                nodeDescription,
                kind: CompletionItemKind.Class,
                detail: 'Enum',
                sortText: '1',
                documentation,
            }))
            .when(isEnumField, (d) => {
                const container = d.$container;
                return {
                    nodeDescription,
                    kind: CompletionItemKind.Enum,
                    detail: `Value of enum "${container.name}"`,
                    sortText: '1',
                    documentation,
                };
            })
            .when(isFunctionDecl, () => ({
                nodeDescription,
                insertText: this.getFunctionInsertText(nodeDescription),
                kind: CompletionItemKind.Function,
                detail: 'Function',
                sortText: '1',
                documentation,
            }))
            .when(isAttribute, () => ({
                nodeDescription,
                insertText: this.getAttributeInsertText(nodeDescription),
                kind: CompletionItemKind.Property,
                detail: 'Attribute',
                sortText: '1',
                documentation,
            }))
            .otherwise(() => ({
                nodeDescription,
                kind: CompletionItemKind.Reference,
                detail: nodeDescription.type,
                sortText: '2',
                documentation,
            }));
    }

    private getFunctionInsertText(nodeDescription: AstNodeDescription): string {
        const node = this.getAstNode(nodeDescription);
        if (isFunctionDecl(node)) {
            if (node.params.some((p) => !p.optional)) {
                return nodeDescription.name;
            }
        }
        return `${nodeDescription.name}()`;
    }

    private getAttributeInsertText(nodeDescription: AstNodeDescription): string {
        const node = this.getAstNode(nodeDescription);
        if (isAttribute(node)) {
            if (node.name === '@relation') {
                return `${nodeDescription.name}(fields: [], references: [])`;
            }
        }
        return nodeDescription.name;
    }

    private getAstNode(nodeDescription: AstNodeDescription) {
        let node = nodeDescription.node;
        if (!node) {
            const doc = this.getOrCreateDocumentSync(nodeDescription);
            if (!doc) {
                return undefined;
            }
            node = this.services.workspace.AstNodeLocator.getAstNode(doc.parseResult.value, nodeDescription.path);
            if (!node) {
                return undefined;
            }
        }
        return node;
    }

    private getOrCreateDocumentSync(nodeDescription: AstNodeDescription) {
        let doc = this.services.shared.workspace.LangiumDocuments.getDocument(nodeDescription.documentUri);
        if (!doc) {
            try {
                const content = fs.readFileSync(nodeDescription.documentUri.fsPath, 'utf-8');
                doc = this.services.shared.workspace.LangiumDocuments.createDocument(
                    nodeDescription.documentUri,
                    content,
                );
            } catch {
                console.warn('Failed to read or create document:', nodeDescription.documentUri);
                return undefined;
            }
        }
        return doc;
    }

    private getNodeDocumentation(node?: AstNode): MarkupContent | undefined {
        if (!node) {
            return undefined;
        }
        const md = this.commentsToMarkdown(node);
        return {
            kind: 'markdown',
            value: md,
        };
    }

    private commentsToMarkdown(node: AstNode): string {
        const md = this.services.documentation.DocumentationProvider.getDocumentation(node) ?? '';
        const zModelGenerator = new ZModelCodeGenerator();
        const docs: string[] = [];

        try {
            match(node)
                .when(isAttribute, (attr) => {
                    docs.push('```prisma', zModelGenerator.generate(attr), '```');
                })
                .when(isFunctionDecl, (func) => {
                    docs.push('```ts', zModelGenerator.generate(func), '```');
                })
                .when(isDataModel, (model) => {
                    docs.push('```prisma', `model ${model.name} { ... }`, '```');
                })
                .when(isEnum, (enumDecl) => {
                    docs.push('```prisma', zModelGenerator.generate(enumDecl), '```');
                })
                .when(isDataField, (field) => {
                    docs.push(`${field.name}: ${field.type.type ?? field.type.reference?.$refText}`);
                })
                .otherwise((ast) => {
                    const name = (ast as any).name;
                    if (name) {
                        docs.push(name);
                    }
                });
        } catch {
            // noop
        }

        if (md) {
            docs.push('___', md);
        }
        return docs.join('\n');
    }
}
