import { z } from 'zod';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.ListMaxAggregateInputType> = z
    .object({
        id: z.literal(true).optional(),
        createdAt: z.literal(true).optional(),
        updatedAt: z.literal(true).optional(),
        spaceId: z.literal(true).optional(),
        ownerId: z.literal(true).optional(),
        title: z.literal(true).optional(),
        private: z.literal(true).optional(),
    })
    .strict();

export const ListMaxAggregateInputObjectSchema = Schema;
