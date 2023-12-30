import { makePassthroughCommand } from './cli-passthrough';
import setup from './commands/setup';

export const commands = [
    setup,
    makePassthroughCommand('generate'),
    makePassthroughCommand('info'),
    makePassthroughCommand('format'),
    makePassthroughCommand('repl'),
];
export * from './graphql';
