import { z } from 'zod';
import { SpaceCreateWithoutListsInputObjectSchema } from './SpaceCreateWithoutListsInput.schema';
import { SpaceUncheckedCreateWithoutListsInputObjectSchema } from './SpaceUncheckedCreateWithoutListsInput.schema';
import { SpaceCreateOrConnectWithoutListsInputObjectSchema } from './SpaceCreateOrConnectWithoutListsInput.schema';
import { SpaceUpsertWithoutListsInputObjectSchema } from './SpaceUpsertWithoutListsInput.schema';
import { SpaceWhereUniqueInputObjectSchema } from './SpaceWhereUniqueInput.schema';
import { SpaceUpdateWithoutListsInputObjectSchema } from './SpaceUpdateWithoutListsInput.schema';
import { SpaceUncheckedUpdateWithoutListsInputObjectSchema } from './SpaceUncheckedUpdateWithoutListsInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceUpdateOneRequiredWithoutListsNestedInput> = z
    .object({
        create: z
            .union([
                z.lazy(() => SpaceCreateWithoutListsInputObjectSchema),
                z.lazy(() => SpaceUncheckedCreateWithoutListsInputObjectSchema),
            ])
            .optional(),
        connectOrCreate: z.lazy(() => SpaceCreateOrConnectWithoutListsInputObjectSchema).optional(),
        upsert: z.lazy(() => SpaceUpsertWithoutListsInputObjectSchema).optional(),
        connect: z.lazy(() => SpaceWhereUniqueInputObjectSchema).optional(),
        update: z
            .union([
                z.lazy(() => SpaceUpdateWithoutListsInputObjectSchema),
                z.lazy(() => SpaceUncheckedUpdateWithoutListsInputObjectSchema),
            ])
            .optional(),
    })
    .strict();

export const SpaceUpdateOneRequiredWithoutListsNestedInputObjectSchema = Schema;
