import { z } from 'zod';
import { SpaceArgsObjectSchema } from './SpaceArgs.schema';
import { UserArgsObjectSchema } from './UserArgs.schema';
import { TodoSchema } from '../Todo.schema';
import { ListCountOutputTypeArgsObjectSchema } from './ListCountOutputTypeArgs.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.ListSelect> = z
    .object({
        id: z.boolean().optional(),
        createdAt: z.boolean().optional(),
        updatedAt: z.boolean().optional(),
        space: z.union([z.boolean(), z.lazy(() => SpaceArgsObjectSchema)]).optional(),
        spaceId: z.boolean().optional(),
        owner: z.union([z.boolean(), z.lazy(() => UserArgsObjectSchema)]).optional(),
        ownerId: z.boolean().optional(),
        title: z.boolean().optional(),
        private: z.boolean().optional(),
        todos: z.union([z.boolean(), z.lazy(() => TodoSchema.findMany)]).optional(),
        _count: z.union([z.boolean(), z.lazy(() => ListCountOutputTypeArgsObjectSchema)]).optional(),
    })
    .strict();

export const ListSelectObjectSchema = Schema;
