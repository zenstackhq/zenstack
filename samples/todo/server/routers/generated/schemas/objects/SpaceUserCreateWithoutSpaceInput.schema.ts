import { z } from 'zod';
import { UserCreateNestedOneWithoutSpacesInputObjectSchema } from './UserCreateNestedOneWithoutSpacesInput.schema';
import { SpaceUserRoleSchema } from '../enums/SpaceUserRole.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceUserCreateWithoutSpaceInput> = z
  .object({
    id: z.string().optional(),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
    user: z.lazy(() => UserCreateNestedOneWithoutSpacesInputObjectSchema),
    role: z.lazy(() => SpaceUserRoleSchema),
    zenstack_guard: z.boolean().optional(),
    zenstack_transaction: z.string().optional().nullable(),
  })
  .strict();

export const SpaceUserCreateWithoutSpaceInputObjectSchema = Schema;
