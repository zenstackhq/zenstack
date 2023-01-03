import { z } from 'zod';
import { SpaceUserRoleSchema } from '../enums/SpaceUserRole.schema';
import { NestedEnumSpaceUserRoleFilterObjectSchema } from './NestedEnumSpaceUserRoleFilter.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.EnumSpaceUserRoleFilter> = z
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
            .union([z.lazy(() => SpaceUserRoleSchema), z.lazy(() => NestedEnumSpaceUserRoleFilterObjectSchema)])
            .optional(),
    })
    .strict();

export const EnumSpaceUserRoleFilterObjectSchema = Schema;
