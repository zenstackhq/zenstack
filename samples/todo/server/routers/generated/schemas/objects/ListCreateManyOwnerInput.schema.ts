import { z } from 'zod';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.ListCreateManyOwnerInput> = z
    .object({
        id: z.string().optional(),
        createdAt: z.date().optional(),
        updatedAt: z.date().optional(),
        spaceId: z.string(),
        title: z.string(),
        private: z.boolean().optional(),
    })
    .strict();

export const ListCreateManyOwnerInputObjectSchema = Schema;
