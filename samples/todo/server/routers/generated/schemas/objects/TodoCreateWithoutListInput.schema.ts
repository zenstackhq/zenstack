import { z } from 'zod';
import { UserCreateNestedOneWithoutTodosInputObjectSchema } from './UserCreateNestedOneWithoutTodosInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.TodoCreateWithoutListInput> = z
    .object({
        id: z.string().optional(),
        createdAt: z.date().optional(),
        updatedAt: z.date().optional(),
        owner: z.lazy(() => UserCreateNestedOneWithoutTodosInputObjectSchema),
        title: z.string(),
        completedAt: z.date().optional().nullable(),
    })
    .strict();

export const TodoCreateWithoutListInputObjectSchema = Schema;
