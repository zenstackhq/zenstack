import { z } from 'zod';
import { StringFilterObjectSchema } from './StringFilter.schema';
import { DateTimeFilterObjectSchema } from './DateTimeFilter.schema';
import { DateTimeNullableFilterObjectSchema } from './DateTimeNullableFilter.schema';
import { BoolFilterObjectSchema } from './BoolFilter.schema';
import { StringNullableFilterObjectSchema } from './StringNullableFilter.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.TodoScalarWhereInput> = z
    .object({
        AND: z
            .union([
                z.lazy(() => TodoScalarWhereInputObjectSchema),
                z.lazy(() => TodoScalarWhereInputObjectSchema).array(),
            ])
            .optional(),
        OR: z
            .lazy(() => TodoScalarWhereInputObjectSchema)
            .array()
            .optional(),
        NOT: z
            .union([
                z.lazy(() => TodoScalarWhereInputObjectSchema),
                z.lazy(() => TodoScalarWhereInputObjectSchema).array(),
            ])
            .optional(),
        id: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
        createdAt: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.date()]).optional(),
        updatedAt: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.date()]).optional(),
        ownerId: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
        listId: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
        title: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
        completedAt: z
            .union([z.lazy(() => DateTimeNullableFilterObjectSchema), z.date()])
            .optional()
            .nullable(),
        zenstack_guard: z.union([z.lazy(() => BoolFilterObjectSchema), z.boolean()]).optional(),
        zenstack_transaction: z
            .union([z.lazy(() => StringNullableFilterObjectSchema), z.string()])
            .optional()
            .nullable(),
    })
    .strict();

export const TodoScalarWhereInputObjectSchema = Schema;
