import { z } from 'zod';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.NestedDateTimeNullableFilter> = z
    .object({
        equals: z.date().optional().nullable(),
        in: z.date().array().optional().nullable(),
        notIn: z.date().array().optional().nullable(),
        lt: z.date().optional(),
        lte: z.date().optional(),
        gt: z.date().optional(),
        gte: z.date().optional(),
        not: z
            .union([z.date(), z.lazy(() => NestedDateTimeNullableFilterObjectSchema)])
            .optional()
            .nullable(),
    })
    .strict();

export const NestedDateTimeNullableFilterObjectSchema = Schema;
