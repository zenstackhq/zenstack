import { z } from 'zod';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { ListCountOrderByAggregateInputObjectSchema } from './ListCountOrderByAggregateInput.schema';
import { ListMaxOrderByAggregateInputObjectSchema } from './ListMaxOrderByAggregateInput.schema';
import { ListMinOrderByAggregateInputObjectSchema } from './ListMinOrderByAggregateInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.ListOrderByWithAggregationInput> = z
  .object({
    id: z.lazy(() => SortOrderSchema).optional(),
    createdAt: z.lazy(() => SortOrderSchema).optional(),
    updatedAt: z.lazy(() => SortOrderSchema).optional(),
    spaceId: z.lazy(() => SortOrderSchema).optional(),
    ownerId: z.lazy(() => SortOrderSchema).optional(),
    title: z.lazy(() => SortOrderSchema).optional(),
    private: z.lazy(() => SortOrderSchema).optional(),
    zenstack_guard: z.lazy(() => SortOrderSchema).optional(),
    zenstack_transaction: z.lazy(() => SortOrderSchema).optional(),
    _count: z.lazy(() => ListCountOrderByAggregateInputObjectSchema).optional(),
    _max: z.lazy(() => ListMaxOrderByAggregateInputObjectSchema).optional(),
    _min: z.lazy(() => ListMinOrderByAggregateInputObjectSchema).optional(),
  })
  .strict();

export const ListOrderByWithAggregationInputObjectSchema = Schema;
