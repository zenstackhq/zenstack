import { z } from 'zod';
import { SortOrderSchema } from '../enums/SortOrder.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.AccountSumOrderByAggregateInput> = z
    .object({
        refresh_token_expires_in: z.lazy(() => SortOrderSchema).optional(),
        expires_at: z.lazy(() => SortOrderSchema).optional(),
    })
    .strict();

export const AccountSumOrderByAggregateInputObjectSchema = Schema;
