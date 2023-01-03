import { z } from 'zod';
import { SpaceCreateWithoutListsInputObjectSchema } from './SpaceCreateWithoutListsInput.schema';
import { SpaceUncheckedCreateWithoutListsInputObjectSchema } from './SpaceUncheckedCreateWithoutListsInput.schema';
import { SpaceCreateOrConnectWithoutListsInputObjectSchema } from './SpaceCreateOrConnectWithoutListsInput.schema';
import { SpaceWhereUniqueInputObjectSchema } from './SpaceWhereUniqueInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceCreateNestedOneWithoutListsInput> = z
    .object({
        create: z
            .union([
                z.lazy(() => SpaceCreateWithoutListsInputObjectSchema),
                z.lazy(() => SpaceUncheckedCreateWithoutListsInputObjectSchema),
            ])
            .optional(),
        connectOrCreate: z.lazy(() => SpaceCreateOrConnectWithoutListsInputObjectSchema).optional(),
        connect: z.lazy(() => SpaceWhereUniqueInputObjectSchema).optional(),
    })
    .strict();

export const SpaceCreateNestedOneWithoutListsInputObjectSchema = Schema;
