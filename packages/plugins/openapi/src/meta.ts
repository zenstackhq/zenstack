import { getObjectLiteral } from '@zenstackhq/sdk';
import { DataModel } from '@zenstackhq/sdk/ast';

/**
 * Metadata for a resource, expressed by @@openapi.meta attribute.
 */
export type ModelMeta = {
    tagDescription?: string;
};

/**
 * Metadata for a resource operation, expressed by @@openapi.meta attribute.
 */
export type OperationMeta = {
    ignore?: boolean;
    method?: string;
    path?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    deprecated?: boolean;
    security?: Array<Record<string, string[]>>;
};

/**
 * Metadata for a resource, expressed by @@openapi.meta attribute.
 */
export type ResourceMeta = ModelMeta & Record<string, OperationMeta>;

export function getModelResourceMeta(model: DataModel) {
    return getObjectLiteral<ResourceMeta>(
        model.attributes.find((attr) => attr.decl.ref?.name === '@@openapi.meta')?.args[0].value
    );
}
