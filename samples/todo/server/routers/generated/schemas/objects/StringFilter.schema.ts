import { z } from 'zod';
import { QueryModeSchema } from '../enums/QueryMode.schema';
import { NestedStringFilterObjectSchema } from './NestedStringFilter.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.StringFilter> = z
    .object({
        equals: z.string().optional(),
        in: z.string().array().optional(),
        notIn: z.string().array().optional(),
        lt: z.string().optional(),
        lte: z.string().optional(),
        gt: z.string().optional(),
        gte: z.string().optional(),
        contains: z.string().optional(),
        startsWith: z.string().optional(),
        endsWith: z.string().optional(),
        mode: z.lazy(() => QueryModeSchema).optional(),
        not: z.union([z.string(), z.lazy(() => NestedStringFilterObjectSchema)]).optional(),
    })
    .strict();

export const StringFilterObjectSchema = Schema;
