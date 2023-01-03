import { z } from 'zod';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceCountOutputTypeSelect> = z
    .object({
        members: z.boolean().optional(),
        lists: z.boolean().optional(),
    })
    .strict();

export const SpaceCountOutputTypeSelectObjectSchema = Schema;
