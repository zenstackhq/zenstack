import { z } from 'zod';
import { SpaceUserFindManySchema } from '../findManySpaceUser.schema';
import { ListFindManySchema } from '../findManyList.schema';
import { SpaceCountOutputTypeArgsObjectSchema } from './SpaceCountOutputTypeArgs.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceSelect> = z
  .object({
    id: z.boolean().optional(),
    createdAt: z.boolean().optional(),
    updatedAt: z.boolean().optional(),
    name: z.boolean().optional(),
    slug: z.boolean().optional(),
    members: z
      .union([z.boolean(), z.lazy(() => SpaceUserFindManySchema)])
      .optional(),
    lists: z.union([z.boolean(), z.lazy(() => ListFindManySchema)]).optional(),
    zenstack_guard: z.boolean().optional(),
    zenstack_transaction: z.boolean().optional(),
    _count: z
      .union([z.boolean(), z.lazy(() => SpaceCountOutputTypeArgsObjectSchema)])
      .optional(),
  })
  .strict();

export const SpaceSelectObjectSchema = Schema;
