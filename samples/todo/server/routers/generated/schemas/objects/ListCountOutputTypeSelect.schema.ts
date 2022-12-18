import { z } from 'zod';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.ListCountOutputTypeSelect> = z
  .object({
    todos: z.boolean().optional(),
  })
  .strict();

export const ListCountOutputTypeSelectObjectSchema = Schema;
