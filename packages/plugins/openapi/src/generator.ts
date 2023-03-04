import { DMMF } from '@prisma/generator-helper';
import type { PluginOptions } from '@zenstackhq/sdk';
import { isDataModel, type DataModel, type Model } from '@zenstackhq/sdk/ast';
import type { OpenAPIV3_1 as OAPI } from 'openapi-types';

function getOption(options: PluginOptions, name: string, defaultValue: string) {
    return options[name] ? (options[name] as string) : defaultValue;
}

export async function generate(model: Model, options: PluginOptions, dmmf: DMMF.Document) {
    const openapi = {
        openapi: '3.1.0',
        info: {
            title: getOption(options, 'title', 'Zenstack Generated Database API'),
            version: getOption(options, 'version', '1.0.0'),
        },
        paths: {},
        components: {
            schemas: {} as Record<string, OAPI.SchemaObject>,
        },
    } satisfies OAPI.Document;

    for (const dm of model.declarations.filter((d): d is DataModel => isDataModel(d))) {
        const schema = {
            type: 'object',
            properties: {} as Record<string, OAPI.SchemaObject | OAPI.ReferenceObject>,
        } satisfies OAPI.SchemaObject;

        for (const field of dm.fields) {
            schema.properties[field.name] = {
                type: 'string',
            };
        }

        openapi.components.schemas[dm.name] = schema;
    }

    console.log(JSON.stringify(openapi, undefined, 4));
}
