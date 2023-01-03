import { z } from 'zod';
import { SpaceUserSelectObjectSchema } from './SpaceUserSelect.schema';
import { SpaceUserIncludeObjectSchema } from './SpaceUserInclude.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceUserArgs> = z
    .object({
        select: z.lazy(() => SpaceUserSelectObjectSchema).optional(),
        include: z.lazy(() => SpaceUserIncludeObjectSchema).optional(),
    })
    .strict();

export const SpaceUserArgsObjectSchema = Schema;
