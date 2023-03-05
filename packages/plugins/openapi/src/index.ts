import { DMMF } from '@prisma/generator-helper';
import { PluginOptions } from '@zenstackhq/sdk';
import { Model } from '@zenstackhq/sdk/ast';
import { OpenAPIGenerator } from './generator';

export const name = 'OpenAPI';

export default async function run(model: Model, options: PluginOptions, dmmf: DMMF.Document) {
    return new OpenAPIGenerator(model, options, dmmf).generate();
}
