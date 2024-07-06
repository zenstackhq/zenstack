import {
    AbstractFormatter,
    AstNode,
    ConfigurationProvider,
    Formatting,
    LangiumDocument,
    LangiumServices,
    MaybePromise,
} from 'langium';

import * as ast from '@zenstackhq/language/ast';
import { DocumentFormattingParams, FormattingOptions, TextEdit } from 'vscode-languageserver';
import { ZModelLanguageMetaData } from '@zenstackhq/language/generated/module';

export class ZModelFormatter extends AbstractFormatter {
    private formatOptions?: FormattingOptions;
    private isPrismaStyle = true;

    protected readonly configurationProvider: ConfigurationProvider;

    constructor(services: LangiumServices) {
        super();
        this.configurationProvider = services.shared.workspace.ConfigurationProvider;
    }

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

    override formatDocument(
        document: LangiumDocument<AstNode>,
        params: DocumentFormattingParams
    ): MaybePromise<TextEdit[]> {
        this.formatOptions = params.options;

        this.configurationProvider.getConfiguration(ZModelLanguageMetaData.languageId, 'format').then((config) => {
            // in the CLI case, the config is undefined
            if (config) {
                if (config.usePrismaStyle === false) {
                    this.setPrismaStyle(false);
                } else {
                    this.setPrismaStyle(true);
                }
            }
        });

        return super.formatDocument(document, params);
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
        let length: number;

        if (field.type.type) {
            length = field.type.type.length;
        } else if (field.type.reference) {
            length = field.type.reference.$refText.length;
        } else if (field.type.unsupported) {
            const name = `Unsupported("${field.type.unsupported.value.value}")`;
            length = name.length;
        } else {
            // we shouldn't get here
            length = 1;
        }

        if (field.type.optional) {
            length += 1;
        }

        if (field.type.array) {
            length += 2;
        }

        return length;
    }
}
