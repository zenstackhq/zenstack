import { z } from 'zod';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceUserUserIdSpaceIdCompoundUniqueInput> = z
  .object({
    userId: z.string(),
    spaceId: z.string(),
  })
  .strict();

export const SpaceUserUserIdSpaceIdCompoundUniqueInputObjectSchema = Schema;
