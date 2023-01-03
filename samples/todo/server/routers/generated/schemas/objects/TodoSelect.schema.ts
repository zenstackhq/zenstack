import { z } from 'zod';
import { UserArgsObjectSchema } from './UserArgs.schema';
import { ListArgsObjectSchema } from './ListArgs.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.TodoSelect> = z
    .object({
        id: z.boolean().optional(),
        createdAt: z.boolean().optional(),
        updatedAt: z.boolean().optional(),
        owner: z.union([z.boolean(), z.lazy(() => UserArgsObjectSchema)]).optional(),
        ownerId: z.boolean().optional(),
        list: z.union([z.boolean(), z.lazy(() => ListArgsObjectSchema)]).optional(),
        listId: z.boolean().optional(),
        title: z.boolean().optional(),
        completedAt: z.boolean().optional(),
    })
    .strict();

export const TodoSelectObjectSchema = Schema;
