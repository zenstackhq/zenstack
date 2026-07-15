import type { ConfirmDataLossCallback, RenameMapping, RenameResolver } from '@zenstackhq/migration';
import colors from 'colors';
import readline from 'node:readline';
import { logInfo, logWarning } from '../utils/log';

/**
 * Builds a {@link RenameResolver} that interactively asks the user, for each newly appearing
 * table/column, whether it is genuinely new or a rename of something that was removed —
 * mirroring Drizzle's rename resolution. Choosing "rename" preserves the data (a `RENAME`
 * is emitted); choosing "create" falls back to drop + create.
 *
 * Requires an interactive TTY. In a non-interactive environment (CI, piped input) this
 * returns `undefined` so the engine keeps the safe default (drop + create) instead of
 * hanging on a prompt that can never be answered.
 */
export function createInteractiveRenameResolver(): RenameResolver | undefined {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        return undefined;
    }
    return {
        resolveTableRenames: (q) => resolve('table', undefined, q),
        resolveColumnRenames: (q) => resolve('column', q.table, q),
    };
}

/**
 * Builds a {@link ConfirmDataLossCallback} that prints the detected destructive changes and
 * interactively asks the user to confirm before the migration is created and applied.
 *
 * Requires an interactive TTY. In a non-interactive environment (CI, piped input) this
 * returns `undefined` so the caller can decide how to proceed (typically abort) instead of
 * hanging on a prompt that can never be answered.
 */
export function createInteractiveDataLossConfirmer(): ConfirmDataLossCallback | undefined {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        return undefined;
    }
    return (warnings) => {
        logWarning('\n⚠️  Destructive changes detected:');
        for (const warning of warnings) {
            logWarning(`  - ${warning}`);
        }
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        return new Promise<boolean>((resolve) => {
            rl.question(`${colors.bold('Are you sure you want to create and apply this migration?')} (y/N) `, (answer) => {
                rl.close();
                const text = answer.trim().toLowerCase();
                resolve(text === 'y' || text === 'yes');
            });
        }).finally(() => rl.close());
    };
}

async function resolve(
    kind: 'table' | 'column',
    table: string | undefined,
    query: { created: string[]; deleted: string[] },
): Promise<RenameMapping[]> {
    const available = [...query.deleted];
    const mappings: RenameMapping[] = [];
    const noun = kind === 'table' ? 'table' : 'column';
    const Noun = kind === 'table' ? 'Table' : 'Column';
    const scope = kind === 'column' ? ` in "${table}"` : '';

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        logInfo(
            colors.cyan(
                `\nDetected new ${noun}(s)${scope}. For each, choose whether it is newly created ` +
                    `or renamed from a removed ${noun} (renaming preserves data):`,
            ),
        );
        for (const created of query.created) {
            if (available.length === 0) {
                break; // nothing left to rename from — the remaining ones are creates
            }
            const options = [
                `create new ${noun} "${created}"`,
                ...available.map((removed) => `rename "${removed}" → "${created}"`),
            ];
            const choice = await ask(rl, `${Noun} "${created}"`, options);
            if (choice > 0) {
                const from = available[choice - 1]!;
                mappings.push({ from, to: created });
                available.splice(choice - 1, 1); // don't offer the same source twice
            }
        }
    } finally {
        rl.close();
    }
    return mappings;
}

/**
 * Renders a numbered menu and reads a valid selection, returning the 0-based index into
 * `options`. Empty input selects `0` (the safe "create new" default); invalid input re-prompts.
 */
function ask(rl: readline.Interface, prompt: string, options: string[]): Promise<number> {
    const lines = [colors.bold(prompt)];
    options.forEach((opt, i) => lines.push(`  ${colors.green(String(i))}) ${opt}`));
    const menu = `${lines.join('\n')}\n${colors.gray('[default 0]')} > `;

    return new Promise((resolve) => {
        const askOnce = () => {
            rl.question(menu, (answer) => {
                const text = answer.trim();
                const n = text === '' ? 0 : Number(text);
                if (Number.isInteger(n) && n >= 0 && n < options.length) {
                    resolve(n);
                } else {
                    logInfo(colors.yellow(`Please enter a number between 0 and ${options.length - 1}.`));
                    askOnce();
                }
            });
        };
        askOnce();
    });
}
