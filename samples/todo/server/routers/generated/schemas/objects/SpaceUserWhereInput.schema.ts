import { z } from 'zod';
import { StringFilterObjectSchema } from './StringFilter.schema';
import { DateTimeFilterObjectSchema } from './DateTimeFilter.schema';
import { SpaceRelationFilterObjectSchema } from './SpaceRelationFilter.schema';
import { SpaceWhereInputObjectSchema } from './SpaceWhereInput.schema';
import { UserRelationFilterObjectSchema } from './UserRelationFilter.schema';
import { UserWhereInputObjectSchema } from './UserWhereInput.schema';
import { EnumSpaceUserRoleFilterObjectSchema } from './EnumSpaceUserRoleFilter.schema';
import { SpaceUserRoleSchema } from '../enums/SpaceUserRole.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceUserWhereInput> = z
    .object({
        AND: z
            .union([
                z.lazy(() => SpaceUserWhereInputObjectSchema),
                z.lazy(() => SpaceUserWhereInputObjectSchema).array(),
            ])
            .optional(),
        OR: z
            .lazy(() => SpaceUserWhereInputObjectSchema)
            .array()
            .optional(),
        NOT: z
            .union([
                z.lazy(() => SpaceUserWhereInputObjectSchema),
                z.lazy(() => SpaceUserWhereInputObjectSchema).array(),
            ])
            .optional(),
        id: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
        createdAt: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.date()]).optional(),
        updatedAt: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.date()]).optional(),
        space: z
            .union([z.lazy(() => SpaceRelationFilterObjectSchema), z.lazy(() => SpaceWhereInputObjectSchema)])
            .optional(),
        spaceId: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
        user: z
            .union([z.lazy(() => UserRelationFilterObjectSchema), z.lazy(() => UserWhereInputObjectSchema)])
            .optional(),
        userId: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
        role: z
            .union([z.lazy(() => EnumSpaceUserRoleFilterObjectSchema), z.lazy(() => SpaceUserRoleSchema)])
            .optional(),
    })
    .strict();

export const SpaceUserWhereInputObjectSchema = Schema;
