import { z } from 'zod';
import { SpaceUserUserIdSpaceIdCompoundUniqueInputObjectSchema } from './SpaceUserUserIdSpaceIdCompoundUniqueInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceUserWhereUniqueInput> = z
  .object({
    id: z.string().optional(),
    userId_spaceId: z
      .lazy(() => SpaceUserUserIdSpaceIdCompoundUniqueInputObjectSchema)
      .optional(),
  })
  .strict();

export const SpaceUserWhereUniqueInputObjectSchema = Schema;
