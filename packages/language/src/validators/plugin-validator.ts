import type { ValidationAcceptor } from 'langium';
import { Plugin } from '../generated/ast';
import { getStringLiteral } from '../utils';
import { validateDuplicatedDeclarations, type AstValidator } from './common';

/**
 * Validates plugin declarations.
 */
export default class PluginValidator implements AstValidator<Plugin> {
    validate(plugin: Plugin, accept: ValidationAcceptor): void {
        validateDuplicatedDeclarations(plugin, plugin.fields, accept);
        this.validateProvider(plugin, accept);
    }

    private validateProvider(plugin: Plugin, accept: ValidationAcceptor) {
        const provider = plugin.fields.find((f) => f.name === 'provider');
        if (!provider) {
            accept('error', 'plugin must include a "provider" field', {
                node: plugin,
            });
            return;
        }

        const providerValue = getStringLiteral(provider.value);
        if (!providerValue) {
            accept('error', '"provider" must be set to a non-empty string literal', {
                node: provider.value,
            });
        }
    }
}
