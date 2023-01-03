import { z } from 'zod';
import { SpaceUserCreateManySpaceInputObjectSchema } from './SpaceUserCreateManySpaceInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceUserCreateManySpaceInputEnvelope> = z
    .object({
        data: z.lazy(() => SpaceUserCreateManySpaceInputObjectSchema).array(),
        skipDuplicates: z.boolean().optional(),
    })
    .strict();

export const SpaceUserCreateManySpaceInputEnvelopeObjectSchema = Schema;
