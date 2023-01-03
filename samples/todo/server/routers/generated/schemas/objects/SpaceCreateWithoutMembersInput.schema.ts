import { z } from 'zod';
import { ListCreateNestedManyWithoutSpaceInputObjectSchema } from './ListCreateNestedManyWithoutSpaceInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceCreateWithoutMembersInput> = z
    .object({
        id: z.string().optional(),
        createdAt: z.date().optional(),
        updatedAt: z.date().optional(),
        name: z.string(),
        slug: z.string(),
        lists: z.lazy(() => ListCreateNestedManyWithoutSpaceInputObjectSchema).optional(),
    })
    .strict();

export const SpaceCreateWithoutMembersInputObjectSchema = Schema;
