export interface DocMeta {
    category?: string;
    since?: string;
    deprecated?: string;
}

export interface RenderOptions {
    includeRelationships: boolean;
    includePolicies: boolean;
    includeValidation: boolean;
    includeIndexes: boolean;
}

export interface Relationship {
    from: string;
    field: string;
    to: string;
    type: string;
}
