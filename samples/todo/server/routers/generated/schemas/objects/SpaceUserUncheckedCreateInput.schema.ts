import { z } from 'zod';
import { SpaceUserRoleSchema } from '../enums/SpaceUserRole.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceUserUncheckedCreateInput> = z
    .object({
        id: z.string().optional(),
        createdAt: z.date().optional(),
        updatedAt: z.date().optional(),
        spaceId: z.string(),
        userId: z.string(),
        role: z.lazy(() => SpaceUserRoleSchema),
    })
    .strict();

export const SpaceUserUncheckedCreateInputObjectSchema = Schema;
