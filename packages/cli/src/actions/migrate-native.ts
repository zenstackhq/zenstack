import { type MigrationEngine, type SchemaChange } from '@zenstackhq/migration';
import colors from 'colors';
import { CliError } from '../cli-error';
import { logInfo, logSuccess, logWarning } from '../utils/log';
import { prepareEngine } from './migration-support';
import { createInteractiveDataLossConfirmer, createInteractiveRenameResolver } from './rename-prompt';
import { run as runSeed } from './seed';

type CommonOptions = {
    schema?: string;
    output?: string;
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

type ResolveOptions = CommonOptions & {
    applied?: string;
    rolledBack?: string;
};

type DeployResult = Awaited<ReturnType<MigrationEngine['deploy']>>;

/**
 * CLI action for migration-related commands, backed by the native ZenStack migration engine.
 */
export async function run(command: string, options: CommonOptions) {
    switch (command) {
        case 'dev':
            await runDev(options as DevOptions);
            break;
        case 'baseline':
            await runBaseline(options as DevOptions);
            break;
        case 'reset':
            await runReset(options as ResetOptions);
            break;
        case 'deploy':
            await runDeploy(options);
            break;
        case 'status':
            await runStatus(options);
            break;
        case 'resolve':
            await runResolve(options as ResolveOptions);
            break;
    }
}

async function runBaseline(options: DevOptions) {
    const { engine } = await prepareEngine(options);
    const result = await engine.baseline(options.name ?? 'baseline');
    if (result.created) {
        logSuccess(`Baselined: ${result.name}`);
        logInfo(
            'Recorded the current schema state as already applied. Future migrations diff forward from here, ' +
                'so your existing database is left untouched.',
        );
        reportUnsupported(result.changes);
    } else {
        logInfo('Nothing to baseline — the schema has no models.');
    }
}

async function runResolve(options: ResolveOptions) {
    if (options.rolledBack) {
        throw new CliError(
            '`migrate resolve --rolled-back` is not supported by the native engine. Failed migrations are resolved by rolling forward.',
        );
    }
    if (!options.applied) {
        throw new CliError('`migrate resolve` requires `--applied <migration>` with the native engine.');
    }
    const { engine } = await prepareEngine(options);
    await engine.resolveApplied(options.applied);
    logSuccess(`Marked migration as applied: ${options.applied}`);
}

async function runDev(options: DevOptions) {
    // interactively disambiguate renames vs drop+create when a TTY is available
    const resolver = createInteractiveRenameResolver();

    // with --create-only nothing gets applied, so destructive changes need no confirmation —
    // the warnings are printed after generation instead. Otherwise confirm interactively, or
    // refuse in a non-interactive session.
    const interactiveConfirmer = options.createOnly ? undefined : createInteractiveDataLossConfirmer();
    const confirmDataLoss = options.createOnly
        ? undefined
        : (interactiveConfirmer ??
          ((warnings: string[]) => {
              printDataLossWarnings(warnings);
              return false;
          }));

    const { engine } = await prepareEngine({ ...options, resolver, confirmDataLoss });

    // diff the compiled schema into a new migration
    const result = await engine.generate(options.name ?? 'migration');

    if (result.aborted) {
        if (interactiveConfirmer) {
            throw new CliError('Migration aborted. No migration was created and nothing was applied.');
        }
        throw new CliError(
            'Destructive changes detected and confirmation is unavailable in a non-interactive session. ' +
                'Re-run in an interactive terminal to confirm, or use --create-only to author the migration and review it before applying.',
        );
    }

    if (result.created) {
        logSuccess(`Created migration: ${result.name}`);
        if (options.createOnly && result.warnings.length > 0) {
            printDataLossWarnings(result.warnings);
        }
        reportUnsupported(result.changes);
    } else {
        logInfo('No schema changes detected. Your migrations are up to date.');
    }

    if (options.createOnly) {
        return;
    }

    reportDeploy(await engine.deploy());
    await maybeSeed(options);
}

function printDataLossWarnings(warnings: string[]) {
    logWarning('\n⚠️  Destructive changes detected:');
    for (const warning of warnings) {
        logWarning(`  - ${warning}`);
    }
}

async function runDeploy(options: CommonOptions) {
    const { engine } = await prepareEngine(options);
    reportDeploy(await engine.deploy());
}

async function runStatus(options: CommonOptions) {
    const { engine } = await prepareEngine(options);
    const status = await engine.status();
    if (status.length === 0) {
        logInfo('No migrations found.');
        return;
    }
    for (const m of status) {
        const label = m.applied ? colors.green('applied') : colors.yellow('pending');
        logInfo(`  ${label}  ${m.name}`);
    }
}

async function runReset(options: ResetOptions) {
    const { engine } = await prepareEngine(options);
    logWarning('Dropping all tables and re-applying migrations. All data will be lost.');
    reportDeploy(await engine.reset());
    await maybeSeed(options);
}

function reportUnsupported(changes: SchemaChange[]) {
    const hasUnsupported = changes.some((c) => c.kind === 'unsupported');
    if (!hasUnsupported) {
        return;
    }
    logWarning('\nSome changes could not be generated automatically and need manual authoring:');
    for (const change of changes) {
        if (change.kind === 'unsupported') {
            logWarning(`  - ${change.description}`);
        }
    }
    logWarning('Edit the generated migration.ts before applying it.\n');
}

function reportDeploy(result: DeployResult) {
    if (result.error) {
        const message = result.error instanceof Error ? result.error.message : String(result.error);
        throw new CliError(`Migration failed: ${message}`);
    }
    const applied = result.results?.filter((r) => r.status === 'Success') ?? [];
    if (applied.length === 0) {
        logInfo('No pending migrations to apply.');
        return;
    }
    for (const r of applied) {
        logSuccess(`Applied migration: ${r.migrationName}`);
    }
}

async function maybeSeed(options: CommonOptions) {
    if (!options.skipSeed) {
        await runSeed({ noWarnings: true, printStatus: true }, []);
    }
}
