import { z } from 'zod';
import { SpaceCreateNestedOneWithoutListsInputObjectSchema } from './SpaceCreateNestedOneWithoutListsInput.schema';
import { TodoCreateNestedManyWithoutListInputObjectSchema } from './TodoCreateNestedManyWithoutListInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.ListCreateWithoutOwnerInput> = z
    .object({
        id: z.string().optional(),
        createdAt: z.date().optional(),
        updatedAt: z.date().optional(),
        space: z.lazy(() => SpaceCreateNestedOneWithoutListsInputObjectSchema),
        title: z.string(),
        private: z.boolean().optional(),
        todos: z.lazy(() => TodoCreateNestedManyWithoutListInputObjectSchema).optional(),
    })
    .strict();

export const ListCreateWithoutOwnerInputObjectSchema = Schema;
