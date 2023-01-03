import { z } from 'zod';
import { SortOrderSchema } from '../enums/SortOrder.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.ListMinOrderByAggregateInput> = z
    .object({
        id: z.lazy(() => SortOrderSchema).optional(),
        createdAt: z.lazy(() => SortOrderSchema).optional(),
        updatedAt: z.lazy(() => SortOrderSchema).optional(),
        spaceId: z.lazy(() => SortOrderSchema).optional(),
        ownerId: z.lazy(() => SortOrderSchema).optional(),
        title: z.lazy(() => SortOrderSchema).optional(),
        private: z.lazy(() => SortOrderSchema).optional(),
    })
    .strict();

export const ListMinOrderByAggregateInputObjectSchema = Schema;
