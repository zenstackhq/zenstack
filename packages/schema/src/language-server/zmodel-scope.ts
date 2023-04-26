import { isEnumField, isModel } from '@zenstackhq/language/ast';
import {
    AstNode,
    AstNodeDescription,
    DefaultScopeComputation,
    DefaultScopeProvider,
    EMPTY_SCOPE,
    equalURI,
    getContainerOfType,
    interruptAndCheck,
    LangiumDocument,
    LangiumServices,
    ReferenceInfo,
    Scope,
    stream,
    streamAllContents,
    StreamScope,
} from 'langium';
import { CancellationToken } from 'vscode-jsonrpc';
import { resolveImportUri } from '../utils/ast-utils';
import { STD_LIB_MODULE_NAME } from './constants';

/**
 * Custom Langium ScopeComputation implementation which adds enum fields into global scope
 */
export class ZModelScopeComputation extends DefaultScopeComputation {
    constructor(private readonly services: LangiumServices) {
        super(services);
    }

    async computeExports(
        document: LangiumDocument<AstNode>,
        cancelToken?: CancellationToken | undefined
    ): Promise<AstNodeDescription[]> {
        const result = await super.computeExports(document, cancelToken);

        // add enum fields so they can be globally resolved across modules
        for (const node of streamAllContents(document.parseResult.value)) {
            if (cancelToken) {
                await interruptAndCheck(cancelToken);
            }
            if (isEnumField(node)) {
                const desc = this.services.workspace.AstNodeDescriptionProvider.createDescription(
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

export class ZModelScopeProvider extends DefaultScopeProvider {
    constructor(services: LangiumServices) {
        super(services);
    }

    protected override getGlobalScope(referenceType: string, context: ReferenceInfo): Scope {
        const model = getContainerOfType(context.container, isModel);
        if (!model) {
            return EMPTY_SCOPE;
        }
        const importedUris = stream(model.imports).map(resolveImportUri).nonNullable();
        const importedElements = this.indexManager.allElements(referenceType).filter(
            (des) =>
                // allow current document
                equalURI(des.documentUri, model.$document?.uri) ||
                // allow stdlib
                des.documentUri.path.endsWith(STD_LIB_MODULE_NAME) ||
                // allow imported documents
                importedUris.some((importedUri) => (des.documentUri, importedUri))
        );
        return new StreamScope(importedElements);
    }
}
