import { z } from 'zod';
import { TodoCreateManyListInputObjectSchema } from './TodoCreateManyListInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.TodoCreateManyListInputEnvelope> = z
    .object({
        data: z.lazy(() => TodoCreateManyListInputObjectSchema).array(),
        skipDuplicates: z.boolean().optional(),
    })
    .strict();

export const TodoCreateManyListInputEnvelopeObjectSchema = Schema;
