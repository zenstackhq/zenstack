import { z } from 'zod';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { UserCountOrderByAggregateInputObjectSchema } from './UserCountOrderByAggregateInput.schema';
import { UserMaxOrderByAggregateInputObjectSchema } from './UserMaxOrderByAggregateInput.schema';
import { UserMinOrderByAggregateInputObjectSchema } from './UserMinOrderByAggregateInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.UserOrderByWithAggregationInput> = z
    .object({
        id: z.lazy(() => SortOrderSchema).optional(),
        createdAt: z.lazy(() => SortOrderSchema).optional(),
        updatedAt: z.lazy(() => SortOrderSchema).optional(),
        email: z.lazy(() => SortOrderSchema).optional(),
        emailVerified: z.lazy(() => SortOrderSchema).optional(),
        password: z.lazy(() => SortOrderSchema).optional(),
        name: z.lazy(() => SortOrderSchema).optional(),
        image: z.lazy(() => SortOrderSchema).optional(),
        zenstack_guard: z.lazy(() => SortOrderSchema).optional(),
        zenstack_transaction: z.lazy(() => SortOrderSchema).optional(),
        _count: z.lazy(() => UserCountOrderByAggregateInputObjectSchema).optional(),
        _max: z.lazy(() => UserMaxOrderByAggregateInputObjectSchema).optional(),
        _min: z.lazy(() => UserMinOrderByAggregateInputObjectSchema).optional(),
    })
    .strict();

export const UserOrderByWithAggregationInputObjectSchema = Schema;
