import { STD_LIB_MODULE_NAME } from '@lang/constants';
import { Model } from '@lang/generated/ast';
import { createZModelServices } from '@lang/zmodel-module';
import colors from 'colors';
import fs from 'fs';
import { LangiumServices } from 'langium';
import { NodeFileSystem } from 'langium/node';
import path from 'path';
import { installPackage } from 'src/utils/pkg-utils';
import { URI } from 'vscode-uri';
import { ZenStackGenerator } from '../generator';
import { GENERATED_CODE_PATH } from '../generator/constants';
import { Context, GeneratorError } from '../generator/types';
import { CliError } from './cli-error';

/**
 * Initializes an existing project for ZenStack
 */
export async function initProject(projectPath: string) {
    const schema = path.join(projectPath, 'zenstack', 'schema.zmodel');
    let schemaGenerated = false;

    if (fs.existsSync(schema)) {
        console.warn(colors.yellow(`Model already exists: ${schema}`));
    } else {
        // create a default model
        if (!fs.existsSync(path.join(projectPath, 'zenstack'))) {
            fs.mkdirSync(path.join(projectPath, 'zenstack'));
        }

        fs.writeFileSync(
            schema,
            `// This is a sample model to get you started.
// Learn how to model you app: https://zenstack.dev/#/modeling-your-app.

/*
 * A sample data source using local sqlite db.
 * See how to use a different db: https://zenstack.dev/#/zmodel-data-source.
 */
datasource db {
    provider = 'sqlite'
    url = 'file:./todo.db'
}

/*
 * User model
 */
model User {
    id String @id @default(cuid())
    email String @unique @email
    password String @password @omit @length(8, 16)
    posts Post[]

    // everybody can signup
    @@allow('create', true)

    // full access by self
    @@allow('all', auth() == this)
}

/*
 * Post model
 */
model Post {
    id String @id @default(cuid())
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    title String @length(1, 256)
    content String
    published Boolean @default(false)
    author User? @relation(fields: [authorId], references: [id])
    authorId String?

    // allow read for all signin users
    @@allow('read', auth() != null && published)

    // full access by author
    @@allow('all', author == auth())
}
`
        );

        // add zenstack/schema.prisma to .gitignore
        const gitIgnorePath = path.join(projectPath, '.gitignore');
        let gitIgnoreContent = '';
        if (fs.existsSync(gitIgnorePath)) {
            gitIgnoreContent =
                fs.readFileSync(gitIgnorePath, { encoding: 'utf-8' }) + '\n';
        }

        if (!gitIgnoreContent.includes('zenstack/schema.prisma')) {
            gitIgnoreContent += 'zenstack/schema.prisma\n';
            fs.writeFileSync(gitIgnorePath, gitIgnoreContent);
        }

        schemaGenerated = true;
    }

    installPackage('zenstack', true, undefined, projectPath);
    installPackage('@zenstackhq/runtime', false, undefined, projectPath);

    if (schemaGenerated) {
        console.log(`Sample model generated at: ${colors.green(schema)}

        Please check the following guide on how to model your app:
            https://zenstack.dev/#/modeling-your-app.
        `);
    }
}

/**
 * Loads a zmodel document from a file.
 * @param fileName File name
 * @param services Language services
 * @returns Parsed and validated AST
 */
export async function loadDocument(
    fileName: string,
    services: LangiumServices
): Promise<Model> {
    const extensions = services.LanguageMetaData.fileExtensions;
    if (!extensions.includes(path.extname(fileName))) {
        console.error(
            colors.yellow(`Please choose a file with extension: ${extensions}.`)
        );
        throw new CliError('invalid schema file');
    }

    if (!fs.existsSync(fileName)) {
        console.error(colors.red(`File ${fileName} does not exist.`));
        throw new CliError('schema file does not exist');
    }

    // load standard library
    const stdLib =
        services.shared.workspace.LangiumDocuments.getOrCreateDocument(
            URI.file(
                path.resolve(
                    path.join(__dirname, '../res', STD_LIB_MODULE_NAME)
                )
            )
        );

    // load the document
    const document =
        services.shared.workspace.LangiumDocuments.getOrCreateDocument(
            URI.file(path.resolve(fileName))
        );

    // build the document together with standard library
    await services.shared.workspace.DocumentBuilder.build([stdLib, document], {
        validationChecks: 'all',
    });

    const validationErrors = (document.diagnostics ?? []).filter(
        (e) => e.severity === 1
    );
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

export async function runGenerator(
    options: { schema: string; packageManager: string },
    includedGenerators?: string[],
    clearOutput = true
) {
    const services = createZModelServices(NodeFileSystem).ZModel;
    const model = await loadDocument(options.schema, services);

    const context: Context = {
        schema: model,
        outDir: path.dirname(options.schema),
        // TODO: make this configurable
        generatedCodeDir: GENERATED_CODE_PATH,
    };

    try {
        await new ZenStackGenerator().generate(
            context,
            includedGenerators,
            clearOutput
        );
    } catch (err) {
        if (err instanceof GeneratorError) {
            console.error(colors.red(err.message));
            throw new CliError(err.message);
        }
    }
}
