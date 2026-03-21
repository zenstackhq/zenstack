import type { QueryOptions } from '@zenstackhq/orm';
import type { SchemaDef } from '@zenstackhq/orm/schema';
import type { OpenAPIV3_1 } from 'openapi-types';

export type CommonHandlerOptions<Schema extends SchemaDef> = {
    /** Query options that affect the behavior of the OpenAPI provider. */
    queryOptions?: QueryOptions<Schema>;
};

export type OpenApiSpecOptions = {
    /** Spec title. Defaults to 'ZenStack Generated API' */
    title?: string;

    /** Spec version. Defaults to '1.0.0' */
    version?: string;

    /** Spec description. */
    description?: string;

    /** Spec summary. */
    summary?: string;

    /**
     * When true, assumes that the schema includes access policies, and adds
     * 403 responses to operations that can potentially be rejected.
     */
    respectAccessPolicies?: boolean;
};

/**
 * Interface for generating OpenAPI specifications.
 */
export interface OpenApiSpecGenerator {
    /**
     * Generates an OpenAPI v3.1 specification document.
     */
    generateSpec(options?: OpenApiSpecOptions): Promise<OpenAPIV3_1.Document>;
}
