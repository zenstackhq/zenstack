import { z } from 'zod';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { SpaceUserOrderByRelationAggregateInputObjectSchema } from './SpaceUserOrderByRelationAggregateInput.schema';
import { ListOrderByRelationAggregateInputObjectSchema } from './ListOrderByRelationAggregateInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceOrderByWithRelationInput> = z
  .object({
    id: z.lazy(() => SortOrderSchema).optional(),
    createdAt: z.lazy(() => SortOrderSchema).optional(),
    updatedAt: z.lazy(() => SortOrderSchema).optional(),
    name: z.lazy(() => SortOrderSchema).optional(),
    slug: z.lazy(() => SortOrderSchema).optional(),
    members: z
      .lazy(() => SpaceUserOrderByRelationAggregateInputObjectSchema)
      .optional(),
    lists: z
      .lazy(() => ListOrderByRelationAggregateInputObjectSchema)
      .optional(),
    zenstack_guard: z.lazy(() => SortOrderSchema).optional(),
    zenstack_transaction: z.lazy(() => SortOrderSchema).optional(),
  })
  .strict();

export const SpaceOrderByWithRelationInputObjectSchema = Schema;
