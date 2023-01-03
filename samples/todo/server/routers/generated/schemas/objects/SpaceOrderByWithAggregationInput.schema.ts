import { z } from 'zod';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { SpaceCountOrderByAggregateInputObjectSchema } from './SpaceCountOrderByAggregateInput.schema';
import { SpaceMaxOrderByAggregateInputObjectSchema } from './SpaceMaxOrderByAggregateInput.schema';
import { SpaceMinOrderByAggregateInputObjectSchema } from './SpaceMinOrderByAggregateInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceOrderByWithAggregationInput> = z
    .object({
        id: z.lazy(() => SortOrderSchema).optional(),
        createdAt: z.lazy(() => SortOrderSchema).optional(),
        updatedAt: z.lazy(() => SortOrderSchema).optional(),
        name: z.lazy(() => SortOrderSchema).optional(),
        slug: z.lazy(() => SortOrderSchema).optional(),
        _count: z.lazy(() => SpaceCountOrderByAggregateInputObjectSchema).optional(),
        _max: z.lazy(() => SpaceMaxOrderByAggregateInputObjectSchema).optional(),
        _min: z.lazy(() => SpaceMinOrderByAggregateInputObjectSchema).optional(),
    })
    .strict();

export const SpaceOrderByWithAggregationInputObjectSchema = Schema;
