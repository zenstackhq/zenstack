import { z } from 'zod';
import { SpaceArgsObjectSchema } from './SpaceArgs.schema';
import { UserArgsObjectSchema } from './UserArgs.schema';
import { TodoSchema } from '../Todo.schema';
import { ListCountOutputTypeArgsObjectSchema } from './ListCountOutputTypeArgs.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.ListInclude> = z
  .object({
    space: z
      .union([z.boolean(), z.lazy(() => SpaceArgsObjectSchema)])
      .optional(),
    owner: z
      .union([z.boolean(), z.lazy(() => UserArgsObjectSchema)])
      .optional(),
    todos: z.union([z.boolean(), z.lazy(() => TodoSchema.findMany)]).optional(),
    _count: z
      .union([z.boolean(), z.lazy(() => ListCountOutputTypeArgsObjectSchema)])
      .optional(),
  })
  .strict();

export const ListIncludeObjectSchema = Schema;
