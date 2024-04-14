import { AbstractFormatter, AstNode, Formatting, LangiumDocument } from 'langium';

import * as ast from '@zenstackhq/language/ast';
import { FormattingOptions, Range, TextEdit } from 'vscode-languageserver';

export class ZModelFormatter extends AbstractFormatter {
    private formatOptions?: FormattingOptions;
    private isPrismaStyle = true;
    protected format(node: AstNode): void {
        const formatter = this.getNodeFormatter(node);

        if (!this.isPrismaStyle && ast.isDataModelField(node)) {
            formatter.property('type').prepend(Formatting.oneSpace());
            if (node.attributes.length > 0) {
                formatter.properties('attributes').prepend(Formatting.oneSpace());
            }
        } else if (this.isPrismaStyle && ast.isDataModel(node) && node.fields.length > 0) {
            const nodes = formatter.nodes(...node.fields);
            nodes.prepend(Formatting.noIndent());

            const compareFn = (a: number, b: number) => b - a;
            const maxNameLength = node.fields.map((x) => x.name.length).sort(compareFn)[0];
            const maxTypeLength = node.fields.map(this.getFieldTypeLength).sort(compareFn)[0];

            node.fields.forEach((field) => {
                const fieldFormatter = this.getNodeFormatter(field);
                fieldFormatter.property('type').prepend(Formatting.spaces(maxNameLength - field.name.length + 1));
                if (field.attributes.length > 0) {
                    fieldFormatter
                        .node(field.attributes[0])
                        .prepend(Formatting.spaces(maxTypeLength - this.getFieldTypeLength(field) + 1));

                    fieldFormatter.nodes(...field.attributes.slice(1)).prepend(Formatting.oneSpace());
                }
            });
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
        } else if (ast.isModel(node)) {
            const model = node as ast.Model;
            const nodes = formatter.nodes(...model.declarations);
            nodes.prepend(Formatting.noIndent());
        }

        // Should always run this no matter what formatting style it uses
        if (ast.isAbstractDeclaration(node)) {
            const bracesOpen = formatter.keyword('{');
            const bracesClose = formatter.keyword('}');
            // allow extra blank lines between declarations
            formatter.interior(bracesOpen, bracesClose).prepend(Formatting.indent({ allowMore: true }));
            bracesOpen.prepend(Formatting.oneSpace());
            bracesClose.prepend(Formatting.newLine());
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
