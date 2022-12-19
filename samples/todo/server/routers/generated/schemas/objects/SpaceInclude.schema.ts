import { z } from 'zod';
import { SpaceUserSchema } from '../SpaceUser.schema';
import { ListSchema } from '../List.schema';
import { SpaceCountOutputTypeArgsObjectSchema } from './SpaceCountOutputTypeArgs.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceInclude> = z
  .object({
    members: z
      .union([z.boolean(), z.lazy(() => SpaceUserSchema.findMany)])
      .optional(),
    lists: z.union([z.boolean(), z.lazy(() => ListSchema.findMany)]).optional(),
    _count: z
      .union([z.boolean(), z.lazy(() => SpaceCountOutputTypeArgsObjectSchema)])
      .optional(),
  })
  .strict();

export const SpaceIncludeObjectSchema = Schema;
