import { z } from 'zod';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.TodoCreateManyInput> = z
    .object({
        id: z.string().optional(),
        createdAt: z.date().optional(),
        updatedAt: z.date().optional(),
        ownerId: z.string(),
        listId: z.string(),
        title: z.string(),
        completedAt: z.date().optional().nullable(),
    })
    .strict();

export const TodoCreateManyInputObjectSchema = Schema;
