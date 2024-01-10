import { getPrismaClientImportSpec, type PluginOptions } from '@zenstackhq/sdk';
import type { Model } from '@zenstackhq/sdk/ast';
import path from 'path';
import type { Project } from 'ts-morph';

export async function generate(model: Model, options: PluginOptions, project: Project, outDir: string) {
    const outFile = path.join(outDir, 'enhance.ts');

    project.createSourceFile(
        outFile,
        `import { createEnhancement, type EnhancementContext, type EnhancementOptions, type ZodSchemas } from '@zenstackhq/runtime';
import modelMeta from './model-meta';
import policy from './policy';
${options.withZodSchemas ? "import * as zodSchemas from './zod';" : 'const zodSchemas = undefined;'}
import { Prisma } from '${getPrismaClientImportSpec(model, outDir)}';

export function enhance<DbClient extends object>(prisma: DbClient, context?: EnhancementContext, options?: EnhancementOptions): DbClient {
    return createEnhancement(prisma, {
        modelMeta,
        policy,
        zodSchemas: zodSchemas as unknown as (ZodSchemas | undefined),
        prismaModule: Prisma,
        ...options
    }, context);
}
`,
        { overwrite: true }
    );
}
