import { DELEGATE_AUX_RELATION_PREFIX } from '@zenstackhq/runtime';
import {
    getAttribute,
    getDataModels,
    getPrismaClientImportSpec,
    isDelegateModel,
    type PluginOptions,
} from '@zenstackhq/sdk';
import { DataModelField, isDataModel, isReferenceExpr, type DataModel, type Model } from '@zenstackhq/sdk/ast';
import path from 'path';
import {
    ForEachDescendantTraversalControl,
    MethodSignature,
    Node,
    Project,
    PropertySignature,
    SyntaxKind,
    TypeAliasDeclaration,
} from 'ts-morph';
import { PrismaSchemaGenerator } from '../../prisma/schema-generator';

export async function generate(model: Model, options: PluginOptions, project: Project, outDir: string) {
    const outFile = path.join(outDir, 'enhance.ts');
    let logicalPrismaClientDir: string | undefined;

    if (hasDelegateModel(model)) {
        logicalPrismaClientDir = await generateLogicalPrisma(model, options, outDir);
    }

    project.createSourceFile(
        outFile,
        `import { createEnhancement, type EnhancementContext, type EnhancementOptions, type ZodSchemas } from '@zenstackhq/runtime';
import modelMeta from './model-meta';
import policy from './policy';
${options.withZodSchemas ? "import * as zodSchemas from './zod';" : 'const zodSchemas = undefined;'}
import { Prisma } from '${getPrismaClientImportSpec(model, outDir)}';
${logicalPrismaClientDir ? `import { PrismaClient as EnhancedPrismaClient } from '${logicalPrismaClientDir}';` : ''}

export function enhance<DbClient extends object>(prisma: DbClient, context?: EnhancementContext, options?: EnhancementOptions) {
    return createEnhancement(prisma, {
        modelMeta,
        policy,
        zodSchemas: zodSchemas as unknown as (ZodSchemas | undefined),
        prismaModule: Prisma,
        ...options
    }, context)${logicalPrismaClientDir ? ' as EnhancedPrismaClient' : ''};
}
`,
        { overwrite: true }
    );
}

function hasDelegateModel(model: Model) {
    const dataModels = getDataModels(model);
    return dataModels.some(
        (dm) => isDelegateModel(dm) && dataModels.some((sub) => sub.superTypes.some((base) => base.ref === dm))
    );
}

async function generateLogicalPrisma(model: Model, options: PluginOptions, outDir: string) {
    const prismaGenerator = new PrismaSchemaGenerator();
    const prismaClientOutDir = './.delegate';
    await prismaGenerator.generate(model, {
        provider: '@internal',
        schemaPath: options.schemaPath,
        output: path.join(outDir, 'delegate.prisma'),
        overrideClientGenerationPath: prismaClientOutDir,
        mode: 'logical',
    });

    await processClientTypes(model, path.join(outDir, prismaClientOutDir));
    return prismaClientOutDir;
}

async function processClientTypes(model: Model, prismaClientDir: string) {
    const project = new Project();
    const sf = project.addSourceFileAtPath(path.join(prismaClientDir, 'index.d.ts'));

    const delegateModels: [DataModel, DataModel[]][] = [];
    model.declarations
        .filter((d): d is DataModel => isDelegateModel(d))
        .forEach((dm) => {
            delegateModels.push([
                dm,
                model.declarations.filter(
                    (d): d is DataModel => isDataModel(d) && d.superTypes.some((s) => s.ref === dm)
                ),
            ]);
        });

    const toRemove: (PropertySignature | MethodSignature)[] = [];
    const toReplaceText: [TypeAliasDeclaration, string][] = [];

    sf.forEachDescendant((desc, traversal) => {
        removeAuxRelationFields(desc, toRemove, traversal);
        fixDelegateUnionType(desc, delegateModels, toReplaceText, traversal);
        removeCreateFromDelegateInputTypes(desc, delegateModels, toRemove, traversal);
        removeToplevelCreates(desc, delegateModels, toRemove, traversal);
    });

    toRemove.forEach((n) => n.remove());
    toReplaceText.forEach(([node, text]) => node.replaceWithText(text));

    await project.save();
}

function removeAuxRelationFields(
    desc: Node,
    toRemove: (PropertySignature | MethodSignature)[],
    traversal: ForEachDescendantTraversalControl
) {
    if (desc.isKind(SyntaxKind.PropertySignature) || desc.isKind(SyntaxKind.MethodSignature)) {
        // remove aux fields
        const name = desc.getName();

        if (name.startsWith(DELEGATE_AUX_RELATION_PREFIX)) {
            toRemove.push(desc);
            traversal.skip();
        }
    }
}

function fixDelegateUnionType(
    desc: Node,
    delegateModels: [DataModel, DataModel[]][],
    toReplaceText: [TypeAliasDeclaration, string][],
    traversal: ForEachDescendantTraversalControl
) {
    if (!desc.isKind(SyntaxKind.TypeAliasDeclaration)) {
        return;
    }

    const name = desc.getName();
    delegateModels.forEach(([delegate, concreteModels]) => {
        if (name === `$${delegate.name}Payload`) {
            const discriminator = getDiscriminatorField(delegate);
            // const discriminator = 'delegateType'; // delegate.fields.find((f) => hasAttribute(f, '@discriminator'));
            if (discriminator) {
                toReplaceText.push([
                    desc,
                    `export type ${name}<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
        ${concreteModels
            .map((m) => `($${m.name}Payload<ExtArgs> & { scalars: { ${discriminator.name}: '${m.name}' } })`)
            .join(' | ')};`,
                ]);
                traversal.skip();
            }
        }
    });
}

function removeCreateFromDelegateInputTypes(
    desc: Node,
    delegateModels: [DataModel, DataModel[]][],
    toRemove: (PropertySignature | MethodSignature)[],
    traversal: ForEachDescendantTraversalControl
) {
    if (!desc.isKind(SyntaxKind.TypeAliasDeclaration)) {
        return;
    }

    const name = desc.getName();
    delegateModels.forEach(([delegate]) => {
        // remove create related sub-payload from delegate's input types since they cannot be created directly
        const regex = new RegExp(`\\${delegate.name}(Unchecked)?(Create|Update).*Input`);
        if (regex.test(name)) {
            desc.forEachDescendant((d, innerTraversal) => {
                if (
                    d.isKind(SyntaxKind.PropertySignature) &&
                    ['create', 'upsert', 'connectOrCreate'].includes(d.getName())
                ) {
                    toRemove.push(d);
                    innerTraversal.skip();
                }
            });
            traversal.skip();
        }
    });
}

function removeToplevelCreates(
    desc: Node,
    delegateModels: [DataModel, DataModel[]][],
    toRemove: (PropertySignature | MethodSignature)[],
    traversal: ForEachDescendantTraversalControl
) {
    if (desc.isKind(SyntaxKind.InterfaceDeclaration)) {
        // remove create and upsert methods from delegate interfaces since they cannot be created directly
        const name = desc.getName();
        if (delegateModels.map(([dm]) => `${dm.name}Delegate`).includes(name)) {
            const createMethod = desc.getMethod('create');
            if (createMethod) {
                toRemove.push(createMethod);
            }
            const createManyMethod = desc.getMethod('createMany');
            if (createManyMethod) {
                toRemove.push(createManyMethod);
            }
            const upsertMethod = desc.getMethod('upsert');
            if (upsertMethod) {
                toRemove.push(upsertMethod);
            }
            traversal.skip();
        }
    }
}

function getDiscriminatorField(delegate: DataModel) {
    const delegateAttr = getAttribute(delegate, '@@delegate');
    if (!delegateAttr) {
        return undefined;
    }
    const arg = delegateAttr.args[0]?.value;
    return isReferenceExpr(arg) ? (arg.target.ref as DataModelField) : undefined;
}
