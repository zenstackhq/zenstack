import { z } from 'zod';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.ListCreateManySpaceInput> = z
    .object({
        id: z.string().optional(),
        createdAt: z.date().optional(),
        updatedAt: z.date().optional(),
        ownerId: z.string(),
        title: z.string(),
        private: z.boolean().optional(),
    })
    .strict();

export const ListCreateManySpaceInputObjectSchema = Schema;
