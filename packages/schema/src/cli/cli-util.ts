import { Model } from '@zenstackhq/language/ast';
import { PluginError } from '@zenstackhq/sdk';
import colors from 'colors';
import fs from 'fs';
import { LangiumServices } from 'langium';
import { NodeFileSystem } from 'langium/node';
import path from 'path';
import { URI } from 'vscode-uri';
import { STD_LIB_MODULE_NAME } from '../language-server/constants';
import { createZModelServices } from '../language-server/zmodel-module';
import { Context } from '../types';
import { ensurePackage, installPackage, PackageManagers } from '../utils/pkg-utils';
import { CliError } from './cli-error';
import { PluginRunner } from './plugin-runner';

/**
 * Initializes an existing project for ZenStack
 */
export async function initProject(
    projectPath: string,
    prismaSchema: string | undefined,
    packageManager: PackageManagers | undefined,
    tag: string
) {
    if (!fs.existsSync(projectPath)) {
        console.error(`Path does not exist: ${projectPath}`);
        throw new CliError('project path does not exist');
    }

    const defaultPrismaSchemaLocation = './prisma/schema.prisma';
    if (prismaSchema) {
        if (!fs.existsSync(prismaSchema)) {
            console.error(`Prisma schema file does not exist: ${prismaSchema}`);
            throw new CliError('prisma schema does not exist');
        }
    } else if (fs.existsSync(defaultPrismaSchemaLocation)) {
        prismaSchema = defaultPrismaSchemaLocation;
    }

    const zmodelFile = path.join(projectPath, './schema.zmodel');
    let sampleModelGenerated = false;

    if (fs.existsSync(zmodelFile)) {
        console.warn(`ZenStack model already exists at ${zmodelFile}, not generating a new one.`);
    } else {
        if (prismaSchema) {
            // copy over schema.prisma
            fs.copyFileSync(prismaSchema, zmodelFile);
        } else {
            // create a new model
            const starterContent = fs.readFileSync(path.join(__dirname, '../res/starter.zmodel'), 'utf-8');
            fs.writeFileSync(zmodelFile, starterContent);
            sampleModelGenerated = true;
        }
    }

    ensurePackage('prisma', true, packageManager, 'latest', projectPath);
    ensurePackage('@prisma/client', false, packageManager, 'latest', projectPath);
    installPackage('zenstack', true, packageManager, tag, projectPath);
    installPackage('@zenstackhq/runtime', false, packageManager, tag, projectPath);

    if (sampleModelGenerated) {
        console.log(`Sample model generated at: ${colors.blue(zmodelFile)}

Please check the following guide on how to model your app:
    https://zenstack.dev/#/modeling-your-app.`);
    } else {
        console.log(
            `Your current Prisma schema "${prismaSchema}" has been copied to "${zmodelFile}".
Moving forward please edit this file and run "zenstack generate" to regenerate Prisma schema.`
        );
    }

    console.log(colors.green('\nProject initialized successfully!'));
}

/**
 * Loads a zmodel document from a file.
 * @param fileName File name
 * @param services Language services
 * @returns Parsed and validated AST
 */
export async function loadDocument(fileName: string, services: LangiumServices): Promise<Model> {
    const extensions = services.LanguageMetaData.fileExtensions;
    if (!extensions.includes(path.extname(fileName))) {
        console.error(colors.yellow(`Please choose a file with extension: ${extensions}.`));
        throw new CliError('invalid schema file');
    }

    if (!fs.existsSync(fileName)) {
        console.error(colors.red(`File ${fileName} does not exist.`));
        throw new CliError('schema file does not exist');
    }

    // load standard library
    const stdLib = services.shared.workspace.LangiumDocuments.getOrCreateDocument(
        URI.file(path.resolve(path.join(__dirname, '../res', STD_LIB_MODULE_NAME)))
    );

    // load the document
    const document = services.shared.workspace.LangiumDocuments.getOrCreateDocument(URI.file(path.resolve(fileName)));

    // build the document together with standard library
    await services.shared.workspace.DocumentBuilder.build([stdLib, document], {
        validationChecks: 'all',
    });

    const validationErrors = (document.diagnostics ?? []).filter((e) => e.severity === 1);
    if (validationErrors.length > 0) {
        console.error(colors.red('Validation errors:'));
        for (const validationError of validationErrors) {
            console.error(
                colors.red(
                    `line ${validationError.range.start.line + 1}: ${
                        validationError.message
                    } [${document.textDocument.getText(validationError.range)}]`
                )
            );
        }
        throw new CliError('schema validation errors');
    }

    return document.parseResult.value as Model;
}

export async function runPlugins(options: { schema: string; packageManager: PackageManagers | undefined }) {
    const services = createZModelServices(NodeFileSystem).ZModel;
    const model = await loadDocument(options.schema, services);

    const context: Context = {
        schema: model,
        schemaPath: path.resolve(options.schema),
        outDir: path.dirname(options.schema),
    };

    try {
        await new PluginRunner().run(context);
    } catch (err) {
        if (err instanceof PluginError) {
            console.error(colors.red(err.message));
            throw new CliError(err.message);
        } else {
            throw err;
        }
    }
}
