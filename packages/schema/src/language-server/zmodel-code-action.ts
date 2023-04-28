import { DataModel, DataModelField, Model, isDataModel } from '@zenstackhq/language/ast';
import {
    AstReflection,
    CodeActionProvider,
    getDocument,
    IndexManager,
    LangiumDocument,
    LangiumDocuments,
    LangiumServices,
    MaybePromise,
} from 'langium';

import { CodeAction, CodeActionKind, CodeActionParams, Command, Diagnostic } from 'vscode-languageserver';
import { IssueCodes } from './constants';
import { ZModelFormatter } from './zmodel-formatter';
import { MissingOppositeRelationData } from './validator/datamodel-validator';

export class ZModelCodeActionProvider implements CodeActionProvider {
    protected readonly reflection: AstReflection;
    protected readonly indexManager: IndexManager;
    protected readonly formatter: ZModelFormatter;
    protected readonly documents: LangiumDocuments;

    constructor(services: LangiumServices) {
        this.reflection = services.shared.AstReflection;
        this.indexManager = services.shared.workspace.IndexManager;
        this.formatter = services.lsp.Formatter as ZModelFormatter;
        this.documents = services.shared.workspace.LangiumDocuments;
    }

    getCodeActions(
        document: LangiumDocument,
        params: CodeActionParams
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
        const data = diagnostic.data as MissingOppositeRelationData;

        const rootCst =
            data.relationFieldDocUri == document.textDocument.uri
                ? document.parseResult.value
                : this.documents.all.find((doc) => doc.textDocument.uri === data.relationFieldDocUri)?.parseResult
                      .value;

        if (rootCst) {
            const fieldModel = rootCst as Model;
            const fieldAstNode = (
                fieldModel.declarations.find(
                    (x) => isDataModel(x) && x.name === data.relationDataModelName
                ) as DataModel
            )?.fields.find((x) => x.name === data.relationFieldName) as DataModelField;

            if (!fieldAstNode) return undefined;

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const oppositeModel = fieldAstNode.type.reference!.ref! as DataModel;

            const lastField = oppositeModel.fields[oppositeModel.fields.length - 1];

            const currentModel = document.parseResult.value as Model;

            const container = currentModel.declarations.find(
                (decl) => decl.name === data.dataModelName && isDataModel(decl)
            ) as DataModel;

            if (container && container.$cstNode) {
                // indent
                let indent = '\t';
                const formatOptions = this.formatter.getFormatOptions();
                if (formatOptions?.insertSpaces) {
                    indent = ' '.repeat(formatOptions.tabSize);
                }
                indent = indent.repeat(this.formatter.getIndent());

                let newText = '';
                if (fieldAstNode.type.array) {
                    //post Post[]
                    const idField = container.$resolvedFields.find((f) =>
                        f.attributes.find((attr) => attr.decl.ref?.name === '@id')
                    ) as DataModelField;

                    // if no id field, we can't generate reference
                    if (!idField) {
                        return undefined;
                    }

                    const typeName = container.name;
                    const fieldName = this.lowerCaseFirstLetter(typeName);

                    // might already exist
                    let referenceField = '';

                    const idFieldName = idField.name;
                    const referenceIdFieldName = fieldName + this.upperCaseFirstLetter(idFieldName);

                    if (!oppositeModel.$resolvedFields.find((f) => f.name === referenceIdFieldName)) {
                        referenceField = '\n' + indent + `${referenceIdFieldName} ${idField.type.type}`;
                    }

                    newText =
                        '\n' +
                        indent +
                        `${fieldName} ${typeName} @relation(fields: [${referenceIdFieldName}], references: [${idFieldName}])` +
                        referenceField;
                } else {
                    // user User @relation(fields: [userAbc], references: [id])
                    const typeName = container.name;
                    const fieldName = this.lowerCaseFirstLetter(typeName);
                    newText = '\n' + indent + `${fieldName} ${typeName}[]`;
                }

                // the opposite model might be in the imported file
                const targetDocument = getDocument(oppositeModel);

                return {
                    title: `Add opposite relation fields on ${oppositeModel.name}`,
                    kind: CodeActionKind.QuickFix,
                    diagnostics: [diagnostic],
                    isPreferred: false,
                    edit: {
                        changes: {
                            [targetDocument.textDocument.uri]: [
                                {
                                    range: {
                                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                                        start: lastField.$cstNode!.range.end,
                                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                                        end: lastField.$cstNode!.range.end,
                                    },
                                    newText,
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
