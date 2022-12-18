import { z } from 'zod';
import { ListWhereInputObjectSchema } from './ListWhereInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.ListListRelationFilter> = z
  .object({
    every: z.lazy(() => ListWhereInputObjectSchema).optional(),
    some: z.lazy(() => ListWhereInputObjectSchema).optional(),
    none: z.lazy(() => ListWhereInputObjectSchema).optional(),
  })
  .strict();

export const ListListRelationFilterObjectSchema = Schema;
