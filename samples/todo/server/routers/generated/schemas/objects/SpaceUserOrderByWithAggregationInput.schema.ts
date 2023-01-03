import { z } from 'zod';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { SpaceUserCountOrderByAggregateInputObjectSchema } from './SpaceUserCountOrderByAggregateInput.schema';
import { SpaceUserMaxOrderByAggregateInputObjectSchema } from './SpaceUserMaxOrderByAggregateInput.schema';
import { SpaceUserMinOrderByAggregateInputObjectSchema } from './SpaceUserMinOrderByAggregateInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceUserOrderByWithAggregationInput> = z
    .object({
        id: z.lazy(() => SortOrderSchema).optional(),
        createdAt: z.lazy(() => SortOrderSchema).optional(),
        updatedAt: z.lazy(() => SortOrderSchema).optional(),
        spaceId: z.lazy(() => SortOrderSchema).optional(),
        userId: z.lazy(() => SortOrderSchema).optional(),
        role: z.lazy(() => SortOrderSchema).optional(),
        zenstack_guard: z.lazy(() => SortOrderSchema).optional(),
        zenstack_transaction: z.lazy(() => SortOrderSchema).optional(),
        _count: z.lazy(() => SpaceUserCountOrderByAggregateInputObjectSchema).optional(),
        _max: z.lazy(() => SpaceUserMaxOrderByAggregateInputObjectSchema).optional(),
        _min: z.lazy(() => SpaceUserMinOrderByAggregateInputObjectSchema).optional(),
    })
    .strict();

export const SpaceUserOrderByWithAggregationInputObjectSchema = Schema;
