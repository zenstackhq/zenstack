import { z } from 'zod';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.StringFieldUpdateOperationsInput> = z
    .object({
        set: z.string().optional(),
    })
    .strict();

export const StringFieldUpdateOperationsInputObjectSchema = Schema;
