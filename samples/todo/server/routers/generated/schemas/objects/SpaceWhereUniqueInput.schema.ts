import { z } from 'zod';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceWhereUniqueInput> = z
  .object({
    id: z.string().optional(),
    slug: z.string().optional(),
  })
  .strict();

export const SpaceWhereUniqueInputObjectSchema = Schema;
