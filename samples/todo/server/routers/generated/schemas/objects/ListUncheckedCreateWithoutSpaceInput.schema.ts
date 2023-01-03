import { z } from 'zod';
import { TodoUncheckedCreateNestedManyWithoutListInputObjectSchema } from './TodoUncheckedCreateNestedManyWithoutListInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.ListUncheckedCreateWithoutSpaceInput> = z
    .object({
        id: z.string().optional(),
        createdAt: z.date().optional(),
        updatedAt: z.date().optional(),
        ownerId: z.string(),
        title: z.string(),
        private: z.boolean().optional(),
        todos: z.lazy(() => TodoUncheckedCreateNestedManyWithoutListInputObjectSchema).optional(),
    })
    .strict();

export const ListUncheckedCreateWithoutSpaceInputObjectSchema = Schema;
