import {
    CstNode,
    DefinitionProvider,
    findDeclarationNodeAtOffset,
    getDocument,
    GoToLink,
    LangiumDocument,
    LangiumServices,
    MaybePromise,
    NameProvider,
} from 'langium';
import { GrammarConfig } from 'langium/lib/grammar/grammar-config';
import { References } from 'langium/lib/references/references';
import { DefinitionParams, LocationLink } from 'vscode-languageserver';

export default class ZModelDefinitionProvider implements DefinitionProvider {
    protected readonly nameProvider: NameProvider;
    protected readonly references: References;
    protected readonly grammarConfig: GrammarConfig;

    constructor(services: LangiumServices) {
        this.nameProvider = services.references.NameProvider;
        this.references = services.references.References;
        this.grammarConfig = services.parser.GrammarConfig;
    }

    getDefinition(
        document: LangiumDocument,
        params: DefinitionParams
    ): MaybePromise<LocationLink[] | undefined> {
        const rootNode = document.parseResult.value;
        if (rootNode.$cstNode) {
            const cst = rootNode.$cstNode;
            const sourceCstNode = findDeclarationNodeAtOffset(
                cst,
                document.textDocument.offsetAt(params.position),
                this.grammarConfig.nameRegexp
            );
            if (sourceCstNode) {
                return this.collectLocationLinks(sourceCstNode, params);
            }
        }
        return undefined;
    }

    protected collectLocationLinks(
        sourceCstNode: CstNode,
        _params: DefinitionParams
    ): MaybePromise<LocationLink[] | undefined> {
        const goToLink = this.findLink(sourceCstNode);
        if (goToLink) {
            if (
                !goToLink.targetDocument.textDocument.uri.endsWith(
                    'stdlib.zmodel'
                )
            ) {
                return [
                    LocationLink.create(
                        goToLink.targetDocument.textDocument.uri,
                        (goToLink.target.element.$cstNode ?? goToLink.target)
                            .range,
                        goToLink.target.range,
                        goToLink.source.range
                    ),
                ];
            }
        }
        return undefined;
    }

    protected findLink(source: CstNode): GoToLink | undefined {
        const target = this.references.findDeclarationNode(source);
        if (target?.element) {
            const targetDocument = getDocument(target.element);
            if (target && targetDocument) {
                return { source, target, targetDocument };
            }
        }
        return undefined;
    }
}
