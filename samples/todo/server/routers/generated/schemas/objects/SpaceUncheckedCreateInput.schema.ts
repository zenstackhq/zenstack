import { z } from 'zod';
import { SpaceUserUncheckedCreateNestedManyWithoutSpaceInputObjectSchema } from './SpaceUserUncheckedCreateNestedManyWithoutSpaceInput.schema';
import { ListUncheckedCreateNestedManyWithoutSpaceInputObjectSchema } from './ListUncheckedCreateNestedManyWithoutSpaceInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceUncheckedCreateInput> = z
    .object({
        id: z.string().optional(),
        createdAt: z.date().optional(),
        updatedAt: z.date().optional(),
        name: z.string(),
        slug: z.string(),
        members: z.lazy(() => SpaceUserUncheckedCreateNestedManyWithoutSpaceInputObjectSchema).optional(),
        lists: z.lazy(() => ListUncheckedCreateNestedManyWithoutSpaceInputObjectSchema).optional(),
    })
    .strict();

export const SpaceUncheckedCreateInputObjectSchema = Schema;
