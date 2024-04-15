import { AbstractFormatter, AstNode, Formatting, LangiumDocument } from 'langium';

import * as ast from '@zenstackhq/language/ast';
import { FormattingOptions, Range, TextEdit } from 'vscode-languageserver';

export class ZModelFormatter extends AbstractFormatter {
    private formatOptions?: FormattingOptions;
    private isPrismaStyle = true;
    protected format(node: AstNode): void {
        const formatter = this.getNodeFormatter(node);

        if (ast.isDataModelField(node)) {
            if (this.isPrismaStyle && ast.isDataModel(node.$container)) {
                const dataModel = node.$container;

                const compareFn = (a: number, b: number) => b - a;
                const maxNameLength = dataModel.fields.map((x) => x.name.length).sort(compareFn)[0];
                const maxTypeLength = dataModel.fields.map(this.getFieldTypeLength).sort(compareFn)[0];

                formatter.property('type').prepend(Formatting.spaces(maxNameLength - node.name.length + 1));
                if (node.attributes.length > 0) {
                    formatter
                        .node(node.attributes[0])
                        .prepend(Formatting.spaces(maxTypeLength - this.getFieldTypeLength(node) + 1));

                    formatter.nodes(...node.attributes.slice(1)).prepend(Formatting.oneSpace());
                }
            } else {
                formatter.property('type').prepend(Formatting.oneSpace());
                if (node.attributes.length > 0) {
                    formatter.properties('attributes').prepend(Formatting.oneSpace());
                }
            }
        } else if (ast.isDataModelFieldAttribute(node)) {
            formatter.keyword('(').surround(Formatting.noSpace());
            formatter.keyword(')').prepend(Formatting.noSpace());
            formatter.keyword(',').append(Formatting.oneSpace());
            if (node.args.length > 1) {
                formatter.nodes(...node.args.slice(1)).prepend(Formatting.oneSpace());
            }
        } else if (ast.isAttributeArg(node)) {
            formatter.keyword(':').prepend(Formatting.noSpace());
            formatter.keyword(':').append(Formatting.oneSpace());
        } else if (ast.isAbstractDeclaration(node)) {
            const bracesOpen = formatter.keyword('{');
            const bracesClose = formatter.keyword('}');
            // allow extra blank lines between declarations
            formatter.interior(bracesOpen, bracesClose).prepend(Formatting.indent({ allowMore: true }));
            bracesOpen.prepend(Formatting.oneSpace());
            bracesClose.prepend(Formatting.newLine());
        } else if (ast.isModel(node)) {
            const model = node as ast.Model;
            const nodes = formatter.nodes(...model.declarations);
            nodes.prepend(Formatting.noIndent());
        }
    }

    protected override doDocumentFormat(
        document: LangiumDocument<AstNode>,
        options: FormattingOptions,
        range?: Range | undefined
    ): TextEdit[] {
        this.formatOptions = options;
        return super.doDocumentFormat(document, options, range);
    }

    public getFormatOptions(): FormattingOptions | undefined {
        return this.formatOptions;
    }

    public getIndent() {
        return 1;
    }

    public setPrismaStyle(isPrismaStyle: boolean) {
        this.isPrismaStyle = isPrismaStyle;
    }

    private getFieldTypeLength(field: ast.DataModelField) {
        let length = (field.type.type || field.type.reference?.$refText)!.length;

        if (field.type.optional) {
            length += 1;
        }

        if (field.type.array) {
            length += 2;
        }

        return length;
    }
}
