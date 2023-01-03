import { z } from 'zod';
import { StringFilterObjectSchema } from './StringFilter.schema';
import { DateTimeFilterObjectSchema } from './DateTimeFilter.schema';
import { UserRelationFilterObjectSchema } from './UserRelationFilter.schema';
import { UserWhereInputObjectSchema } from './UserWhereInput.schema';
import { ListRelationFilterObjectSchema } from './ListRelationFilter.schema';
import { ListWhereInputObjectSchema } from './ListWhereInput.schema';
import { DateTimeNullableFilterObjectSchema } from './DateTimeNullableFilter.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.TodoWhereInput> = z
    .object({
        AND: z
            .union([z.lazy(() => TodoWhereInputObjectSchema), z.lazy(() => TodoWhereInputObjectSchema).array()])
            .optional(),
        OR: z
            .lazy(() => TodoWhereInputObjectSchema)
            .array()
            .optional(),
        NOT: z
            .union([z.lazy(() => TodoWhereInputObjectSchema), z.lazy(() => TodoWhereInputObjectSchema).array()])
            .optional(),
        id: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
        createdAt: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.date()]).optional(),
        updatedAt: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.date()]).optional(),
        owner: z
            .union([z.lazy(() => UserRelationFilterObjectSchema), z.lazy(() => UserWhereInputObjectSchema)])
            .optional(),
        ownerId: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
        list: z
            .union([z.lazy(() => ListRelationFilterObjectSchema), z.lazy(() => ListWhereInputObjectSchema)])
            .optional(),
        listId: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
        title: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
        completedAt: z
            .union([z.lazy(() => DateTimeNullableFilterObjectSchema), z.date()])
            .optional()
            .nullable(),
    })
    .strict();

export const TodoWhereInputObjectSchema = Schema;
