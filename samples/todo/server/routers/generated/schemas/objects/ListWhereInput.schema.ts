import { z } from 'zod';
import { StringFilterObjectSchema } from './StringFilter.schema';
import { DateTimeFilterObjectSchema } from './DateTimeFilter.schema';
import { SpaceRelationFilterObjectSchema } from './SpaceRelationFilter.schema';
import { SpaceWhereInputObjectSchema } from './SpaceWhereInput.schema';
import { UserRelationFilterObjectSchema } from './UserRelationFilter.schema';
import { UserWhereInputObjectSchema } from './UserWhereInput.schema';
import { BoolFilterObjectSchema } from './BoolFilter.schema';
import { TodoListRelationFilterObjectSchema } from './TodoListRelationFilter.schema';
import { StringNullableFilterObjectSchema } from './StringNullableFilter.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.ListWhereInput> = z
    .object({
        AND: z
            .union([z.lazy(() => ListWhereInputObjectSchema), z.lazy(() => ListWhereInputObjectSchema).array()])
            .optional(),
        OR: z
            .lazy(() => ListWhereInputObjectSchema)
            .array()
            .optional(),
        NOT: z
            .union([z.lazy(() => ListWhereInputObjectSchema), z.lazy(() => ListWhereInputObjectSchema).array()])
            .optional(),
        id: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
        createdAt: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.date()]).optional(),
        updatedAt: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.date()]).optional(),
        space: z
            .union([z.lazy(() => SpaceRelationFilterObjectSchema), z.lazy(() => SpaceWhereInputObjectSchema)])
            .optional(),
        spaceId: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
        owner: z
            .union([z.lazy(() => UserRelationFilterObjectSchema), z.lazy(() => UserWhereInputObjectSchema)])
            .optional(),
        ownerId: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
        title: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
        private: z.union([z.lazy(() => BoolFilterObjectSchema), z.boolean()]).optional(),
        todos: z.lazy(() => TodoListRelationFilterObjectSchema).optional(),
        zenstack_guard: z.union([z.lazy(() => BoolFilterObjectSchema), z.boolean()]).optional(),
        zenstack_transaction: z
            .union([z.lazy(() => StringNullableFilterObjectSchema), z.string()])
            .optional()
            .nullable(),
    })
    .strict();

export const ListWhereInputObjectSchema = Schema;
