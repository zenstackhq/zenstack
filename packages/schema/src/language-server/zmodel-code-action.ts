import { DataModel, DataModelField, isDataModel } from '@zenstackhq/language/ast';
import {
    AstReflection,
    CodeActionProvider,
    findDeclarationNodeAtOffset,
    getContainerOfType,
    IndexManager,
    LangiumDocument,
    LangiumServices,
    MaybePromise,
} from 'langium';

import {
    CancellationToken,
    CodeAction,
    CodeActionKind,
    CodeActionParams,
    Command,
    Diagnostic,
} from 'vscode-languageserver';
import { IssueCodes } from './constants';
import { ZModelFormatter } from './zmodel-formatter';

export class ZModelCodeActionProvider implements CodeActionProvider {
    protected readonly reflection: AstReflection;
    protected readonly indexManager: IndexManager;
    protected readonly formatter: ZModelFormatter;

    constructor(services: LangiumServices) {
        this.reflection = services.shared.AstReflection;
        this.indexManager = services.shared.workspace.IndexManager;
        this.formatter = services.lsp.Formatter as ZModelFormatter;
    }

    getCodeActions(
        document: LangiumDocument,
        params: CodeActionParams,
        cancelToken?: CancellationToken
    ): MaybePromise<Array<Command | CodeAction> | undefined> {
        const result: CodeAction[] = [];
        const acceptor = (ca: CodeAction | undefined) => ca && result.push(ca);
        for (const diagnostic of params.context.diagnostics) {
            this.createCodeActions(diagnostic, document, acceptor);
        }
        return result;
    }

    private createCodeActions(
        diagnostic: Diagnostic,
        document: LangiumDocument,
        accept: (ca: CodeAction | undefined) => void
    ) {
        switch (diagnostic.code) {
            case IssueCodes.MissingOppositeRelation:
                accept(this.fixMissingOppositeRelation(diagnostic, document));
        }

        return undefined;
    }

    private fixMissingOppositeRelation(diagnostic: Diagnostic, document: LangiumDocument): CodeAction | undefined {
        const offset = document.textDocument.offsetAt(diagnostic.range.start);
        const rootCst = document.parseResult.value.$cstNode;

        if (rootCst) {
            const cstNode = findDeclarationNodeAtOffset(rootCst, offset);

            const astNode = cstNode?.element as DataModelField;

            const oppositeModel = astNode.type.reference!.ref! as DataModel;

            const lastField = oppositeModel.fields[oppositeModel.fields.length - 1];

            const container = getContainerOfType(cstNode?.element, isDataModel) as DataModel;

            const idField = container.fields.find((f) =>
                f.attributes.find((attr) => attr.decl.ref?.name === '@id')
            ) as DataModelField;

            if (container && container.$cstNode && idField) {
                // indent
                let indent = '\t';
                const formatOptions = this.formatter.getFormatOptions();
                if (formatOptions?.insertSpaces) {
                    indent = ' '.repeat(formatOptions.tabSize);
                }
                indent = indent.repeat(this.formatter.getIndent());

                const typeName = container.name;
                const fieldName = this.lowerCaseFirstLetter(typeName);

                // might already exist
                let referenceField = '';

                const idFieldName = idField.name;
                const referenceIdFieldName = fieldName + this.upperCaseFirstLetter(idFieldName);

                if (!oppositeModel.fields.find((f) => f.name === referenceIdFieldName)) {
                    referenceField = '\n' + indent + `${referenceIdFieldName} ${idField.type.type}`;
                }

                return {
                    title: `Add opposite relation fields on ${oppositeModel.name}`,
                    kind: CodeActionKind.QuickFix,
                    diagnostics: [diagnostic],
                    isPreferred: false,
                    edit: {
                        changes: {
                            [document.textDocument.uri]: [
                                {
                                    range: {
                                        start: lastField.$cstNode!.range.end,
                                        end: lastField.$cstNode!.range.end,
                                    },
                                    newText:
                                        '\n' +
                                        indent +
                                        `${fieldName} ${typeName} @relation(fields: [${referenceIdFieldName}], references: [${idFieldName}], onDelete: Cascade)` +
                                        referenceField,
                                },
                            ],
                        },
                    },
                };
            }
        }

        return undefined;
    }

    private lowerCaseFirstLetter(str: string) {
        return str.charAt(0).toLowerCase() + str.slice(1);
    }

    private upperCaseFirstLetter(str: string) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}
