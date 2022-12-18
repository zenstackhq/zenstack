import { z } from 'zod';
import { SpaceUserRoleSchema } from '../enums/SpaceUserRole.schema';
import { NestedIntFilterObjectSchema } from './NestedIntFilter.schema';
import { NestedEnumSpaceUserRoleFilterObjectSchema } from './NestedEnumSpaceUserRoleFilter.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.NestedEnumSpaceUserRoleWithAggregatesFilter> = z
  .object({
    equals: z.lazy(() => SpaceUserRoleSchema).optional(),
    in: z
      .lazy(() => SpaceUserRoleSchema)
      .array()
      .optional(),
    notIn: z
      .lazy(() => SpaceUserRoleSchema)
      .array()
      .optional(),
    not: z
      .union([
        z.lazy(() => SpaceUserRoleSchema),
        z.lazy(() => NestedEnumSpaceUserRoleWithAggregatesFilterObjectSchema),
      ])
      .optional(),
    _count: z.lazy(() => NestedIntFilterObjectSchema).optional(),
    _min: z.lazy(() => NestedEnumSpaceUserRoleFilterObjectSchema).optional(),
    _max: z.lazy(() => NestedEnumSpaceUserRoleFilterObjectSchema).optional(),
  })
  .strict();

export const NestedEnumSpaceUserRoleWithAggregatesFilterObjectSchema = Schema;
