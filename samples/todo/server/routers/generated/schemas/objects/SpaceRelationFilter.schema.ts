import { z } from 'zod';
import { SpaceWhereInputObjectSchema } from './SpaceWhereInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceRelationFilter> = z
  .object({
    is: z.lazy(() => SpaceWhereInputObjectSchema).optional(),
    isNot: z.lazy(() => SpaceWhereInputObjectSchema).optional(),
  })
  .strict();

export const SpaceRelationFilterObjectSchema = Schema;
