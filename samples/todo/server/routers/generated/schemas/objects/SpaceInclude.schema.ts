import { z } from 'zod';
import { SpaceUserFindManySchema } from '../findManySpaceUser.schema';
import { ListFindManySchema } from '../findManyList.schema';
import { SpaceCountOutputTypeArgsObjectSchema } from './SpaceCountOutputTypeArgs.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceInclude> = z
  .object({
    members: z
      .union([z.boolean(), z.lazy(() => SpaceUserFindManySchema)])
      .optional(),
    lists: z.union([z.boolean(), z.lazy(() => ListFindManySchema)]).optional(),
    _count: z
      .union([z.boolean(), z.lazy(() => SpaceCountOutputTypeArgsObjectSchema)])
      .optional(),
  })
  .strict();

export const SpaceIncludeObjectSchema = Schema;
