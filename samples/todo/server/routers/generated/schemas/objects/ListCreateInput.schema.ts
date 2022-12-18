import { z } from 'zod';
import { SpaceCreateNestedOneWithoutListsInputObjectSchema } from './SpaceCreateNestedOneWithoutListsInput.schema';
import { UserCreateNestedOneWithoutListsInputObjectSchema } from './UserCreateNestedOneWithoutListsInput.schema';
import { TodoCreateNestedManyWithoutListInputObjectSchema } from './TodoCreateNestedManyWithoutListInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.ListCreateInput> = z
  .object({
    id: z.string().optional(),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
    space: z.lazy(() => SpaceCreateNestedOneWithoutListsInputObjectSchema),
    owner: z.lazy(() => UserCreateNestedOneWithoutListsInputObjectSchema),
    title: z.string(),
    private: z.boolean().optional(),
    todos: z
      .lazy(() => TodoCreateNestedManyWithoutListInputObjectSchema)
      .optional(),
    zenstack_guard: z.boolean().optional(),
    zenstack_transaction: z.string().optional().nullable(),
  })
  .strict();

export const ListCreateInputObjectSchema = Schema;
