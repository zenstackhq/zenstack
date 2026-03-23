import fs from 'node:fs';
import path from 'node:path';
import { CliError } from '../cli-error';
import { execPrisma } from '../utils/exec-utils';
import { generateTempPrismaSchema, getSchemaFile, requireDataSourceUrl } from './action-utils';
import { run as runSeed } from './seed';

type CommonOptions = {
    schema?: string;
    migrations?: string;
    skipSeed?: boolean;
};

type DevOptions = CommonOptions & {
    name?: string;
    createOnly?: boolean;
};

type ResetOptions = CommonOptions & {
    force?: boolean;
};

type DeployOptions = CommonOptions;

type StatusOptions = CommonOptions;

type ResolveOptions = CommonOptions & {
    applied?: string;
    rolledBack?: string;
};

/**
 * CLI action for migration-related commands
 */
export async function run(command: string, options: CommonOptions) {
    const schemaFile = getSchemaFile(options.schema);

    // validate datasource url exists
    await requireDataSourceUrl(schemaFile);

    const prismaSchemaDir = options.migrations ? path.dirname(options.migrations) : undefined;
    const prismaSchemaFile = await generateTempPrismaSchema(schemaFile, prismaSchemaDir);

    try {
        switch (command) {
            case 'dev':
                await runDev(prismaSchemaFile, options as DevOptions);
                break;

            case 'reset':
                await runReset(prismaSchemaFile, options as ResetOptions);
                break;

            case 'deploy':
                await runDeploy(prismaSchemaFile, options as DeployOptions);
                break;

            case 'status':
                await runStatus(prismaSchemaFile, options as StatusOptions);
                break;

            case 'resolve':
                await runResolve(prismaSchemaFile, options as ResolveOptions);
                break;
        }
    } finally {
        if (fs.existsSync(prismaSchemaFile)) {
            fs.unlinkSync(prismaSchemaFile);
        }
    }
}

function runDev(prismaSchemaFile: string, options: DevOptions) {
    try {
        const cmd = [
            'migrate dev',
            ` --schema "${prismaSchemaFile}"`,
            ' --skip-generate',
            ' --skip-seed',
            options.name ? ` --name "${options.name}"` : '',
            options.createOnly ? ' --create-only' : '',
        ].join('');
        execPrisma(cmd);
    } catch (err) {
        handleSubProcessError(err);
    }
}

async function runReset(prismaSchemaFile: string, options: ResetOptions) {
    try {
        const cmd = [
            'migrate reset',
            ` --schema "${prismaSchemaFile}"`,
            ' --skip-generate',
            ' --skip-seed',
            options.force ? ' --force' : '',
        ].join('');
        execPrisma(cmd);
    } catch (err) {
        handleSubProcessError(err);
    }

    if (!options.skipSeed) {
        await runSeed({ noWarnings: true, printStatus: true }, []);
    }
}

function runDeploy(prismaSchemaFile: string, _options: DeployOptions) {
    try {
        const cmd = ['migrate deploy', ` --schema "${prismaSchemaFile}"`].join('');
        execPrisma(cmd);
    } catch (err) {
        handleSubProcessError(err);
    }
}

function runStatus(prismaSchemaFile: string, _options: StatusOptions) {
    try {
        execPrisma(`migrate status --schema "${prismaSchemaFile}"`);
    } catch (err) {
        handleSubProcessError(err);
    }
}

function runResolve(prismaSchemaFile: string, options: ResolveOptions) {
    if (!options.applied && !options.rolledBack) {
        throw new CliError('Either --applied or --rolled-back option must be provided');
    }

    try {
        const cmd = [
            'migrate resolve',
            ` --schema "${prismaSchemaFile}"`,
            options.applied ? ` --applied "${options.applied}"` : '',
            options.rolledBack ? ` --rolled-back "${options.rolledBack}"` : '',
        ].join('');
        execPrisma(cmd);
    } catch (err) {
        handleSubProcessError(err);
    }
}

function handleSubProcessError(err: unknown) {
    if (err instanceof Error && 'status' in err && typeof err.status === 'number') {
        process.exit(err.status);
    } else {
        process.exit(1);
    }
}
