import { z } from 'zod';
import { AccountWhereInputObjectSchema } from './AccountWhereInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.AccountListRelationFilter> = z
  .object({
    every: z.lazy(() => AccountWhereInputObjectSchema).optional(),
    some: z.lazy(() => AccountWhereInputObjectSchema).optional(),
    none: z.lazy(() => AccountWhereInputObjectSchema).optional(),
  })
  .strict();

export const AccountListRelationFilterObjectSchema = Schema;
