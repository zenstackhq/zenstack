import { getInstalledRedwoodVersion, getPaths, updateTomlConfig } from '@redwoodjs/cli-helpers';
import colors from 'colors';
import execa from 'execa';
import fs from 'fs';
import { Listr, ListrTask } from 'listr2';
import path from 'path';
import semver from 'semver';
import terminalLink from 'terminal-link';
import { Project, SyntaxKind, type PropertyAssignment } from 'ts-morph';
import type { CommandModule } from 'yargs';
import { addApiPackages } from '../utils';

function updateToml() {
    return {
        title: 'Updating redwood.toml...',
        task: () => {
            updateTomlConfig('@zenstackhq/redwood');
        },
    };
}

function installDependencies() {
    return addApiPackages([
        { pkg: 'zenstack', dev: true },
        { pkg: '@zenstackhq/runtime' },
        { pkg: '@zenstackhq/redwood' },
    ]);
}

// copy schema.prisma to schema.zmodel, and update package.json
function bootstrapSchema() {
    return {
        title: 'Bootstrapping ZModel schema...',
        task: () => {
            const apiPaths = getPaths().api;
            const zmodel = path.join(path.dirname(apiPaths.dbSchema), 'schema.zmodel');
            if (!fs.existsSync(zmodel)) {
                fs.cpSync(apiPaths.dbSchema, zmodel);
            } else {
                console.info(
                    colors.blue(`Schema file "${path.relative(getPaths().base, zmodel)}" already exists. Skipping.`)
                );
            }

            const pkgJson = path.join(apiPaths.base, 'package.json');
            if (fs.existsSync(pkgJson)) {
                const content = fs.readFileSync(pkgJson, 'utf-8');
                const pkg = JSON.parse(content);
                if (!pkg.zenstack) {
                    pkg.zenstack = {
                        schema: path.relative(apiPaths.base, zmodel),
                        prisma: path.relative(apiPaths.base, apiPaths.dbSchema),
                    };
                    fs.writeFileSync(pkgJson, JSON.stringify(pkg, null, 4));
                }
            }
        },
    };
}

// install ZenStack GraphQLYoga plugin
function installGraphQLPlugin() {
    return {
        title: 'Installing GraphQL plugin...',
        task: async () => {
            // locate "api/functions/graphql.[js|ts]"
            let graphQlSourcePath: string | undefined;
            const functionsDir = getPaths().api.functions;
            if (fs.existsSync(path.join(functionsDir, 'graphql.ts'))) {
                graphQlSourcePath = path.join(functionsDir, 'graphql.ts');
            } else if (fs.existsSync(path.join(functionsDir, 'graphql.js'))) {
                graphQlSourcePath = path.join(functionsDir, 'graphql.js');
            }

            if (!graphQlSourcePath) {
                console.warn(
                    colors.yellow(`Unable to find handler source file: ${path.join(functionsDir, 'graphql.(js|ts)')}`)
                );
                return;
            }

            // add import
            const project = new Project();
            const graphQlSourceFile = project.addSourceFileAtPathIfExists(graphQlSourcePath)!;
            let graphQlSourceFileChanged = false;
            let identified = false;

            const imports = graphQlSourceFile.getImportDeclarations();
            if (!imports.some((i) => i.getModuleSpecifierValue() === '@zenstackhq/redwood')) {
                graphQlSourceFile.addImportDeclaration({
                    moduleSpecifier: '@zenstackhq/redwood',
                    namedImports: ['useZenStack'],
                });
                graphQlSourceFileChanged = true;
            }

            // add "extraPlugins" option to `createGraphQLHandler` call
            graphQlSourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((expr) => {
                if (identified) {
                    return;
                }

                if (expr.getExpression().asKind(SyntaxKind.Identifier)?.getText() === 'createGraphQLHandler') {
                    const arg = expr.getArguments()[0]?.asKind(SyntaxKind.ObjectLiteralExpression);
                    if (arg) {
                        identified = true;
                        const props = arg.getProperties();
                        const pluginsProp = props.find(
                            (p): p is PropertyAssignment =>
                                p.asKind(SyntaxKind.PropertyAssignment)?.getName() === 'extraPlugins'
                        );
                        if (pluginsProp) {
                            const pluginArr = pluginsProp.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
                            if (pluginArr) {
                                if (!pluginArr.getElements().some((e) => e.getText().includes('useZenStack'))) {
                                    pluginArr.addElement('useZenStack(db)');
                                    graphQlSourceFileChanged = true;
                                }
                            }
                        } else {
                            arg.addPropertyAssignment({
                                name: 'extraPlugins',
                                initializer: '[useZenStack(db)]',
                            });
                            graphQlSourceFileChanged = true;
                        }
                    }
                }
            });

            if (!identified) {
                console.warn(
                    colors.yellow(
                        'Unable to determine how to install ZenStack GraphQL plugin. Please add it manually following https://zenstack.dev/docs/guides/redwood.'
                    )
                );
            }

            if (graphQlSourceFileChanged) {
                graphQlSourceFile.formatText();
            }

            // create type-def file to add `db` into global context
            let contextTypeDefCreated = false;
            if (graphQlSourcePath.endsWith('.ts')) {
                const typeDefPath = path.join(getPaths().api.src, 'zenstack.d.ts');
                if (!fs.existsSync(typeDefPath)) {
                    const rwVersion: string = getInstalledRedwoodVersion();
                    const contextModule =
                        rwVersion && semver.lt(rwVersion, '7.0.0')
                            ? '@redwoodjs/graphql-server' // pre v7
                            : '@redwoodjs/context'; // v7+

                    const typeDefSourceFile = project.createSourceFile(
                        typeDefPath,
                        `import type { PrismaClient } from '@zenstackhq/runtime'

declare module '${contextModule}' {
  interface GlobalContext {
    db: PrismaClient
  }
}
`
                    );
                    typeDefSourceFile.formatText();
                    contextTypeDefCreated = true;
                }
            }

            if (graphQlSourceFileChanged || contextTypeDefCreated) {
                await project.save();
            }
        },
    };
}

// eject templates used for `yarn rw generate service`
function ejectServiceTemplates() {
    return {
        title: 'Ejecting service templates...',
        task: async () => {
            if (fs.existsSync(path.join(getPaths().api.base, 'generators', 'service'))) {
                console.info(colors.blue('Service templates already ejected. Skipping.'));
                return;
            }

            await execa('yarn', ['rw', 'setup', 'generator', 'service'], { cwd: getPaths().api.base });
            const serviceTemplateTsFile = path.join(
                getPaths().api.base,
                'generators',
                'service',
                'service.ts.template'
            );
            const serviceTemplateJsFile = path.join(
                getPaths().api.base,
                'generators',
                'service',
                'service.js.template'
            );
            const serviceTemplateFile = fs.existsSync(serviceTemplateTsFile)
                ? serviceTemplateTsFile
                : fs.existsSync(serviceTemplateJsFile)
                ? serviceTemplateJsFile
                : undefined;

            if (!serviceTemplateFile) {
                console.warn(colors.red('Unable to find the ejected service template file.'));
                return;
            }

            // replace `db.` with `context.db.`
            const templateContent = fs.readFileSync(serviceTemplateFile, 'utf-8');
            const newTemplateContent = templateContent
                .replace(/^import { db } from.*\n$/gm, '')
                .replace(/return db\./g, 'return context.db.');
            fs.writeFileSync(serviceTemplateFile, newTemplateContent);
        },
    };
}

function whatsNext() {
    const zmodel = path.relative(getPaths().base, path.join(path.dirname(getPaths().api.dbSchema), 'schema.zmodel'));
    const task: ListrTask = {
        title: `What's next...`,
        task: (_ctx, task) => {
            task.title =
                `What's next...\n\n` +
                `   - Install ${terminalLink('IDE extensions', 'https://zenstack.dev/docs/guides/ide')}.\n` +
                `   - Use "${zmodel}" to model database schema and access control.\n` +
                `   - Run \`yarn rw @zenstackhq generate\` to regenerate Prisma schema and client.\n` +
                `   - Learn ${terminalLink(
                    "how ZenStack extends Prisma's power",
                    'https://zenstack.dev/docs/the-complete-guide/part1'
                )}.\n` +
                `   - Create a sample schema with \`yarn rw @zenstackhq sample\`.\n` +
                `   - Join ${terminalLink(
                    'Discord community',
                    'https://discord.gg/Ykhr738dUe'
                )} for questions and updates.\n`;
        },
    };
    return task;
}

const setupCommand: CommandModule<unknown> = {
    command: 'setup',
    describe: 'Set up ZenStack environment',
    builder: (yargs) => yargs,
    handler: async () => {
        const tasks = new Listr([
            updateToml(),
            installDependencies(),
            bootstrapSchema(),
            installGraphQLPlugin(),
            ejectServiceTemplates(),
            whatsNext(),
        ]);

        try {
            await tasks.run();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            console.error(colors.red(e.message));
            process.exit(e?.exitCode || 1);
        }
    },
};

export default setupCommand;
