import { isPlugin, type Model } from '@zenstackhq/language/ast';
import colors from 'colors';
import path from 'node:path';
import { getPluginProvider, getSchemaFile, loadPluginModule, loadSchemaDocument } from './action-utils';

type Options = {
    schema?: string;
};

/**
 * CLI action for checking a schema's validity.
 */
export async function run(options: Options) {
    const schemaFile = getSchemaFile(options.schema);

    try {
        const model = await loadSchemaDocument(schemaFile);
        await checkPluginResolution(schemaFile, model);
        console.log(colors.green('✓ Schema validation completed successfully.'));
    } catch (error) {
        console.error(colors.red('✗ Schema validation failed.'));
        // Re-throw to maintain CLI exit code behavior
        throw error;
    }
}

async function checkPluginResolution(schemaFile: string, model: Model) {
    const plugins = model.declarations.filter(isPlugin);
    for (const plugin of plugins) {
        const provider = getPluginProvider(plugin);
        if (!provider.startsWith('@core/')) {
            await loadPluginModule(provider, path.dirname(schemaFile));
        }
    }
}
