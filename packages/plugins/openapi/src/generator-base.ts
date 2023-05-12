import { DMMF } from '@prisma/generator-helper';
import { PluginOptions, getDataModels, hasAttribute } from '@zenstackhq/sdk';
import { Model } from '@zenstackhq/sdk/ast';
import type { OpenAPIV3_1 as OAPI } from 'openapi-types';

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
}
