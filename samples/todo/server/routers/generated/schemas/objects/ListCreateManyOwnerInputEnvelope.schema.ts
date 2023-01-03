import { z } from 'zod';
import { ListCreateManyOwnerInputObjectSchema } from './ListCreateManyOwnerInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.ListCreateManyOwnerInputEnvelope> = z
    .object({
        data: z.lazy(() => ListCreateManyOwnerInputObjectSchema).array(),
        skipDuplicates: z.boolean().optional(),
    })
    .strict();

export const ListCreateManyOwnerInputEnvelopeObjectSchema = Schema;
