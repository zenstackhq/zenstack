import { z } from 'zod';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { SpaceOrderByWithRelationInputObjectSchema } from './SpaceOrderByWithRelationInput.schema';
import { UserOrderByWithRelationInputObjectSchema } from './UserOrderByWithRelationInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceUserOrderByWithRelationInput> = z
    .object({
        id: z.lazy(() => SortOrderSchema).optional(),
        createdAt: z.lazy(() => SortOrderSchema).optional(),
        updatedAt: z.lazy(() => SortOrderSchema).optional(),
        space: z.lazy(() => SpaceOrderByWithRelationInputObjectSchema).optional(),
        spaceId: z.lazy(() => SortOrderSchema).optional(),
        user: z.lazy(() => UserOrderByWithRelationInputObjectSchema).optional(),
        userId: z.lazy(() => SortOrderSchema).optional(),
        role: z.lazy(() => SortOrderSchema).optional(),
        zenstack_guard: z.lazy(() => SortOrderSchema).optional(),
        zenstack_transaction: z.lazy(() => SortOrderSchema).optional(),
    })
    .strict();

export const SpaceUserOrderByWithRelationInputObjectSchema = Schema;
