import { z } from 'zod';
import { ListCountOutputTypeSelectObjectSchema } from './ListCountOutputTypeSelect.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.ListCountOutputTypeArgs> = z
    .object({
        select: z.lazy(() => ListCountOutputTypeSelectObjectSchema).optional(),
    })
    .strict();

export const ListCountOutputTypeArgsObjectSchema = Schema;
