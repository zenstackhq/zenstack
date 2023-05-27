import { DMMF } from '@prisma/generator-helper';
import { PluginError, PluginOptions, getDataModels, hasAttribute } from '@zenstackhq/sdk';
import { Model } from '@zenstackhq/sdk/ast';
import type { OpenAPIV3_1 as OAPI } from 'openapi-types';
import { fromZodError } from 'zod-validation-error';
import { SecuritySchemesSchema } from './schema';

export abstract class OpenAPIGeneratorBase {
    constructor(protected model: Model, protected options: PluginOptions, protected dmmf: DMMF.Document) {}

    abstract generate(): string[];

    protected get includedModels() {
        return getDataModels(this.model).filter((d) => !hasAttribute(d, '@@openapi.ignore'));
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
                throw new PluginError(
                    this.options.name,
                    `"securitySchemes" option is invalid: ${fromZodError(parsed.error)}`
                );
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
