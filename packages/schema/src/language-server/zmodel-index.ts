import {
    AstNodeDescription,
    DefaultAstNodeDescriptionProvider,
    interruptAndCheck,
    LangiumDocument,
    LangiumServices,
    streamAllContents,
} from 'langium';
import { CancellationToken } from 'vscode-languageserver';
import { isEnumField } from './generated/ast';

export class ZModelDescriptionProvider extends DefaultAstNodeDescriptionProvider {
    constructor(services: LangiumServices) {
        super(services);
    }

    async createDescriptions(
        document: LangiumDocument,
        cancelToken = CancellationToken.None
    ): Promise<AstNodeDescription[]> {
        const descr = await super.createDescriptions(document, cancelToken);
        // add enum fields so they can be globally resolved across modules
        for (const node of streamAllContents(document.parseResult.value)) {
            await interruptAndCheck(cancelToken);
            if (isEnumField(node)) {
                await descr.push(
                    this.createDescription(node, node.name, document)
                );
            }
        }
        return descr;
    }
}
