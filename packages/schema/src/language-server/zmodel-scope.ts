import {
    AstNode,
    DefaultScopeComputation,
    interruptAndCheck,
    LangiumDocument,
    LangiumServices,
    streamAllContents,
} from 'langium';
import { CancellationToken } from 'vscode-jsonrpc';
import { isEnumField } from './generated/ast';

export class ZModelScopeComputation extends DefaultScopeComputation {
    constructor(private readonly services: LangiumServices) {
        super(services);
    }

    async computeExports(
        document: LangiumDocument<AstNode>,
        cancelToken?: CancellationToken | undefined
    ) {
        const result = await super.computeExports(document, cancelToken);

        // add enum fields so they can be globally resolved across modules
        for (const node of streamAllContents(document.parseResult.value)) {
            if (cancelToken) {
                await interruptAndCheck(cancelToken);
            }
            if (isEnumField(node)) {
                const desc =
                    this.services.workspace.AstNodeDescriptionProvider.createDescription(
                        node,
                        node.name,
                        document
                    );
                result.push(desc);
            }
        }

        return result;
    }
}
