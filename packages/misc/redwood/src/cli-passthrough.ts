import { getPaths } from '@redwoodjs/cli-helpers';
import colors from 'colors';
import execa from 'execa';
import { CommandModule } from 'yargs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runCommand(command: string, options: any) {
    const args = ['zenstack', command];
    for (const [name, value] of Object.entries(options)) {
        args.push(name.length > 1 ? `--${name}` : `-${name}`);
        if (typeof value === 'string') {
            // Make sure options that take multiple quoted words
            // are passed to zenstack with quotes.
            value.split(' ').length > 1 ? args.push(`"${value}"`) : args.push(value);
        }
    }

    const packageExec = process?.versions?.bun ? 'bunx' : 'npx';

    console.log();
    console.log(colors.green('Running ZenStack CLI...'));
    console.log(colors.underline(`$ ${packageExec} ` + args.join(' ')));
    console.log();

    try {
        await execa(packageExec, args, { cwd: getPaths().api.base, shell: true, stdio: 'inherit', cleanup: true });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
        process.exit(e?.exitCode || 1);
    }
}

/**
 * Creates a yargs command that passes all options to the ZenStack CLI command.
 */
export function makePassthroughCommand(command: string): CommandModule<unknown> {
    return {
        command,
        describe: `Run \`zenstack ${command} ...\``,
        builder: (yargs) => {
            return yargs
                .strictOptions(false)
                .strictCommands(false)
                .strict(false)
                .parserConfiguration({ 'camel-case-expansion': false, 'boolean-negation': false });
        },
        handler: async ({ _, $0: _$0, ...options }) => {
            await runCommand(command, options);
        },
    };
}
