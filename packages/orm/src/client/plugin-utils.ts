import { invariant } from '@zenstackhq/common-helpers';
import { ZodObject, type ZodType } from 'zod';
import {
    CoreCreateOperations,
    CoreDeleteOperations,
    CoreReadOperations,
    CoreUpdateOperations,
} from './crud/operations/base';
import type { AnyPlugin } from './plugin';

/**
 * Resolves the extended query args schema a plugin declares for the given operation.
 * Precedence: exact operation, then grouped `$create/$read/$update/$delete` (both merged
 * for `upsert`), then `$all`.
 */
export function getPluginExtQueryArgsSchema(plugin: AnyPlugin, operation: string): ZodObject | undefined {
    if (!plugin.queryArgs) {
        return undefined;
    }

    let result: ZodType | undefined;

    if (operation in plugin.queryArgs && plugin.queryArgs[operation]) {
        // most specific operation takes highest precedence
        result = plugin.queryArgs[operation];
    } else if (operation === 'upsert') {
        // upsert is special: it's in both CoreCreateOperations and CoreUpdateOperations
        // so we need to merge both $create and $update schemas to match the type system
        const createSchema =
            '$create' in plugin.queryArgs && plugin.queryArgs['$create'] ? plugin.queryArgs['$create'] : undefined;
        const updateSchema =
            '$update' in plugin.queryArgs && plugin.queryArgs['$update'] ? plugin.queryArgs['$update'] : undefined;

        if (createSchema && updateSchema) {
            invariant(createSchema instanceof ZodObject, 'Plugin extended query args schema must be a Zod object');
            invariant(updateSchema instanceof ZodObject, 'Plugin extended query args schema must be a Zod object');
            // merge both schemas (combines their properties)
            result = createSchema.extend(updateSchema.shape);
        } else if (createSchema) {
            result = createSchema;
        } else if (updateSchema) {
            result = updateSchema;
        }
    } else if (
        // then comes grouped operations: $create, $read, $update, $delete
        CoreCreateOperations.includes(operation as CoreCreateOperations) &&
        '$create' in plugin.queryArgs &&
        plugin.queryArgs['$create']
    ) {
        result = plugin.queryArgs['$create'];
    } else if (
        CoreReadOperations.includes(operation as CoreReadOperations) &&
        '$read' in plugin.queryArgs &&
        plugin.queryArgs['$read']
    ) {
        result = plugin.queryArgs['$read'];
    } else if (
        CoreUpdateOperations.includes(operation as CoreUpdateOperations) &&
        '$update' in plugin.queryArgs &&
        plugin.queryArgs['$update']
    ) {
        result = plugin.queryArgs['$update'];
    } else if (
        CoreDeleteOperations.includes(operation as CoreDeleteOperations) &&
        '$delete' in plugin.queryArgs &&
        plugin.queryArgs['$delete']
    ) {
        result = plugin.queryArgs['$delete'];
    } else if ('$all' in plugin.queryArgs && plugin.queryArgs['$all']) {
        // finally comes $all
        result = plugin.queryArgs['$all'];
    }

    invariant(
        result === undefined || result instanceof ZodObject,
        'Plugin extended query args schema must be a Zod object',
    );
    return result;
}

/**
 * Picks from `args` the keys declared by any plugin's extended query args schema for the
 * given operation. Returns undefined if nothing matches.
 */
export function extractPluginQueryArgs(
    plugins: AnyPlugin[] | undefined,
    operation: string,
    args: unknown,
): Record<string, unknown> | undefined {
    if (!plugins?.length || typeof args !== 'object' || args === null) {
        return undefined;
    }

    let result: Record<string, unknown> | undefined;
    for (const plugin of plugins) {
        const schema = getPluginExtQueryArgsSchema(plugin, operation);
        if (!schema) {
            continue;
        }
        for (const key of Object.keys(schema.shape)) {
            if (key in args) {
                result ??= {};
                result[key] = (args as Record<string, unknown>)[key];
            }
        }
    }
    return result;
}
