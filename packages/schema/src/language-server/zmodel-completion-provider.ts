import {
    DataModelAttribute,
    DataModelFieldAttribute,
    ReferenceExpr,
    StringLiteral,
    isArrayExpr,
    isAttribute,
    isDataModel,
    isDataModelAttribute,
    isDataModelField,
    isDataModelFieldAttribute,
    isEnum,
    isEnumField,
    isFunctionDecl,
    isInvocationExpr,
    isMemberAccessExpr,
} from '@zenstackhq/language/ast';
import { ZModelCodeGenerator, getAttribute, isEnumFieldReference, isFromStdlib } from '@zenstackhq/sdk';
import {
    AstNode,
    AstNodeDescription,
    CompletionAcceptor,
    CompletionContext,
    CompletionProviderOptions,
    CompletionValueItem,
    DefaultCompletionProvider,
    LangiumDocument,
    LangiumServices,
    MaybePromise,
    NextFeature,
} from 'langium';
import { P, match } from 'ts-pattern';
import { CompletionItemKind, CompletionList, CompletionParams, MarkupContent } from 'vscode-languageserver';

export class ZModelCompletionProvider extends DefaultCompletionProvider {
    constructor(private readonly services: LangiumServices) {
        super(services);
    }

    readonly completionOptions?: CompletionProviderOptions = {
        triggerCharacters: ['@', '(', ',', '.'],
    };

    override async getCompletion(
        document: LangiumDocument,
        params: CompletionParams
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
        acceptor: CompletionAcceptor
    ): MaybePromise<void> {
        if (isDataModelAttribute(context.node) || isDataModelFieldAttribute(context.node)) {
            const completions = this.getCompletionFromHint(context.node);
            if (completions) {
                completions.forEach(acceptor);
                return;
            }
        }
        return super.completionFor(context, next, acceptor);
    }

    private getCompletionFromHint(
        contextNode: DataModelAttribute | DataModelFieldAttribute
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
    private getUnfilledAttributeParams(contextNode: DataModelAttribute | DataModelFieldAttribute) {
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
        acceptor: CompletionAcceptor
    ): MaybePromise<void> {
        if (crossRef.property === 'member' && !isMemberAccessExpr(context.node)) {
            // for guarding an error in the base implementation
            return;
        }

        const customAcceptor = (item: CompletionValueItem) => {
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
                    (isDataModelAttribute(context.node) || isDataModelFieldAttribute(context.node)) &&
                    !this.filterAttributeApplicationCompletion(context.node, node)
                ) {
                    // node not matching attribute context
                    return;
                }
            }
            acceptor(item);
        };

        super.completionForCrossReference(context, crossRef, customAcceptor);
    }

    override completionForKeyword(
        context: CompletionContext,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        keyword: any,
        acceptor: CompletionAcceptor
    ): MaybePromise<void> {
        const customAcceptor = (item: CompletionValueItem) => {
            if (!this.filterKeywordForContext(context, keyword.value)) {
                return;
            }
            acceptor(item);
        };
        super.completionForKeyword(context, keyword, customAcceptor);
    }

    private filterKeywordForContext(context: CompletionContext, keyword: string) {
        if (isInvocationExpr(context.node)) {
            return ['true', 'false', 'null', 'this'].includes(keyword);
        } else if (isDataModelAttribute(context.node) || isDataModelFieldAttribute(context.node)) {
            const exprContext = this.getAttributeContextType(context.node);
            if (exprContext === 'DefaultValue') {
                return ['true', 'false', 'null'].includes(keyword);
            } else {
                return ['true', 'false', 'null', 'this'].includes(keyword);
            }
        } else {
            return true;
        }
    }

    private filterAttributeApplicationCompletion(
        contextNode: DataModelAttribute | DataModelFieldAttribute,
        node: AstNode
    ) {
        const attrContextType = this.getAttributeContextType(contextNode);

        if (isFunctionDecl(node) && attrContextType) {
            // functions are excluded if they are not allowed in the current context
            const funcExprContextAttr = getAttribute(node, '@@@expressionContext');
            if (funcExprContextAttr && funcExprContextAttr.args[0]) {
                const arg = funcExprContextAttr.args[0];
                if (isArrayExpr(arg.value)) {
                    return arg.value.items.some(
                        (item) =>
                            isEnumFieldReference(item) && (item as ReferenceExpr).target.$refText === attrContextType
                    );
                }
            }
            return false;
        }

        if (isDataModelField(node)) {
            // model fields are not allowed in @default
            return attrContextType !== 'DefaultValue';
        }

        return true;
    }

    private getAttributeContextType(node: DataModelAttribute | DataModelFieldAttribute) {
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
                detail: 'Data model',
                sortText: '1',
                documentation,
            }))
            .when(isDataModelField, () => ({
                nodeDescription,
                kind: CompletionItemKind.Field,
                detail: 'Data model field',
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
            .when(isEnumField, () => ({
                nodeDescription,
                kind: CompletionItemKind.Enum,
                detail: 'Enum value',
                sortText: '1',
                documentation,
            }))
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
            const doc = this.services.shared.workspace.LangiumDocuments.getOrCreateDocument(
                nodeDescription.documentUri
            );
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
                    const zModelGenerator = new ZModelCodeGenerator();
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
                .when(isDataModelField, (field) => {
                    docs.push(`${field.name}: ${field.type.type ?? field.type.reference?.$refText}`);
                })
                .otherwise((ast) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
