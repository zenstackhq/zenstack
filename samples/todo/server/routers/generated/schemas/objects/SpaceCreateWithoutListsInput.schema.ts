import { z } from 'zod';
import { SpaceUserCreateNestedManyWithoutSpaceInputObjectSchema } from './SpaceUserCreateNestedManyWithoutSpaceInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceCreateWithoutListsInput> = z
    .object({
        id: z.string().optional(),
        createdAt: z.date().optional(),
        updatedAt: z.date().optional(),
        name: z.string(),
        slug: z.string(),
        members: z.lazy(() => SpaceUserCreateNestedManyWithoutSpaceInputObjectSchema).optional(),
    })
    .strict();

export const SpaceCreateWithoutListsInputObjectSchema = Schema;
