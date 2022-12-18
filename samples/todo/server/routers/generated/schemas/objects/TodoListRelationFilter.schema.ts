import { z } from 'zod';
import { TodoWhereInputObjectSchema } from './TodoWhereInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.TodoListRelationFilter> = z
  .object({
    every: z.lazy(() => TodoWhereInputObjectSchema).optional(),
    some: z.lazy(() => TodoWhereInputObjectSchema).optional(),
    none: z.lazy(() => TodoWhereInputObjectSchema).optional(),
  })
  .strict();

export const TodoListRelationFilterObjectSchema = Schema;
