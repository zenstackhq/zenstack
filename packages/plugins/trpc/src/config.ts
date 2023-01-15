import { z } from 'zod';

export const configSchema = z.object({
    contextPath: z.string().default('../../../../src/context'),
});

export type Config = z.infer<typeof configSchema>;
