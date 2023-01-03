import { z } from 'zod';
import { StringWithAggregatesFilterObjectSchema } from './StringWithAggregatesFilter.schema';
import { DateTimeWithAggregatesFilterObjectSchema } from './DateTimeWithAggregatesFilter.schema';
import { EnumSpaceUserRoleWithAggregatesFilterObjectSchema } from './EnumSpaceUserRoleWithAggregatesFilter.schema';
import { SpaceUserRoleSchema } from '../enums/SpaceUserRole.schema';
import { BoolWithAggregatesFilterObjectSchema } from './BoolWithAggregatesFilter.schema';
import { StringNullableWithAggregatesFilterObjectSchema } from './StringNullableWithAggregatesFilter.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceUserScalarWhereWithAggregatesInput> = z
    .object({
        AND: z
            .union([
                z.lazy(() => SpaceUserScalarWhereWithAggregatesInputObjectSchema),
                z.lazy(() => SpaceUserScalarWhereWithAggregatesInputObjectSchema).array(),
            ])
            .optional(),
        OR: z
            .lazy(() => SpaceUserScalarWhereWithAggregatesInputObjectSchema)
            .array()
            .optional(),
        NOT: z
            .union([
                z.lazy(() => SpaceUserScalarWhereWithAggregatesInputObjectSchema),
                z.lazy(() => SpaceUserScalarWhereWithAggregatesInputObjectSchema).array(),
            ])
            .optional(),
        id: z.union([z.lazy(() => StringWithAggregatesFilterObjectSchema), z.string()]).optional(),
        createdAt: z.union([z.lazy(() => DateTimeWithAggregatesFilterObjectSchema), z.date()]).optional(),
        updatedAt: z.union([z.lazy(() => DateTimeWithAggregatesFilterObjectSchema), z.date()]).optional(),
        spaceId: z.union([z.lazy(() => StringWithAggregatesFilterObjectSchema), z.string()]).optional(),
        userId: z.union([z.lazy(() => StringWithAggregatesFilterObjectSchema), z.string()]).optional(),
        role: z
            .union([z.lazy(() => EnumSpaceUserRoleWithAggregatesFilterObjectSchema), z.lazy(() => SpaceUserRoleSchema)])
            .optional(),
        zenstack_guard: z.union([z.lazy(() => BoolWithAggregatesFilterObjectSchema), z.boolean()]).optional(),
        zenstack_transaction: z
            .union([z.lazy(() => StringNullableWithAggregatesFilterObjectSchema), z.string()])
            .optional()
            .nullable(),
    })
    .strict();

export const SpaceUserScalarWhereWithAggregatesInputObjectSchema = Schema;
