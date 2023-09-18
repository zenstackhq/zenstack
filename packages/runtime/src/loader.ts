/* eslint-disable @typescript-eslint/no-var-requires */
import path from 'path';
import { DEFAULT_RUNTIME_LOAD_PATH } from './constants';
import { ModelMeta, PolicyDef, ZodSchemas } from './enhancements';

/**
 * Load model metadata.
 *
 * @param loadPath The path to load model metadata from. If not provided,
 * will use default load path.
 */
export function getDefaultModelMeta(loadPath: string | undefined): ModelMeta {
    loadPath = loadPath ? path.resolve(loadPath, 'model-meta') : `${DEFAULT_RUNTIME_LOAD_PATH}/model-meta`;
    try {
        // normal load
        return require(loadPath).default;
    } catch {
        if (process.env.ZENSTACK_TEST === '1' && !path.isAbsolute(loadPath)) {
            try {
                // special handling for running as tests, try resolving relative to CWD
                return require(path.join(process.cwd(), 'node_modules', loadPath, 'model-meta')).default;
            } catch {
                throw new Error('Model meta cannot be loaded. Please make sure "zenstack generate" has been run.');
            }
        }
        throw new Error('Model meta cannot be loaded. Please make sure "zenstack generate" has been run.');
    }
}

/**
 * Load access policies.
 *
 * @param loadPath The path to load access policies from. If not provided,
 * will use default load path.
 */
export function getDefaultPolicy(loadPath: string | undefined): PolicyDef {
    loadPath = loadPath ? path.resolve(loadPath, 'policy') : `${DEFAULT_RUNTIME_LOAD_PATH}/policy`;
    try {
        return require(loadPath).default;
    } catch {
        if (process.env.ZENSTACK_TEST === '1' && !path.isAbsolute(loadPath)) {
            try {
                // special handling for running as tests, try resolving relative to CWD
                return require(path.join(process.cwd(), 'node_modules', loadPath, 'policy')).default;
            } catch {
                throw new Error(
                    'Policy definition cannot be loaded from default location. Please make sure "zenstack generate" has been run.'
                );
            }
        }
        throw new Error(
            'Policy definition cannot be loaded from default location. Please make sure "zenstack generate" has been run.'
        );
    }
}

/**
 * Load zod schemas.
 *
 * @param loadPath The path to load zod schemas from. If not provided,
 * will use default load path.
 */
export function getDefaultZodSchemas(loadPath: string | undefined): ZodSchemas | undefined {
    loadPath = loadPath ? path.resolve(loadPath, 'zod') : `${DEFAULT_RUNTIME_LOAD_PATH}/zod`;
    try {
        return require(loadPath);
    } catch {
        if (process.env.ZENSTACK_TEST === '1' && !path.isAbsolute(loadPath)) {
            try {
                // special handling for running as tests, try resolving relative to CWD
                return require(path.join(process.cwd(), 'node_modules', loadPath, 'zod'));
            } catch {
                return undefined;
            }
        }
        return undefined;
    }
}
