import z from 'zod';
import { DbOperations } from '../types';

/**
 * Mapping from model type name to zod schema for Prisma operations
 */
export type ModelZodSchema = Record<string, Record<keyof DbOperations, z.ZodType>>;

/**
 * Load zod schema from standard location.
 */
export function getModelZodSchemas(): ModelZodSchema {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('.zenstack/zod').default;
    } catch {
        throw new Error(
            'Zod schemas cannot be loaded. Please make sure "@core/zod" plugin is enabled in schema.zmodel.'
        );
    }
}
