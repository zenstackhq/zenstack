import { PluginError, getDataModels, hasAttribute, type PluginOptions, type PluginResult } from '@zenstackhq/sdk';
import { Model } from '@zenstackhq/sdk/ast';
import type { DMMF } from '@zenstackhq/sdk/prisma';
import type { OpenAPIV3_1 as OAPI } from 'openapi-types';
import semver from 'semver';
import { fromZodError } from 'zod-validation-error/v3';
import { name } from '.';
import { SecuritySchemesSchema } from './schema';

export abstract class OpenAPIGeneratorBase {
    protected readonly DEFAULT_SPEC_VERSION = '3.1.0';

    constructor(protected model: Model, protected options: PluginOptions, protected dmmf: DMMF.Document) {}

    abstract generate(): PluginResult;

    protected get includedModels() {
        const includeOpenApiIgnored = this.getOption<boolean>('includeOpenApiIgnored', false);
        const models = getDataModels(this.model);
        return includeOpenApiIgnored ? models : models.filter((d) => !hasAttribute(d, '@@openapi.ignore'));
    }

    protected wrapArray(
        schema: OAPI.ReferenceObject | OAPI.SchemaObject,
        isArray: boolean
    ): OAPI.ReferenceObject | OAPI.SchemaObject {
        if (isArray) {
            return { type: 'array', items: schema };
        } else {
            return schema;
        }
    }

    protected wrapNullable(
        schema: OAPI.ReferenceObject | OAPI.SchemaObject,
        isNullable: boolean
    ): OAPI.ReferenceObject | OAPI.SchemaObject {
        if (!isNullable) {
            return schema;
        }

        const specVersion = this.getOption('specVersion', this.DEFAULT_SPEC_VERSION);

        // https://stackoverflow.com/questions/48111459/how-to-define-a-property-that-can-be-string-or-null-in-openapi-swagger
        // https://stackoverflow.com/questions/40920441/how-to-specify-a-property-can-be-null-or-a-reference-with-swagger
        if (semver.gte(specVersion, '3.1.0')) {
            // OAPI 3.1.0 and above has native 'null' type
            if ((schema as OAPI.BaseSchemaObject).oneOf) {
                // merge into existing 'oneOf'
                return { oneOf: [...(schema as OAPI.BaseSchemaObject).oneOf!, { type: 'null' }] };
            } else {
                // wrap into a 'oneOf'
                return { oneOf: [{ type: 'null' }, schema] };
            }
        } else {
            if ((schema as OAPI.ReferenceObject).$ref) {
                // nullable $ref needs to be represented as: { allOf: [{ $ref: ... }], nullable: true }
                return {
                    allOf: [schema],
                    nullable: true,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any;
            } else {
                // nullable scalar: { type: ..., nullable: true }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return { ...schema, nullable: true } as any;
            }
        }
    }

    protected array(itemType: OAPI.SchemaObject | OAPI.ReferenceObject) {
        return { type: 'array', items: itemType } as const;
    }

    protected oneOf(...schemas: (OAPI.SchemaObject | OAPI.ReferenceObject)[]) {
        return { oneOf: schemas };
    }

    protected allOf(...schemas: (OAPI.SchemaObject | OAPI.ReferenceObject)[]) {
        return { allOf: schemas };
    }

    protected getOption<T = string>(name: string): T | undefined;
    protected getOption<T = string, D extends T = T>(name: string, defaultValue: D): T;
    protected getOption<T = string>(name: string, defaultValue?: T): T | undefined {
        const value = this.options[name];
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        return value === undefined ? defaultValue : value;
    }

    protected generateSecuritySchemes() {
        const securitySchemes = this.getOption<Record<string, string>[]>('securitySchemes');
        if (securitySchemes) {
            const parsed = SecuritySchemesSchema.safeParse(securitySchemes);
            if (!parsed.success) {
                throw new PluginError(name, `"securitySchemes" option is invalid: ${fromZodError(parsed.error)}`);
            }
            return parsed.data;
        }
        return undefined;
    }

    protected pruneComponents(paths: OAPI.PathsObject, components: OAPI.ComponentsObject) {
        const schemas = components.schemas;
        if (schemas) {
            const roots = new Set<string>();
            for (const path of Object.values(paths)) {
                this.collectUsedComponents(path, roots);
            }

            // build a transitive closure for all reachable schemas from roots
            const allUsed = new Set<string>(roots);

            let todo = [...allUsed];
            while (todo.length > 0) {
                const curr = new Set<string>(allUsed);
                Object.entries(schemas)
                    .filter(([key]) => todo.includes(key))
                    .forEach(([, value]) => {
                        this.collectUsedComponents(value, allUsed);
                    });
                todo = [...allUsed].filter((e) => !curr.has(e));
            }

            // prune unused schemas
            Object.keys(schemas).forEach((key) => {
                if (!allUsed.has(key)) {
                    delete schemas[key];
                }
            });
        }
    }

    private collectUsedComponents(value: unknown, allUsed: Set<string>) {
        if (!value) {
            return;
        }

        if (Array.isArray(value)) {
            value.forEach((item) => {
                this.collectUsedComponents(item, allUsed);
            });
        } else if (typeof value === 'object') {
            Object.entries(value).forEach(([subKey, subValue]) => {
                if (subKey === '$ref') {
                    const ref = subValue as string;
                    const name = ref.split('/').pop();
                    if (name && !allUsed.has(name)) {
                        allUsed.add(name);
                    }
                } else {
                    this.collectUsedComponents(subValue, allUsed);
                }
            });
        }
    }
}
