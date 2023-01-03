import { z } from 'zod';
import { SpaceSelectObjectSchema } from './SpaceSelect.schema';
import { SpaceIncludeObjectSchema } from './SpaceInclude.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceArgs> = z
    .object({
        select: z.lazy(() => SpaceSelectObjectSchema).optional(),
        include: z.lazy(() => SpaceIncludeObjectSchema).optional(),
    })
    .strict();

export const SpaceArgsObjectSchema = Schema;
