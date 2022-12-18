import { z } from 'zod';
import { TodoCreateManyOwnerInputObjectSchema } from './TodoCreateManyOwnerInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.TodoCreateManyOwnerInputEnvelope> = z
  .object({
    data: z.lazy(() => TodoCreateManyOwnerInputObjectSchema).array(),
    skipDuplicates: z.boolean().optional(),
  })
  .strict();

export const TodoCreateManyOwnerInputEnvelopeObjectSchema = Schema;
