import { z } from 'zod';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.TodoCountAggregateInputType> = z
    .object({
        id: z.literal(true).optional(),
        createdAt: z.literal(true).optional(),
        updatedAt: z.literal(true).optional(),
        ownerId: z.literal(true).optional(),
        listId: z.literal(true).optional(),
        title: z.literal(true).optional(),
        completedAt: z.literal(true).optional(),
        zenstack_guard: z.literal(true).optional(),
        zenstack_transaction: z.literal(true).optional(),
        _all: z.literal(true).optional(),
    })
    .strict();

export const TodoCountAggregateInputObjectSchema = Schema;
