import {
    DefaultScopeComputation,
    LangiumDocument,
    LangiumServices,
    PrecomputedScopes,
    streamAllContents,
} from 'langium';
import { CancellationToken } from 'vscode-jsonrpc';
import { Model, isEnum, Enum, isReferenceExpr } from './generated/ast';

export class ZModelScopeComputation extends DefaultScopeComputation {
    constructor(services: LangiumServices) {
        super(services);
    }

    async computeScope(
        document: LangiumDocument,
        cancelToken = CancellationToken.None
    ): Promise<PrecomputedScopes> {
        const scopes = await super.computeScope(document, cancelToken);

        const model = document.parseResult.value as Model;
        const enumDecls = model.declarations.filter((d) => isEnum(d)) as Enum[];

        const qualifiedEnumFieldDescriptions = enumDecls
            .map((enumDecl) =>
                enumDecl.fields.map((enumField) =>
                    this.descriptions.createDescription(
                        enumField,
                        enumDecl.name + '.' + enumField.name,
                        document
                    )
                )
            )
            .flat();

        // add enum fields' qualified names to scopes of containers of any ReferenceExpr so that
        // fully qualified references can be resolved
        const allDecls = streamAllContents(model)
            .filter((node) => isReferenceExpr(node) && node.$container)
            .map((node) => node.$container!)
            .distinct();

        allDecls.forEach((decl) => {
            qualifiedEnumFieldDescriptions.forEach((desc) =>
                scopes.add(decl, desc)
            );
        });

        return scopes;
    }
}
