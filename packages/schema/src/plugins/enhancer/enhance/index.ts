import { DELEGATE_AUX_RELATION_PREFIX } from '@zenstackhq/runtime';
import {
    PluginError,
    getAttribute,
    getAttributeArg,
    getAuthModel,
    getDataModels,
    getLiteral,
    isDelegateModel,
    type PluginOptions,
} from '@zenstackhq/sdk';
import {
    DataModel,
    DataModelField,
    ReferenceExpr,
    isArrayExpr,
    isDataModel,
    isGeneratorDecl,
    isReferenceExpr,
    type Model,
} from '@zenstackhq/sdk/ast';
import { getDMMF, getPrismaClientImportSpec, getPrismaVersion, type DMMF } from '@zenstackhq/sdk/prisma';
import fs from 'fs';
import path from 'path';
import semver from 'semver';
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
import { upperCaseFirst } from 'upper-case-first';
import { name } from '..';
import { execPackage } from '../../../utils/exec-utils';
import { trackPrismaSchemaError } from '../../prisma';
import { PrismaSchemaGenerator } from '../../prisma/schema-generator';
import { isDefaultWithAuth } from '../enhancer-utils';
import { generateAuthType } from './auth-type-generator';
import { generateCheckerType } from './checker-type-generator';

// information of delegate models and their sub models
type DelegateInfo = [DataModel, DataModel[]][];

const LOGICAL_CLIENT_GENERATION_PATH = './.logical-prisma-client';

export class EnhancerGenerator {
    constructor(
        private readonly model: Model,
        private readonly options: PluginOptions,
        private readonly project: Project,
        private readonly outDir: string
    ) {}

    async generate(): Promise<{ dmmf: DMMF.Document | undefined }> {
        let logicalPrismaClientDir: string | undefined;
        let dmmf: DMMF.Document | undefined;

        const prismaImport = getPrismaClientImportSpec(this.outDir, this.options);

        if (this.needsLogicalClient()) {
            // schema contains delegate models, need to generate a logical prisma schema
            const result = await this.generateLogicalPrisma();

            logicalPrismaClientDir = LOGICAL_CLIENT_GENERATION_PATH;
            dmmf = result.dmmf;

            // create a reexport of the logical prisma client
            const prismaDts = this.project.createSourceFile(
                path.join(this.outDir, 'models.d.ts'),
                `export type * from '${logicalPrismaClientDir}/index-fixed';`,
                { overwrite: true }
            );
            await prismaDts.save();
        } else {
            // just reexport the prisma client
            const prismaDts = this.project.createSourceFile(
                path.join(this.outDir, 'models.d.ts'),
                `export type * from '${prismaImport}';`,
                { overwrite: true }
            );
            await prismaDts.save();
        }

        const authModel = getAuthModel(getDataModels(this.model));
        const authTypes = authModel ? generateAuthType(this.model, authModel) : '';
        const authTypeParam = authModel ? `auth.${authModel.name}` : 'AuthUser';

        const checkerTypes = this.generatePermissionChecker ? generateCheckerType(this.model) : '';

        const enhanceTs = this.project.createSourceFile(
            path.join(this.outDir, 'enhance.ts'),
            `import { type EnhancementContext, type EnhancementOptions, type ZodSchemas, type AuthUser } from '@zenstackhq/runtime';
import { createEnhancement } from '@zenstackhq/runtime/enhancements';
import modelMeta from './model-meta';
import policy from './policy';
${this.options.withZodSchemas ? "import * as zodSchemas from './zod';" : 'const zodSchemas = undefined;'}

${
    logicalPrismaClientDir
        ? this.createLogicalPrismaImports(prismaImport, logicalPrismaClientDir)
        : this.createSimplePrismaImports(prismaImport)
}

${authTypes}

${checkerTypes}

${
    logicalPrismaClientDir
        ? this.createLogicalPrismaEnhanceFunction(authTypeParam)
        : this.createSimplePrismaEnhanceFunction(authTypeParam)
}
    `,
            { overwrite: true }
        );

        await this.saveSourceFile(enhanceTs);

        return { dmmf };
    }

    private createSimplePrismaImports(prismaImport: string) {
        return `import { Prisma } from '${prismaImport}';
import type * as _P from '${prismaImport}';
        `;
    }

    private createSimplePrismaEnhanceFunction(authTypeParam: string) {
        const returnType = `DbClient${this.generatePermissionChecker ? ' & ModelCheckers' : ''}`;
        return `
export function enhance<DbClient extends object>(prisma: DbClient, context?: EnhancementContext<${authTypeParam}>, options?: EnhancementOptions): ${returnType} {
    return createEnhancement(prisma, {
        modelMeta,
        policy,
        zodSchemas: zodSchemas as unknown as (ZodSchemas | undefined),
        prismaModule: Prisma,
        ...options
    }, context) as ${returnType};
}         
            `;
    }

    private createLogicalPrismaImports(prismaImport: string, logicalPrismaClientDir: string) {
        return `import { Prisma as _Prisma, PrismaClient as _PrismaClient } from '${prismaImport}';
import type { InternalArgs, DynamicClientExtensionThis } from '${prismaImport}/runtime/library';
import type * as _P from '${logicalPrismaClientDir}/index-fixed';
import type { Prisma, PrismaClient } from '${logicalPrismaClientDir}/index-fixed';
`;
    }

    private createLogicalPrismaEnhanceFunction(authTypeParam: string) {
        const prismaVersion = getPrismaVersion();

        // Prisma 5.16.0 introduced a new generic parameter to `DynamicClientExtensionThis`
        const hasClientOptions = prismaVersion && semver.gte(prismaVersion, '5.16.0');

        return `
// overload for plain PrismaClient
export function enhance<ExtArgs extends Record<string, any> & InternalArgs>(
    prisma: _PrismaClient<any, any, ExtArgs>,
    context?: EnhancementContext<${authTypeParam}>, options?: EnhancementOptions): PrismaClient${
            this.generatePermissionChecker ? ' & ModelCheckers' : ''
        };
    
// overload for extended PrismaClient
export function enhance<ExtArgs extends Record<string, any> & InternalArgs${hasClientOptions ? ', ClientOptions' : ''}>(
    prisma: DynamicClientExtensionThis<_Prisma.TypeMap<ExtArgs>, _Prisma.TypeMapCb, ExtArgs${
        hasClientOptions ? ', ClientOptions' : ''
    }>,
    context?: EnhancementContext<${authTypeParam}>, options?: EnhancementOptions): DynamicClientExtensionThis<Prisma.TypeMap<ExtArgs>, Prisma.TypeMapCb, ExtArgs${
            hasClientOptions ? ', ClientOptions' : ''
        }>${this.generatePermissionChecker ? ' & ModelCheckers' : ''};

export function enhance(prisma: any, context?: EnhancementContext<${authTypeParam}>, options?: EnhancementOptions): any {
    return createEnhancement(prisma, {
        modelMeta,
        policy,
        zodSchemas: zodSchemas as unknown as (ZodSchemas | undefined),
        prismaModule: _Prisma,
        ...options
    }, context);
}
`;
    }

    private needsLogicalClient() {
        return this.hasDelegateModel(this.model) || this.hasAuthInDefault(this.model);
    }

    private hasDelegateModel(model: Model) {
        const dataModels = getDataModels(model);
        return dataModels.some(
            (dm) => isDelegateModel(dm) && dataModels.some((sub) => sub.superTypes.some((base) => base.ref === dm))
        );
    }

    private hasAuthInDefault(model: Model) {
        return getDataModels(model).some((dm) =>
            dm.fields.some((f) => f.attributes.some((attr) => isDefaultWithAuth(attr)))
        );
    }

    private async generateLogicalPrisma() {
        const prismaGenerator = new PrismaSchemaGenerator(this.model);

        // dir of the zmodel file
        const zmodelDir = path.dirname(this.options.schemaPath);

        // generate a temp logical prisma schema in zmodel's dir
        const logicalPrismaFile = path.join(zmodelDir, `logical-${Date.now()}.prisma`);

        // calculate a relative output path to output the logical prisma client into enhancer's output dir
        const prismaClientOutDir = path.join(path.relative(zmodelDir, this.outDir), LOGICAL_CLIENT_GENERATION_PATH);
        await prismaGenerator.generate({
            provider: '@internal', // doesn't matter
            schemaPath: this.options.schemaPath,
            output: logicalPrismaFile,
            overrideClientGenerationPath: prismaClientOutDir,
            mode: 'logical',
        });

        // generate the prisma client

        // only run prisma client generator for the logical schema
        const prismaClientGeneratorName = this.getPrismaClientGeneratorName(this.model);
        let generateCmd = `prisma generate --schema "${logicalPrismaFile}" --generator=${prismaClientGeneratorName}`;

        const prismaVersion = getPrismaVersion();
        if (!prismaVersion || semver.gte(prismaVersion, '5.2.0')) {
            // add --no-engine to reduce generation size if the prisma version supports
            generateCmd += ' --no-engine';
        }

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
            throw new PluginError(name, `Failed to run "prisma generate" on logical schema: ${logicalPrismaFile}`);
        }

        // make a bunch of typing fixes to the generated prisma client
        await this.processClientTypes(path.join(this.outDir, LOGICAL_CLIENT_GENERATION_PATH));

        const dmmf = await getDMMF({ datamodel: fs.readFileSync(logicalPrismaFile, { encoding: 'utf-8' }) });

        try {
            // clean up temp schema
            if (fs.existsSync(logicalPrismaFile)) {
                fs.rmSync(logicalPrismaFile);
            }
        } catch {
            // ignore errors
        }

        return {
            prismaSchema: logicalPrismaFile,
            // load the dmmf of the logical prisma schema
            dmmf,
        };
    }

    private getPrismaClientGeneratorName(model: Model) {
        for (const generator of model.declarations.filter(isGeneratorDecl)) {
            if (
                generator.fields.some(
                    (f) => f.name === 'provider' && getLiteral<string>(f.value) === 'prisma-client-js'
                )
            ) {
                return generator.name;
            }
        }
        throw new PluginError(name, `Cannot find prisma-client-js generator in the schema`);
    }

    private async processClientTypes(prismaClientDir: string) {
        // make necessary updates to the generated `index.d.ts` file and save it as `index-fixed.d.ts`
        const project = new Project();
        const sf = project.addSourceFileAtPath(path.join(prismaClientDir, 'index.d.ts'));

        // build a map of delegate models and their sub models
        const delegateInfo: DelegateInfo = [];
        this.model.declarations
            .filter((d): d is DataModel => isDelegateModel(d))
            .forEach((dm) => {
                const concreteModels = this.model.declarations.filter(
                    (d): d is DataModel => isDataModel(d) && d.superTypes.some((s) => s.ref === dm)
                );
                if (concreteModels.length > 0) {
                    delegateInfo.push([dm, concreteModels]);
                }
            });

        // transform index.d.ts and save it into a new file (better perf than in-line editing)

        const sfNew = project.createSourceFile(path.join(prismaClientDir, 'index-fixed.d.ts'), undefined, {
            overwrite: true,
        });

        if (delegateInfo.length > 0) {
            // transform types for delegated models
            this.transformDelegate(sf, sfNew, delegateInfo);
            sfNew.formatText();
        } else {
            // just copy
            sfNew.replaceWithText(sf.getFullText());
        }
        await sfNew.save();
    }

    private transformDelegate(sf: SourceFile, sfNew: SourceFile, delegateInfo: DelegateInfo) {
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
        this.transformPrismaModule(prismaModule, newPrismaModule, delegateInfo);
    }

    private transformPrismaModule(
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
        const newVariables = moduleBlock
            .getVariableStatements()
            .map((variable) => this.transformVariableStatement(variable));
        newPrismaModule.addVariableStatements(newVariables);

        // transform interfaces
        const newInterfaces = moduleBlock.getInterfaces().map((iface) => this.transformInterface(iface, delegateInfo));
        newPrismaModule.addInterfaces(newInterfaces);

        // transform type aliases
        const newTypeAliases = moduleBlock
            .getTypeAliases()
            .map((typeAlias) => this.transformTypeAlias(typeAlias, delegateInfo));
        newPrismaModule.addTypeAliases(newTypeAliases);
    }

    private transformVariableStatement(variable: VariableStatement) {
        const structure = variable.getStructure();

        // remove `delegate_aux_*` fields from the variable's typing
        const auxFields = this.findAuxDecls(variable);
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

    private transformInterface(iface: InterfaceDeclaration, delegateInfo: DelegateInfo) {
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

    private transformTypeAlias(typeAlias: TypeAliasDeclaration, delegateInfo: DelegateInfo) {
        const structure = typeAlias.getStructure();
        let source = structure.type as string;

        // remove aux fields
        source = this.removeAuxFieldsFromTypeAlias(typeAlias, source);

        // remove discriminator field from concrete input types
        source = this.removeDiscriminatorFromConcreteInput(typeAlias, delegateInfo, source);

        // remove create/connectOrCreate/upsert fields from delegate's input types
        source = this.removeCreateFromDelegateInput(typeAlias, delegateInfo, source);

        // remove delegate fields from nested mutation input types
        source = this.removeDelegateFieldsFromNestedMutationInput(typeAlias, delegateInfo, source);

        // fix delegate payload union type
        source = this.fixDelegatePayloadType(typeAlias, delegateInfo, source);

        structure.type = source;
        return structure;
    }

    private fixDelegatePayloadType(typeAlias: TypeAliasDeclaration, delegateInfo: DelegateInfo, source: string) {
        // change the type of `$<DelegateModel>Payload` type of delegate model to a union of concrete types
        const typeName = typeAlias.getName();
        const payloadRecord = delegateInfo.find(([delegate]) => `$${delegate.name}Payload` === typeName);
        if (payloadRecord) {
            const discriminatorDecl = this.getDiscriminatorField(payloadRecord[0]);
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

    private removeCreateFromDelegateInput(
        typeAlias: TypeAliasDeclaration,
        delegateModels: DelegateInfo,
        source: string
    ) {
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

    private removeDiscriminatorFromConcreteInput(
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
                const discriminators = this.getDiscriminatorFieldsRecursively(delegateOfConcrete);
                discriminators.forEach((discriminatorDecl) => {
                    const discriminatorNode = this.findNamedProperty(typeAlias, discriminatorDecl.name);
                    if (discriminatorNode) {
                        source = source.replace(discriminatorNode.getText(), '');
                    }
                });
            }
        }
        return source;
    }

    private removeAuxFieldsFromTypeAlias(typeAlias: TypeAliasDeclaration, source: string) {
        // remove `delegate_aux_*` fields from the type alias
        const auxDecls = this.findAuxDecls(typeAlias);
        if (auxDecls.length > 0) {
            auxDecls.forEach((d) => {
                source = source.replace(d.getText(), '');
            });
        }
        return source;
    }

    private removeDelegateFieldsFromNestedMutationInput(
        typeAlias: TypeAliasDeclaration,
        _delegateInfo: DelegateInfo,
        source: string
    ) {
        const name = typeAlias.getName();

        // remove delegate model fields (and corresponding fk fields) from
        // create/update input types nested inside concrete models

        const regex = new RegExp(`(.+)(Create|Update)Without${upperCaseFirst(DELEGATE_AUX_RELATION_PREFIX)}_(.+)Input`);
        const match = name.match(regex);
        if (!match) {
            return source;
        }

        const nameTuple = match[3]; // [modelName]_[relationFieldName]_[concreteModelName]
        const [modelName, relationFieldName, _] = nameTuple.split('_');

        const fieldDef = this.findNamedProperty(typeAlias, relationFieldName);
        if (fieldDef) {
            // remove relation field of delegate type, e.g., `asset`
            source = source.replace(fieldDef.getText(), '');
        }

        // remove fk fields related to the delegate type relation, e.g., `assetId`

        const relationModel = this.model.declarations.find(
            (d): d is DataModel => isDataModel(d) && d.name === modelName
        );

        if (!relationModel) {
            return source;
        }

        const relationField = relationModel.fields.find((f) => f.name === relationFieldName);
        if (!relationField) {
            return source;
        }

        const relAttr = getAttribute(relationField, '@relation');
        if (!relAttr) {
            return source;
        }

        const fieldsArg = getAttributeArg(relAttr, 'fields');
        let fkFields: string[] = [];
        if (isArrayExpr(fieldsArg)) {
            fkFields = fieldsArg.items.map((e) => (e as ReferenceExpr).target.$refText);
        }

        fkFields.forEach((fkField) => {
            const fieldDef = this.findNamedProperty(typeAlias, fkField);
            if (fieldDef) {
                source = source.replace(fieldDef.getText(), '');
            }
        });

        return source;
    }

    private findNamedProperty(typeAlias: TypeAliasDeclaration, name: string) {
        return typeAlias.getFirstDescendant((d) => d.isKind(SyntaxKind.PropertySignature) && d.getName() === name);
    }

    private findAuxDecls(node: Node) {
        return node
            .getDescendantsOfKind(SyntaxKind.PropertySignature)
            .filter((n) => n.getName().startsWith(DELEGATE_AUX_RELATION_PREFIX));
    }

    private getDiscriminatorField(delegate: DataModel) {
        const delegateAttr = getAttribute(delegate, '@@delegate');
        if (!delegateAttr) {
            return undefined;
        }
        const arg = delegateAttr.args[0]?.value;
        return isReferenceExpr(arg) ? (arg.target.ref as DataModelField) : undefined;
    }

    private getDiscriminatorFieldsRecursively(delegate: DataModel, result: DataModelField[] = []) {
        if (isDelegateModel(delegate)) {
            const discriminator = this.getDiscriminatorField(delegate);
            if (discriminator) {
                result.push(discriminator);
            }

            for (const superType of delegate.superTypes) {
                if (superType.ref) {
                    result.push(...this.getDiscriminatorFieldsRecursively(superType.ref, result));
                }
            }
        }
        return result;
    }

    private async saveSourceFile(sf: SourceFile) {
        if (this.options.preserveTsFiles) {
            await sf.save();
        }
    }

    private get generatePermissionChecker() {
        return this.options.generatePermissionChecker === true;
    }
}
