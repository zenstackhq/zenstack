import {
    DefaultScopeComputation,
    LangiumDocument,
    LangiumServices,
    PrecomputedScopes,
} from 'langium';
import { CancellationToken } from 'vscode-jsonrpc';

export class ZModelScopeComputation extends DefaultScopeComputation {
    constructor(services: LangiumServices) {
        super(services);
    }

    async computeScope(
        document: LangiumDocument,
        cancelToken = CancellationToken.None
    ): Promise<PrecomputedScopes> {
        // Dummy for now
        return super.computeScope(document, cancelToken);
    }
}
