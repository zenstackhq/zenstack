import { z } from 'zod';
import { SpaceCountOutputTypeSelectObjectSchema } from './SpaceCountOutputTypeSelect.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceCountOutputTypeArgs> = z
    .object({
        select: z.lazy(() => SpaceCountOutputTypeSelectObjectSchema).optional(),
    })
    .strict();

export const SpaceCountOutputTypeArgsObjectSchema = Schema;
