import { type PluginOptions } from '@zenstackhq/sdk';
import type { Model } from '@zenstackhq/sdk/ast';
import type { Project } from 'ts-morph';
import { PrismaSchemaGenerator } from '../../prisma/schema-generator';
import path from 'path';

export async function generate(model: Model, options: PluginOptions, project: Project, outDir: string) {
    const prismaGenerator = new PrismaSchemaGenerator();
    await prismaGenerator.generate(model, {
        provider: '@internal',
        schemaPath: options.schemaPath,
        output: path.join(outDir, 'delegate.prisma'),
        overrideClientGenerationPath: path.join(outDir, '.delegate'),
        mode: 'logical',
    });
}
