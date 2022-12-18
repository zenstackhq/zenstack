import { z } from 'zod';
import { StringFilterObjectSchema } from './StringFilter.schema';
import { DateTimeFilterObjectSchema } from './DateTimeFilter.schema';
import { EnumSpaceUserRoleFilterObjectSchema } from './EnumSpaceUserRoleFilter.schema';
import { SpaceUserRoleSchema } from '../enums/SpaceUserRole.schema';
import { BoolFilterObjectSchema } from './BoolFilter.schema';
import { StringNullableFilterObjectSchema } from './StringNullableFilter.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceUserScalarWhereInput> = z
  .object({
    AND: z
      .union([
        z.lazy(() => SpaceUserScalarWhereInputObjectSchema),
        z.lazy(() => SpaceUserScalarWhereInputObjectSchema).array(),
      ])
      .optional(),
    OR: z
      .lazy(() => SpaceUserScalarWhereInputObjectSchema)
      .array()
      .optional(),
    NOT: z
      .union([
        z.lazy(() => SpaceUserScalarWhereInputObjectSchema),
        z.lazy(() => SpaceUserScalarWhereInputObjectSchema).array(),
      ])
      .optional(),
    id: z
      .union([z.lazy(() => StringFilterObjectSchema), z.string()])
      .optional(),
    createdAt: z
      .union([z.lazy(() => DateTimeFilterObjectSchema), z.date()])
      .optional(),
    updatedAt: z
      .union([z.lazy(() => DateTimeFilterObjectSchema), z.date()])
      .optional(),
    spaceId: z
      .union([z.lazy(() => StringFilterObjectSchema), z.string()])
      .optional(),
    userId: z
      .union([z.lazy(() => StringFilterObjectSchema), z.string()])
      .optional(),
    role: z
      .union([
        z.lazy(() => EnumSpaceUserRoleFilterObjectSchema),
        z.lazy(() => SpaceUserRoleSchema),
      ])
      .optional(),
    zenstack_guard: z
      .union([z.lazy(() => BoolFilterObjectSchema), z.boolean()])
      .optional(),
    zenstack_transaction: z
      .union([z.lazy(() => StringNullableFilterObjectSchema), z.string()])
      .optional()
      .nullable(),
  })
  .strict();

export const SpaceUserScalarWhereInputObjectSchema = Schema;
