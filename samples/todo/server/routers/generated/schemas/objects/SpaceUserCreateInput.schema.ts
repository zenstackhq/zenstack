import { z } from 'zod';
import { SpaceCreateNestedOneWithoutMembersInputObjectSchema } from './SpaceCreateNestedOneWithoutMembersInput.schema';
import { UserCreateNestedOneWithoutSpacesInputObjectSchema } from './UserCreateNestedOneWithoutSpacesInput.schema';
import { SpaceUserRoleSchema } from '../enums/SpaceUserRole.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceUserCreateInput> = z
    .object({
        id: z.string().optional(),
        createdAt: z.date().optional(),
        updatedAt: z.date().optional(),
        space: z.lazy(() => SpaceCreateNestedOneWithoutMembersInputObjectSchema),
        user: z.lazy(() => UserCreateNestedOneWithoutSpacesInputObjectSchema),
        role: z.lazy(() => SpaceUserRoleSchema),
    })
    .strict();

export const SpaceUserCreateInputObjectSchema = Schema;
