import { z } from 'zod';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { TodoCountOrderByAggregateInputObjectSchema } from './TodoCountOrderByAggregateInput.schema';
import { TodoMaxOrderByAggregateInputObjectSchema } from './TodoMaxOrderByAggregateInput.schema';
import { TodoMinOrderByAggregateInputObjectSchema } from './TodoMinOrderByAggregateInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.TodoOrderByWithAggregationInput> = z
  .object({
    id: z.lazy(() => SortOrderSchema).optional(),
    createdAt: z.lazy(() => SortOrderSchema).optional(),
    updatedAt: z.lazy(() => SortOrderSchema).optional(),
    ownerId: z.lazy(() => SortOrderSchema).optional(),
    listId: z.lazy(() => SortOrderSchema).optional(),
    title: z.lazy(() => SortOrderSchema).optional(),
    completedAt: z.lazy(() => SortOrderSchema).optional(),
    zenstack_guard: z.lazy(() => SortOrderSchema).optional(),
    zenstack_transaction: z.lazy(() => SortOrderSchema).optional(),
    _count: z.lazy(() => TodoCountOrderByAggregateInputObjectSchema).optional(),
    _max: z.lazy(() => TodoMaxOrderByAggregateInputObjectSchema).optional(),
    _min: z.lazy(() => TodoMinOrderByAggregateInputObjectSchema).optional(),
  })
  .strict();

export const TodoOrderByWithAggregationInputObjectSchema = Schema;
