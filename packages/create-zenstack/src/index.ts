import colors from 'colors';
import { Command } from 'commander';
import { execSync, type StdioOptions } from 'node:child_process';
import fs from 'node:fs';
import ora from 'ora';
import { STARTER_MAIN_TS, STARTER_ZMODEL } from './templates';

// detect package manager
const npmAgent = process.env['npm_config_user_agent'];
let agent = 'npm';
let agentExec = 'npx';
let saveDev = '--save-dev';

if (npmAgent?.includes('pnpm')) {
    agent = 'pnpm';
    agentExec = 'pnpm';
} else if (npmAgent?.includes('yarn')) {
    agent = 'yarn';
    agentExec = 'npx';
    saveDev = '--dev';
} else if (npmAgent?.includes('bun')) {
    agent = 'bun';
    agentExec = 'bun';
}

const program = new Command('create-zenstack');

program.arguments('<project-name>').action((projectName) => {
    initProject(projectName);
});

program.parse(process.argv);

function initProject(name: string) {
    // create folder
    if (fs.existsSync(name)) {
        console.log(colors.red(`Directory ${name} already exists.`));
        process.exit(1);
    }
    fs.mkdirSync(name);
    process.chdir(name);

    console.log(colors.gray(`Using package manager: ${agent}`));

    // create package.json
    fs.writeFileSync(
        'package.json',
        JSON.stringify(
            {
                name: 'zenstack-app',
                version: '1.0.0',
                description: 'Scaffolded with create-zenstack',
                type: 'module',
                scripts: {
                    dev: 'tsx main.ts',
                },
                license: 'ISC',
            },
            null,
            2,
        ),
    );

    // create VSCode config files
    createVsCodeConfig();

    // install packages
    const packages = [
        { name: '@zenstackhq/cli@latest', dev: true },
        { name: '@zenstackhq/schema@latest', dev: false },
        { name: '@zenstackhq/orm@latest', dev: false },
        { name: 'better-sqlite3', dev: false },
        { name: '@types/better-sqlite3', dev: true },
        { name: 'typescript', dev: true },
        { name: 'tsx', dev: true },
        { name: '@types/node', dev: true },
    ];
    for (const pkg of packages) {
        installPackage(pkg);
    }

    // create tsconfig.json
    fs.writeFileSync(
        'tsconfig.json',
        JSON.stringify(
            {
                compilerOptions: {
                    module: 'esnext',
                    target: 'esnext',
                    moduleResolution: 'bundler',
                    sourceMap: true,
                    outDir: 'dist',
                    strict: true,
                    skipLibCheck: true,
                    esModuleInterop: true,
                },
            },
            null,
            2,
        ),
    );

    // create schema.zmodel
    fs.mkdirSync('zenstack');
    fs.writeFileSync('zenstack/schema.zmodel', STARTER_ZMODEL);

    // create main.ts
    fs.writeFileSync('main.ts', STARTER_MAIN_TS);

    // run `zen generate`
    runCommand(`${agentExec} zen generate`, 'Running `zen generate`');

    // run `zen db push`
    runCommand(`${agentExec} zen db push`, 'Running `zen db push`');

    // run `$agent run dev`
    console.log(`Running \`${agent} run dev\``);
    execSync(`${agent} run dev`, { stdio: 'inherit' });
    console.log(colors.green('Project setup completed!'));
}

function installPackage(pkg: { name: string; dev: boolean }) {
    runCommand(`${agent} install ${pkg.name} ${pkg.dev ? saveDev : ''}`, `Installing "${pkg.name}"`);
}

function runCommand(cmd: string, status: string, stdio: StdioOptions = 'ignore') {
    const spinner = ora(status).start();
    try {
        execSync(cmd, { stdio });
        spinner.succeed();
    } catch (e) {
        spinner.fail();
        throw e;
    }
}

function createVsCodeConfig() {
    fs.mkdirSync('.vscode', { recursive: true });
    fs.writeFileSync(
        '.vscode/settings.json',
        JSON.stringify(
            {
                'files.associations': {
                    '*.zmodel': 'zmodel-v3',
                },
            },
            null,
            4,
        ),
    );
    fs.writeFileSync('.vscode/extensions.json', JSON.stringify({ recommendations: ['zenstack.zenstack-v3'] }, null, 4));
}
