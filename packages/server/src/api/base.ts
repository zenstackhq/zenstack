import { ModelMeta, getDefaultModelMeta } from '@zenstackhq/runtime';

/**
 * Base class for API handlers
 */
export abstract class APIHandlerBase {
    // model meta loaded from default location
    protected readonly defaultModelMeta: ModelMeta | undefined;

    constructor() {
        try {
            this.defaultModelMeta = getDefaultModelMeta();
        } catch {
            // noop
        }
    }
}
