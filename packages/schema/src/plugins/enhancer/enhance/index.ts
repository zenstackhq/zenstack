import type { DMMF } from '@prisma/generator-helper';
import { DELEGATE_AUX_RELATION_PREFIX } from '@zenstackhq/runtime';
import {
    getAttribute,
    getDataModels,
    getDMMF,
    getPrismaClientImportSpec,
    isDelegateModel,
    PluginError,
    type PluginOptions,
} from '@zenstackhq/sdk';
import { DataModel, DataModelField, isDataModel, isReferenceExpr, type Model } from '@zenstackhq/sdk/ast';
import fs from 'fs';
import path from 'path';
import {
    FunctionDeclarationStructure,
    InterfaceDeclaration,
    ModuleDeclaration,
    Node,
    Project,
    SourceFile,
    SyntaxKind,
    TypeAliasDeclaration,
    VariableStatement,
} from 'ts-morph';
import { name } from '..';
import { execPackage } from '../../../utils/exec-utils';
import { trackPrismaSchemaError } from '../../prisma';
import { PrismaSchemaGenerator } from '../../prisma/schema-generator';

// information of delegate models and their sub models
type DelegateInfo = [DataModel, DataModel[]][];

export async function generate(model: Model, options: PluginOptions, project: Project, outDir: string) {
    let logicalPrismaClientDir: string | undefined;
    let dmmf: DMMF.Document | undefined;

    if (hasDelegateModel(model)) {
        // schema contains delegate models, need to generate a logical prisma schema
        const result = await generateLogicalPrisma(model, options, outDir);

        // record the logical prisma client dir and dmmf, they'll be used when running
        // other plugins
        logicalPrismaClientDir = result.prismaClientDir;
        dmmf = result.dmmf;

        // create a reexport of the logical prisma client
        const prismaDts = project.createSourceFile(
            path.join(outDir, 'prisma.d.ts'),
            `export type * from '${logicalPrismaClientDir}/index-fixed';`,
            { overwrite: true }
        );
        await saveSourceFile(prismaDts, options);
    } else {
        // just reexport the prisma client
        const prismaDts = project.createSourceFile(
            path.join(outDir, 'prisma.d.ts'),
            `export type * from '${getPrismaClientImportSpec(outDir, options)}';`,
            { overwrite: true }
        );
        await saveSourceFile(prismaDts, options);
    }

    const enhanceTs = project.createSourceFile(
        path.join(outDir, 'enhance.ts'),
        `import { createEnhancement, type EnhancementContext, type EnhancementOptions, type ZodSchemas } from '@zenstackhq/runtime';
import modelMeta from './model-meta';
import policy from './policy';
${options.withZodSchemas ? "import * as zodSchemas from './zod';" : 'const zodSchemas = undefined;'}
import { Prisma } from '${getPrismaClientImportSpec(outDir, options)}';
${logicalPrismaClientDir ? `import { type PrismaClient } from '${logicalPrismaClientDir}/index-fixed';` : ``}

export function enhance<DbClient extends object>(prisma: DbClient, context?: EnhancementContext, options?: EnhancementOptions) {
    return createEnhancement(prisma, {
        modelMeta,
        policy,
        zodSchemas: zodSchemas as unknown as (ZodSchemas | undefined),
        prismaModule: Prisma,
        ...options
    }, context)${logicalPrismaClientDir ? ' as PrismaClient' : ''};
}
`,
        { overwrite: true }
    );

    await saveSourceFile(enhanceTs, options);

    return { dmmf };
}

function hasDelegateModel(model: Model) {
    const dataModels = getDataModels(model);
    return dataModels.some(
        (dm) => isDelegateModel(dm) && dataModels.some((sub) => sub.superTypes.some((base) => base.ref === dm))
    );
}

async function generateLogicalPrisma(model: Model, options: PluginOptions, outDir: string) {
    const prismaGenerator = new PrismaSchemaGenerator(model);
    const prismaClientOutDir = './.logical-prisma-client';
    const logicalPrismaFile = path.join(outDir, 'logical.prisma');
    await prismaGenerator.generate({
        provider: '@internal', // doesn't matter
        schemaPath: options.schemaPath,
        output: logicalPrismaFile,
        overrideClientGenerationPath: prismaClientOutDir,
        mode: 'logical',
    });

    // generate the prisma client
    const generateCmd = `prisma generate --schema "${logicalPrismaFile}" --no-engine`;
    try {
        // run 'prisma generate'
        await execPackage(generateCmd, { stdio: 'ignore' });
    } catch {
        await trackPrismaSchemaError(logicalPrismaFile);
        try {
            // run 'prisma generate' again with output to the console
            await execPackage(generateCmd);
        } catch {
            // noop
        }
        throw new PluginError(name, `Failed to run "prisma generate"`);
    }

    // make a bunch of typing fixes to the generated prisma client
    await processClientTypes(model, path.join(outDir, prismaClientOutDir));

    let prismaClientDir = prismaClientOutDir;
    if (options.output) {
        // process user-provided output path
        const prismaClientDirAbs = path.resolve(outDir, prismaClientOutDir);

        // translate to a path relative to the zmodel schema
        prismaClientDir = path.relative(path.dirname(options.schemaPath), prismaClientDirAbs);
    }

    return {
        prismaSchema: logicalPrismaFile,
        prismaClientDir,
        // load the dmmf of the logical prisma schema
        dmmf: await getDMMF({ datamodel: fs.readFileSync(logicalPrismaFile, { encoding: 'utf-8' }) }),
    };
}

async function processClientTypes(model: Model, prismaClientDir: string) {
    // make necessary updates to the generated `index.d.ts` file and save it as `index-fixed.d.ts`
    const project = new Project();
    const sf = project.addSourceFileAtPath(path.join(prismaClientDir, 'index.d.ts'));

    // build a map of delegate models and their sub models
    const delegateInfo: DelegateInfo = [];
    model.declarations
        .filter((d): d is DataModel => isDelegateModel(d))
        .forEach((dm) => {
            delegateInfo.push([
                dm,
                model.declarations.filter(
                    (d): d is DataModel => isDataModel(d) && d.superTypes.some((s) => s.ref === dm)
                ),
            ]);
        });

    const sfNew = project.createSourceFile(path.join(prismaClientDir, 'index-fixed.d.ts'), undefined, {
        overwrite: true,
    });
    transform(sf, sfNew, delegateInfo);
    sfNew.formatText();
    await sfNew.save();
}

function transform(sf: SourceFile, sfNew: SourceFile, delegateModels: DelegateInfo) {
    // copy toplevel imports
    sfNew.addImportDeclarations(sf.getImportDeclarations().map((n) => n.getStructure()));

    // copy toplevel import equals
    sfNew.addStatements(sf.getChildrenOfKind(SyntaxKind.ImportEqualsDeclaration).map((n) => n.getFullText()));

    // copy toplevel exports
    sfNew.addExportAssignments(sf.getExportAssignments().map((n) => n.getStructure()));

    // copy toplevel type aliases
    sfNew.addTypeAliases(sf.getTypeAliases().map((n) => n.getStructure()));

    // copy toplevel classes
    sfNew.addClasses(sf.getClasses().map((n) => n.getStructure()));

    // copy toplevel variables
    sfNew.addVariableStatements(sf.getVariableStatements().map((n) => n.getStructure()));

    // copy toplevel namespaces except for `Prisma`
    sfNew.addModules(
        sf
            .getModules()
            .filter((n) => n.getName() !== 'Prisma')
            .map((n) => n.getStructure())
    );

    // transform the `Prisma` namespace
    const prismaModule = sf.getModuleOrThrow('Prisma');
    const newPrismaModule = sfNew.addModule({ name: 'Prisma', isExported: true });
    transformPrismaModule(prismaModule, newPrismaModule, delegateModels);
}

function transformPrismaModule(
    prismaModule: ModuleDeclaration,
    newPrismaModule: ModuleDeclaration,
    delegateInfo: DelegateInfo
) {
    // module block is the direct container of declarations inside a namespace
    const moduleBlock = prismaModule.getFirstChildByKindOrThrow(SyntaxKind.ModuleBlock);

    // most of the toplevel constructs should be copied over
    // here we use ts-morph batch operations for optimal performance

    // copy imports
    newPrismaModule.addStatements(
        moduleBlock.getChildrenOfKind(SyntaxKind.ImportEqualsDeclaration).map((n) => n.getFullText())
    );

    // copy classes
    newPrismaModule.addClasses(moduleBlock.getClasses().map((n) => n.getStructure()));

    // copy functions
    newPrismaModule.addFunctions(
        moduleBlock.getFunctions().map((n) => n.getStructure() as FunctionDeclarationStructure)
    );

    // copy nested namespaces
    newPrismaModule.addModules(moduleBlock.getModules().map((n) => n.getStructure()));

    // transform variables
    const newVariables = moduleBlock.getVariableStatements().map((variable) => transformVariableStatement(variable));
    newPrismaModule.addVariableStatements(newVariables);

    // transform interfaces
    const newInterfaces = moduleBlock.getInterfaces().map((iface) => transformInterface(iface, delegateInfo));
    newPrismaModule.addInterfaces(newInterfaces);

    // transform type aliases
    const newTypeAliases = moduleBlock.getTypeAliases().map((typeAlias) => transformTypeAlias(typeAlias, delegateInfo));
    newPrismaModule.addTypeAliases(newTypeAliases);
}

function transformVariableStatement(variable: VariableStatement) {
    const structure = variable.getStructure();

    // remove `delegate_aux_*` fields from the variable's typing
    const auxFields = findAuxDecls(variable);
    if (auxFields.length > 0) {
        structure.declarations.forEach((variable) => {
            let source = variable.type?.toString();
            auxFields.forEach((f) => {
                source = source?.replace(f.getText(), '');
            });
            variable.type = source;
        });
    }

    return structure;
}

function transformInterface(iface: InterfaceDeclaration, delegateInfo: DelegateInfo) {
    const structure = iface.getStructure();

    // filter out aux fields
    structure.properties = structure.properties?.filter((p) => !p.name.startsWith(DELEGATE_AUX_RELATION_PREFIX));

    // filter out aux methods
    structure.methods = structure.methods?.filter((m) => !m.name.startsWith(DELEGATE_AUX_RELATION_PREFIX));

    if (delegateInfo.some(([delegate]) => `${delegate.name}Delegate` === iface.getName())) {
        // delegate models cannot be created directly, remove create/createMany/upsert
        structure.methods = structure.methods?.filter((m) => !['create', 'createMany', 'upsert'].includes(m.name));
    }

    return structure;
}

function transformTypeAlias(typeAlias: TypeAliasDeclaration, delegateInfo: DelegateInfo) {
    const structure = typeAlias.getStructure();
    let source = structure.type as string;

    // remove aux fields
    source = removeAuxFieldsFromTypeAlias(typeAlias, source);

    // remove discriminator field from concrete input types
    source = removeDiscriminatorFromConcreteInput(typeAlias, delegateInfo, source);

    // remove create/connectOrCreate/upsert fields from delegate's input types
    source = removeCreateFromDelegateInput(typeAlias, delegateInfo, source);

    // fix delegate payload union type
    source = fixDelegatePayloadType(typeAlias, delegateInfo, source);

    structure.type = source;
    return structure;
}

function fixDelegatePayloadType(typeAlias: TypeAliasDeclaration, delegateInfo: DelegateInfo, source: string) {
    // change the type of `$<DelegateModel>Payload` type of delegate model to a union of concrete types
    const typeName = typeAlias.getName();
    const payloadRecord = delegateInfo.find(([delegate]) => `$${delegate.name}Payload` === typeName);
    if (payloadRecord) {
        const discriminatorDecl = getDiscriminatorField(payloadRecord[0]);
        if (discriminatorDecl) {
            source = `${payloadRecord[1]
                .map(
                    (concrete) =>
                        `($${concrete.name}Payload<ExtArgs> & { scalars: { ${discriminatorDecl.name}: '${concrete.name}' } })`
                )
                .join(' | ')}`;
        }
    }
    return source;
}

function removeCreateFromDelegateInput(typeAlias: TypeAliasDeclaration, delegateModels: DelegateInfo, source: string) {
    // remove create/connectOrCreate/upsert fields from delegate's input types because
    // delegate models cannot be created directly
    const typeName = typeAlias.getName();
    const delegateModelNames = delegateModels.map(([delegate]) => delegate.name);
    const delegateCreateUpdateInputRegex = new RegExp(
        `\\${delegateModelNames.join('|')}(Unchecked)?(Create|Update).*Input`
    );
    if (delegateCreateUpdateInputRegex.test(typeName)) {
        const toRemove = typeAlias
            .getDescendantsOfKind(SyntaxKind.PropertySignature)
            .filter((p) => ['create', 'connectOrCreate', 'upsert'].includes(p.getName()));
        toRemove.forEach((r) => {
            source = source.replace(r.getText(), '');
        });
    }
    return source;
}

function removeDiscriminatorFromConcreteInput(
    typeAlias: TypeAliasDeclaration,
    delegateInfo: DelegateInfo,
    source: string
) {
    // remove discriminator field from the create/update input of concrete models because
    // discriminator cannot be set directly
    const typeName = typeAlias.getName();
    const concreteModelNames = delegateInfo.map(([, concretes]) => concretes.map((c) => c.name)).flatMap((c) => c);
    const concreteCreateUpdateInputRegex = new RegExp(
        `(${concreteModelNames.join('|')})(Unchecked)?(Create|Update).*Input`
    );

    const match = typeName.match(concreteCreateUpdateInputRegex);
    if (match) {
        const modelName = match[1];
        const record = delegateInfo.find(([, concretes]) => concretes.some((c) => c.name === modelName));
        if (record) {
            // remove all discriminator fields recursively
            const delegateOfConcrete = record[0];
            const discriminators = getDiscriminatorFieldsRecursively(delegateOfConcrete);
            discriminators.forEach((discriminatorDecl) => {
                const discriminatorNode = findNamedProperty(typeAlias, discriminatorDecl.name);
                if (discriminatorNode) {
                    source = source.replace(discriminatorNode.getText(), '');
                }
            });
        }
    }
    return source;
}

function removeAuxFieldsFromTypeAlias(typeAlias: TypeAliasDeclaration, source: string) {
    // remove `delegate_aux_*` fields from the type alias
    const auxDecls = findAuxDecls(typeAlias);
    if (auxDecls.length > 0) {
        auxDecls.forEach((d) => {
            source = source.replace(d.getText(), '');
        });
    }
    return source;
}

function findNamedProperty(typeAlias: TypeAliasDeclaration, name: string) {
    return typeAlias.getFirstDescendant((d) => d.isKind(SyntaxKind.PropertySignature) && d.getName() === name);
}

function findAuxDecls(node: Node) {
    return node
        .getDescendantsOfKind(SyntaxKind.PropertySignature)
        .filter((n) => n.getName().startsWith(DELEGATE_AUX_RELATION_PREFIX));
}

function getDiscriminatorField(delegate: DataModel) {
    const delegateAttr = getAttribute(delegate, '@@delegate');
    if (!delegateAttr) {
        return undefined;
    }
    const arg = delegateAttr.args[0]?.value;
    return isReferenceExpr(arg) ? (arg.target.ref as DataModelField) : undefined;
}

function getDiscriminatorFieldsRecursively(delegate: DataModel, result: DataModelField[] = []) {
    if (isDelegateModel(delegate)) {
        const discriminator = getDiscriminatorField(delegate);
        if (discriminator) {
            result.push(discriminator);
        }

        for (const superType of delegate.superTypes) {
            if (superType.ref) {
                result.push(...getDiscriminatorFieldsRecursively(superType.ref, result));
            }
        }
    }
    return result;
}

async function saveSourceFile(sf: SourceFile, options: PluginOptions) {
    if (options.preserveTsFiles) {
        await sf.save();
    }
}
