import type { DataModel, Enum, Model, Procedure, TypeDef } from '@zenstackhq/language/ast';

/** User-facing plugin options from the ZModel plugin block. */
export interface PluginOptions {
    output?: string;
    title?: string;
    fieldOrder?: 'declaration' | 'alphabetical';
    includeInternalModels?: boolean;
    includeRelationships?: boolean;
    includePolicies?: boolean;
    includeValidation?: boolean;
    includeIndexes?: boolean;
    generateSkill?: boolean;
    generateErd?: boolean;
    erdFormat?: 'svg' | 'mmd' | 'both';
    erdTheme?: string;
    diagramFormat?: 'mermaid' | 'svg' | 'both';
}

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

/** Cardinality of a relationship, inferred from field type properties. */
export type RelationType = 'One→Many' | 'Many→One' | 'Many→One?';

/** A single relationship between two data models. */
export interface Relationship {
    from: string;
    field: string;
    to: string;
    type: RelationType;
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

// ── Page Props ──────────────────────────────────────────────────────────

export interface EnumPageProps {
    enumDecl: Enum;
    allModels: DataModel[];
    options: RenderOptions;
    navigation?: Navigation;
}

export interface ModelPageProps {
    model: DataModel;
    options: RenderOptions;
    procedures: Procedure[];
    navigation?: Navigation;
}

export interface ViewPageProps {
    view: DataModel;
    options: RenderOptions;
    navigation?: Navigation;
}

export interface TypePageProps {
    typeDef: TypeDef;
    allModels: DataModel[];
    options: RenderOptions;
    navigation?: Navigation;
}

export interface ProcedurePageProps {
    proc: Procedure;
    options: RenderOptions;
    navigation?: Navigation;
}

export interface RelationshipsPageProps {
    relations: Relationship[];
    genCtx?: GenerationContext;
}

export interface IndexPageProps {
    astModel: Model;
    pluginOptions: PluginOptions;
    hasRelationships: boolean;
    hasErdSvg?: boolean;
    hasErdMmd?: boolean;
    genCtx?: GenerationContext;
}

export interface SkillPageProps {
    schema: Model;
    title: string;
    models: DataModel[];
    views: DataModel[];
    enums: Enum[];
    typeDefs: TypeDef[];
    procedures: Procedure[];
    hasRelationships: boolean;
}
