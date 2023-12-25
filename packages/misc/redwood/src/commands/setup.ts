import colors from 'colors';
import fs from 'fs';
import ora from 'ora';
import path from 'path';
import { exit } from 'process';
import { Project, SyntaxKind, type PropertyAssignment } from 'ts-morph';
import type { CommandModule } from 'yargs';
import { execSync } from '../utils';

export interface SetupOptions {
    side: string;
    prisma: string;
}

function installDependencies(args: SetupOptions) {
    const spinner = ora(`Installing dependencies in "${args.side}"`).start();
    try {
        execSync('yarn add --dev zenstack@latest');
        execSync('yarn add @zenstackhq/runtime@latest @zenstackhq/redwood@latest');
        spinner.succeed();
    } catch (err) {
        spinner.fail();
        throw err;
    }
}

function bootstrapSchema(args: SetupOptions) {
    const spinner = ora('Bootstrapping schema').start();
    try {
        const zmodel = path.join(path.dirname(args.prisma), 'schema.zmodel');
        if (!fs.existsSync(zmodel)) {
            fs.cpSync(args.prisma, zmodel);
        } else {
            console.warn(colors.blue(`\nSchema file "${zmodel}" already exists. Skipping.`));
        }

        const pkgJson = path.join('./package.json');
        if (fs.existsSync(pkgJson)) {
            const content = fs.readFileSync(pkgJson, 'utf-8');
            const pkg = JSON.parse(content);
            if (!pkg.zenstack) {
                pkg.zenstack = { schema: zmodel };
                fs.writeFileSync(pkgJson, JSON.stringify(pkg, null, 4));
            }
        }

        spinner.succeed();
    } catch (err) {
        spinner.fail();
        throw err;
    }
}

function installGraphQLPlugin(args: SetupOptions) {
    const spinner = ora('Installing GraphQL plugin').start();
    try {
        let sourcePath: string | undefined;
        if (fs.existsSync(path.join('src', 'functions', 'graphql.ts'))) {
            sourcePath = path.join('src', 'functions', 'graphql.ts');
        } else if (fs.existsSync(path.join('src', 'functions', 'graphql.js'))) {
            sourcePath = path.join('src', 'functions', 'graphql.js');
        }

        if (!sourcePath) {
            console.error(
                colors.red(
                    `Unable to find handler source file: ${path.join(args.side, 'src', 'functions', 'graphql.(js|ts)')}`
                )
            );
            exit(1);
        }

        const project = new Project();
        const sf = project.addSourceFileAtPathIfExists(sourcePath)!;
        let changed = false;
        let identified = false;

        const imports = sf.getImportDeclarations();
        if (!imports.some((i) => i.getModuleSpecifierValue() === '@zenstackhq/redwood')) {
            sf.addImportDeclaration({
                moduleSpecifier: '@zenstackhq/redwood',
                namedImports: ['useZenStack'],
            });
            changed = true;
        }

        sf.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((expr) => {
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
                                changed = true;
                            }
                        }
                    } else {
                        arg.addPropertyAssignment({
                            name: 'extraPlugins',
                            initializer: '[useZenStack(db)]',
                        });
                        changed = true;
                    }
                }
            }
        });

        if (!identified) {
            console.warn(
                colors.yellow(
                    '\nUnable to determine how to install ZenStack GraphQL plugin. Please add it manually following https://zenstack.dev/docs/guides/redwood.'
                )
            );
        }

        if (changed) {
            sf.formatText();
            project.saveSync();
        }

        spinner.succeed();
    } catch (err) {
        spinner.fail();
        throw err;
    }
}

const setupCommand: CommandModule<unknown, SetupOptions> = {
    command: 'setup',
    describe: 'Set up ZenStack environment',
    builder: (yargs) => {
        return yargs
            .option('side', { alias: 's', default: 'api' })
            .option('prisma', { alias: 'p', default: 'db/schema.prisma' });
    },
    handler: async (args) => {
        if (!fs.existsSync(args.side)) {
            console.error(
                colors.red(`Can't find side directory "${args.side}". Use --side to specify a side directory.`)
            );
            exit(1);
        }

        const prismaSchema = path.join(args.side, args.prisma);
        if (!fs.existsSync(prismaSchema)) {
            console.error(
                colors.red(`Can't find Prisma schema "${prismaSchema}". Use --prisma to specify a different location.`)
            );
            exit(1);
        }

        process.chdir(args.side);
        installDependencies(args);
        bootstrapSchema(args);
        installGraphQLPlugin(args);
    },
};

export default setupCommand;
