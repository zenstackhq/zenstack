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
        zenstack_guard: z.boolean().optional(),
        zenstack_transaction: z.string().optional().nullable(),
    })
    .strict();

export const TodoCreateWithoutListInputObjectSchema = Schema;
