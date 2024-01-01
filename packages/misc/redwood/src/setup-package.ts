import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import setupCommand from './commands/setup';

export default async function setupPackage() {
    await yargs(hideBin(process.argv))
        .scriptName('zenstack-setup')
        // @ts-expect-error yargs types are wrong
        .command('$0', 'set up ZenStack', setupCommand.builder, setupCommand.handler)
        .parseAsync();
}
