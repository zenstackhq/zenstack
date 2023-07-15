import { getDefaultModelMeta } from '@zenstackhq/runtime/enhancements/model-meta';
import { ModelMeta } from '@zenstackhq/runtime/enhancements/types';

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
