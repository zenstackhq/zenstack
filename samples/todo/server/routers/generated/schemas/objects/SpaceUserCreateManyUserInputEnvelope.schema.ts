import { z } from 'zod';
import { SpaceUserCreateManyUserInputObjectSchema } from './SpaceUserCreateManyUserInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceUserCreateManyUserInputEnvelope> = z
    .object({
        data: z.lazy(() => SpaceUserCreateManyUserInputObjectSchema).array(),
        skipDuplicates: z.boolean().optional(),
    })
    .strict();

export const SpaceUserCreateManyUserInputEnvelopeObjectSchema = Schema;
