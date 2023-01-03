import { z } from 'zod';
import { SpaceWhereUniqueInputObjectSchema } from './SpaceWhereUniqueInput.schema';
import { SpaceCreateWithoutListsInputObjectSchema } from './SpaceCreateWithoutListsInput.schema';
import { SpaceUncheckedCreateWithoutListsInputObjectSchema } from './SpaceUncheckedCreateWithoutListsInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceCreateOrConnectWithoutListsInput> = z
    .object({
        where: z.lazy(() => SpaceWhereUniqueInputObjectSchema),
        create: z.union([
            z.lazy(() => SpaceCreateWithoutListsInputObjectSchema),
            z.lazy(() => SpaceUncheckedCreateWithoutListsInputObjectSchema),
        ]),
    })
    .strict();

export const SpaceCreateOrConnectWithoutListsInputObjectSchema = Schema;
