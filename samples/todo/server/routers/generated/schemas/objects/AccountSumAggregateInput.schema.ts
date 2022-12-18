import { z } from 'zod';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.AccountSumAggregateInputType> = z
  .object({
    refresh_token_expires_in: z.literal(true).optional(),
    expires_at: z.literal(true).optional(),
  })
  .strict();

export const AccountSumAggregateInputObjectSchema = Schema;
