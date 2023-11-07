/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-var-requires */
import colors from 'colors';
import path from 'path';
import prettyRepl from 'pretty-repl';
import { inspect } from 'util';

// inspired by: https://github.com/Kinjalrk2k/prisma-console

/**
 * CLI action for starting a REPL session
 */
export async function repl(projectPath: string, options: { debug?: boolean; prismaClient?: string }) {
    console.log('Welcome to ZenStack REPL. See help with the ".help" command.');
    console.log('Global variables:');
    console.log(`    ${colors.cyan('db')} to access enhanced PrismaClient`);
    console.log(`    ${colors.cyan('prisma')} to access raw PrismaClient`);
    console.log('Commands:');
    console.log(`    ${colors.magenta('.auth { id: ... }')} - set current user`);
    console.log(`    ${colors.magenta('.table')}            - toggle table output`);
    console.log();
    console.log(`Running as anonymous user. Use ${colors.magenta('.auth')} to set current user.`);

    if (options.debug) {
        console.log('Debug mode:', options.debug);
    }

    const prismaClientModule = options.prismaClient ?? path.join(projectPath, './node_modules/.prisma/client');
    const { PrismaClient } = require(prismaClientModule);
    const prisma = new PrismaClient(options.debug ? { log: ['info'] } : undefined);
    // workaround for https://github.com/prisma/prisma/issues/18292
    prisma[Symbol.for('nodejs.util.inspect.custom')] = 'PrismaClient';

    const { enhance } = require('@zenstackhq/runtime');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let db = enhance(prisma, undefined, { logPrismaQuery: options.debug });

    const auth = (user: unknown) => {
        // recreate enhanced PrismaClient
        db = replServer.context.db = enhance(prisma, { user }, { logPrismaQuery: options.debug });
        if (user) {
            replServer.setPrompt(`${inspect(user)} > `);
        } else {
            replServer.setPrompt('anonymous > ');
        }
    };

    let table = false;

    const replServer = prettyRepl.start({
        prompt: 'anonymous > ',
        eval: async (cmd, _context, _filename, callback) => {
            try {
                let r: any = undefined;
                let isPrismaCall = false;

                if (cmd.includes('await ')) {
                    // eval can't handle top-level await, so we wrap it in an async function
                    cmd = `(async () => (${cmd}))()`;
                    r = eval(cmd);
                    if (isPrismaPromise(r)) {
                        isPrismaCall = true;
                    }
                    r = await r;
                } else {
                    r = eval(cmd);
                    if (isPrismaPromise(r)) {
                        isPrismaCall = true;
                        // automatically await Prisma promises
                        r = await r;
                    }
                }

                if (isPrismaCall && table) {
                    console.table(r);
                    callback(null, undefined);
                } else {
                    callback(null, r);
                }
            } catch (err) {
                callback(err as Error, undefined);
            }
        },
    });

    replServer.defineCommand('table', {
        help: 'Toggle table output',
        action(value: string) {
            if (value && value !== 'on' && value !== 'off' && value !== 'true' && value !== 'false') {
                console.error('Invalid argument. Usage: .table [on|off|true|false]');
                this.displayPrompt();
                return;
            }
            this.clearBufferedCommand();
            table = value ? value === 'on' || value === 'true' : !table;
            console.log('Table output:', table);
            this.displayPrompt();
        },
    });

    replServer.defineCommand('auth', {
        help: 'Set current user. Run without argument to switch to anonymous. Pass an user object to set current user.',
        action(value: string) {
            this.clearBufferedCommand();
            try {
                if (!value?.trim()) {
                    // set anonymous
                    auth(undefined);
                    console.log(`Auth user: anonymous. Use ".auth { id: ... }" to change.`);
                } else {
                    // set current user
                    const user = eval(`(${value})`);
                    console.log(user);
                    if (!user || typeof user !== 'object') {
                        console.error(`Invalid argument. Pass a user object like { id: ... }`);
                        this.displayPrompt();
                        return;
                    }
                    auth(user);
                    console.log(`Auth user: ${inspect(user)}. Use ".auth" to switch to anonymous.`);
                }
            } catch (err: any) {
                console.error('Unable to set auth user:', err.message);
            }
            this.displayPrompt();
        },
    });

    replServer.setupHistory(path.join(projectPath, './.zenstack_repl_history'), (err) => {
        if (err) {
            console.error('unable to setup REPL history:', err);
        }
    });

    replServer.context.prisma = prisma;
    replServer.context.db = enhance(prisma, undefined, { logPrismaQuery: options.debug });
    replServer.context.auth = auth;
}

function isPrismaPromise(r: any) {
    return r?.[Symbol.toStringTag] === 'PrismaPromise' || r?.[Symbol.toStringTag] === 'ZenStackPromise';
}
