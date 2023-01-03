import { z } from 'zod';
import { StringWithAggregatesFilterObjectSchema } from './StringWithAggregatesFilter.schema';
import { DateTimeWithAggregatesFilterObjectSchema } from './DateTimeWithAggregatesFilter.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceScalarWhereWithAggregatesInput> = z
    .object({
        AND: z
            .union([
                z.lazy(() => SpaceScalarWhereWithAggregatesInputObjectSchema),
                z.lazy(() => SpaceScalarWhereWithAggregatesInputObjectSchema).array(),
            ])
            .optional(),
        OR: z
            .lazy(() => SpaceScalarWhereWithAggregatesInputObjectSchema)
            .array()
            .optional(),
        NOT: z
            .union([
                z.lazy(() => SpaceScalarWhereWithAggregatesInputObjectSchema),
                z.lazy(() => SpaceScalarWhereWithAggregatesInputObjectSchema).array(),
            ])
            .optional(),
        id: z.union([z.lazy(() => StringWithAggregatesFilterObjectSchema), z.string()]).optional(),
        createdAt: z.union([z.lazy(() => DateTimeWithAggregatesFilterObjectSchema), z.date()]).optional(),
        updatedAt: z.union([z.lazy(() => DateTimeWithAggregatesFilterObjectSchema), z.date()]).optional(),
        name: z.union([z.lazy(() => StringWithAggregatesFilterObjectSchema), z.string()]).optional(),
        slug: z.union([z.lazy(() => StringWithAggregatesFilterObjectSchema), z.string()]).optional(),
    })
    .strict();

export const SpaceScalarWhereWithAggregatesInputObjectSchema = Schema;
