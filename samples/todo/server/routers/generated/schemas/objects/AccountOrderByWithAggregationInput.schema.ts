import { z } from 'zod';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { AccountCountOrderByAggregateInputObjectSchema } from './AccountCountOrderByAggregateInput.schema';
import { AccountAvgOrderByAggregateInputObjectSchema } from './AccountAvgOrderByAggregateInput.schema';
import { AccountMaxOrderByAggregateInputObjectSchema } from './AccountMaxOrderByAggregateInput.schema';
import { AccountMinOrderByAggregateInputObjectSchema } from './AccountMinOrderByAggregateInput.schema';
import { AccountSumOrderByAggregateInputObjectSchema } from './AccountSumOrderByAggregateInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.AccountOrderByWithAggregationInput> = z
  .object({
    id: z.lazy(() => SortOrderSchema).optional(),
    userId: z.lazy(() => SortOrderSchema).optional(),
    type: z.lazy(() => SortOrderSchema).optional(),
    provider: z.lazy(() => SortOrderSchema).optional(),
    providerAccountId: z.lazy(() => SortOrderSchema).optional(),
    refresh_token: z.lazy(() => SortOrderSchema).optional(),
    refresh_token_expires_in: z.lazy(() => SortOrderSchema).optional(),
    access_token: z.lazy(() => SortOrderSchema).optional(),
    expires_at: z.lazy(() => SortOrderSchema).optional(),
    token_type: z.lazy(() => SortOrderSchema).optional(),
    scope: z.lazy(() => SortOrderSchema).optional(),
    id_token: z.lazy(() => SortOrderSchema).optional(),
    session_state: z.lazy(() => SortOrderSchema).optional(),
    _count: z
      .lazy(() => AccountCountOrderByAggregateInputObjectSchema)
      .optional(),
    _avg: z.lazy(() => AccountAvgOrderByAggregateInputObjectSchema).optional(),
    _max: z.lazy(() => AccountMaxOrderByAggregateInputObjectSchema).optional(),
    _min: z.lazy(() => AccountMinOrderByAggregateInputObjectSchema).optional(),
    _sum: z.lazy(() => AccountSumOrderByAggregateInputObjectSchema).optional(),
  })
  .strict();

export const AccountOrderByWithAggregationInputObjectSchema = Schema;
