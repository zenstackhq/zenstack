/** Metadata extracted from `@@meta` model-level attributes (e.g. `doc:category`, `doc:since`). */
export interface DocMeta {
    category?: string;
    since?: string;
    deprecated?: string;
}

/** Controls which optional sections are included in the generated documentation pages. */
export interface RenderOptions {
    includeRelationships: boolean;
    includePolicies: boolean;
    includeValidation: boolean;
    includeIndexes: boolean;
    fieldOrder: 'declaration' | 'alphabetical';
    /** Absolute path to the directory containing the source schema file(s), used for relative source path display. */
    schemaDir?: string;
    /** Metadata about the current generation run (timestamps, file counts). */
    genCtx?: GenerationContext;
}

/** A single relationship between two data models. */
export interface Relationship {
    from: string;
    field: string;
    to: string;
    type: string;
}

/** Metadata captured during a generation run, rendered in index page footer. */
export interface GenerationContext {
    schemaFile: string;
    generatedAt: string;
    durationMs?: number;
    filesGenerated?: number;
}

/** A link to an adjacent entity in a sorted navigation list. */
export interface NavLink {
    name: string;
    path: string;
}

/** Previous/next navigation links for entity pages within a category. */
export interface Navigation {
    prev?: NavLink;
    next?: NavLink;
}
