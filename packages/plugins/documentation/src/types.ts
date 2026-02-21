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
    fieldOrder: 'declaration' | 'alphabetical';
    schemaDir?: string;
    genCtx?: GenerationContext;
}

export interface Relationship {
    from: string;
    field: string;
    to: string;
    type: string;
}

export interface GenerationContext {
    schemaFile: string;
    generatedAt: string;
    durationMs?: number;
    filesGenerated?: number;
}

export interface NavLink {
    name: string;
    path: string;
}

export interface Navigation {
    prev?: NavLink;
    next?: NavLink;
}
