import { z } from 'zod';
import { TodoSelectObjectSchema } from './TodoSelect.schema';
import { TodoIncludeObjectSchema } from './TodoInclude.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.TodoArgs> = z
    .object({
        select: z.lazy(() => TodoSelectObjectSchema).optional(),
        include: z.lazy(() => TodoIncludeObjectSchema).optional(),
    })
    .strict();

export const TodoArgsObjectSchema = Schema;
