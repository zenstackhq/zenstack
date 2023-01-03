import { z } from 'zod';
import { NestedIntFilterObjectSchema } from './NestedIntFilter.schema';
import { NestedBoolFilterObjectSchema } from './NestedBoolFilter.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.NestedBoolWithAggregatesFilter> = z
    .object({
        equals: z.boolean().optional(),
        not: z.union([z.boolean(), z.lazy(() => NestedBoolWithAggregatesFilterObjectSchema)]).optional(),
        _count: z.lazy(() => NestedIntFilterObjectSchema).optional(),
        _min: z.lazy(() => NestedBoolFilterObjectSchema).optional(),
        _max: z.lazy(() => NestedBoolFilterObjectSchema).optional(),
    })
    .strict();

export const NestedBoolWithAggregatesFilterObjectSchema = Schema;
