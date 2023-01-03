import { z } from 'zod';
import { StringWithAggregatesFilterObjectSchema } from './StringWithAggregatesFilter.schema';
import { DateTimeWithAggregatesFilterObjectSchema } from './DateTimeWithAggregatesFilter.schema';
import { DateTimeNullableWithAggregatesFilterObjectSchema } from './DateTimeNullableWithAggregatesFilter.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.TodoScalarWhereWithAggregatesInput> = z
    .object({
        AND: z
            .union([
                z.lazy(() => TodoScalarWhereWithAggregatesInputObjectSchema),
                z.lazy(() => TodoScalarWhereWithAggregatesInputObjectSchema).array(),
            ])
            .optional(),
        OR: z
            .lazy(() => TodoScalarWhereWithAggregatesInputObjectSchema)
            .array()
            .optional(),
        NOT: z
            .union([
                z.lazy(() => TodoScalarWhereWithAggregatesInputObjectSchema),
                z.lazy(() => TodoScalarWhereWithAggregatesInputObjectSchema).array(),
            ])
            .optional(),
        id: z.union([z.lazy(() => StringWithAggregatesFilterObjectSchema), z.string()]).optional(),
        createdAt: z.union([z.lazy(() => DateTimeWithAggregatesFilterObjectSchema), z.date()]).optional(),
        updatedAt: z.union([z.lazy(() => DateTimeWithAggregatesFilterObjectSchema), z.date()]).optional(),
        ownerId: z.union([z.lazy(() => StringWithAggregatesFilterObjectSchema), z.string()]).optional(),
        listId: z.union([z.lazy(() => StringWithAggregatesFilterObjectSchema), z.string()]).optional(),
        title: z.union([z.lazy(() => StringWithAggregatesFilterObjectSchema), z.string()]).optional(),
        completedAt: z
            .union([z.lazy(() => DateTimeNullableWithAggregatesFilterObjectSchema), z.date()])
            .optional()
            .nullable(),
    })
    .strict();

export const TodoScalarWhereWithAggregatesInputObjectSchema = Schema;
