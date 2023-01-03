import { z } from 'zod';
import { ListUncheckedCreateNestedManyWithoutSpaceInputObjectSchema } from './ListUncheckedCreateNestedManyWithoutSpaceInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceUncheckedCreateWithoutMembersInput> = z
    .object({
        id: z.string().optional(),
        createdAt: z.date().optional(),
        updatedAt: z.date().optional(),
        name: z.string(),
        slug: z.string(),
        lists: z.lazy(() => ListUncheckedCreateNestedManyWithoutSpaceInputObjectSchema).optional(),
        zenstack_guard: z.boolean().optional(),
        zenstack_transaction: z.string().optional().nullable(),
    })
    .strict();

export const SpaceUncheckedCreateWithoutMembersInputObjectSchema = Schema;
