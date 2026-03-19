import z from 'zod';

export const loggerSchema = z.union([z.enum(['debug', 'info', 'warn', 'error']).array(), z.function()]);

const fieldSlicingSchema = z.looseObject({
    includedFilterKinds: z.string().array().optional(),
    excludedFilterKinds: z.string().array().optional(),
});

const modelSlicingSchema = z.looseObject({
    includedOperations: z.array(z.string()).optional(),
    excludedOperations: z.array(z.string()).optional(),
    fields: z.record(z.string(), fieldSlicingSchema).optional(),
});

const slicingSchema = z.looseObject({
    includedModels: z.array(z.string()).optional(),
    excludedModels: z.array(z.string()).optional(),
    models: z.record(z.string(), modelSlicingSchema).optional(),
    includedProcedures: z.array(z.string()).optional(),
    excludedProcedures: z.array(z.string()).optional(),
});

export const queryOptionsSchema = z.looseObject({
    omit: z.record(z.string(), z.record(z.string(), z.boolean())).optional(),
    slicing: slicingSchema.optional(),
});
