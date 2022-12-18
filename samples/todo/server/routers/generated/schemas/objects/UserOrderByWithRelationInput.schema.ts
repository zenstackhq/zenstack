import { z } from 'zod';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { SpaceUserOrderByRelationAggregateInputObjectSchema } from './SpaceUserOrderByRelationAggregateInput.schema';
import { ListOrderByRelationAggregateInputObjectSchema } from './ListOrderByRelationAggregateInput.schema';
import { TodoOrderByRelationAggregateInputObjectSchema } from './TodoOrderByRelationAggregateInput.schema';
import { AccountOrderByRelationAggregateInputObjectSchema } from './AccountOrderByRelationAggregateInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.UserOrderByWithRelationInput> = z
  .object({
    id: z.lazy(() => SortOrderSchema).optional(),
    createdAt: z.lazy(() => SortOrderSchema).optional(),
    updatedAt: z.lazy(() => SortOrderSchema).optional(),
    email: z.lazy(() => SortOrderSchema).optional(),
    emailVerified: z.lazy(() => SortOrderSchema).optional(),
    password: z.lazy(() => SortOrderSchema).optional(),
    name: z.lazy(() => SortOrderSchema).optional(),
    spaces: z
      .lazy(() => SpaceUserOrderByRelationAggregateInputObjectSchema)
      .optional(),
    image: z.lazy(() => SortOrderSchema).optional(),
    lists: z
      .lazy(() => ListOrderByRelationAggregateInputObjectSchema)
      .optional(),
    todos: z
      .lazy(() => TodoOrderByRelationAggregateInputObjectSchema)
      .optional(),
    accounts: z
      .lazy(() => AccountOrderByRelationAggregateInputObjectSchema)
      .optional(),
    zenstack_guard: z.lazy(() => SortOrderSchema).optional(),
    zenstack_transaction: z.lazy(() => SortOrderSchema).optional(),
  })
  .strict();

export const UserOrderByWithRelationInputObjectSchema = Schema;
