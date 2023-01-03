import { z } from 'zod';
import { SpaceUserCreateWithoutUserInputObjectSchema } from './SpaceUserCreateWithoutUserInput.schema';
import { SpaceUserUncheckedCreateWithoutUserInputObjectSchema } from './SpaceUserUncheckedCreateWithoutUserInput.schema';
import { SpaceUserCreateOrConnectWithoutUserInputObjectSchema } from './SpaceUserCreateOrConnectWithoutUserInput.schema';
import { SpaceUserCreateManyUserInputEnvelopeObjectSchema } from './SpaceUserCreateManyUserInputEnvelope.schema';
import { SpaceUserWhereUniqueInputObjectSchema } from './SpaceUserWhereUniqueInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceUserUncheckedCreateNestedManyWithoutUserInput> = z
    .object({
        create: z
            .union([
                z.lazy(() => SpaceUserCreateWithoutUserInputObjectSchema),
                z.lazy(() => SpaceUserCreateWithoutUserInputObjectSchema).array(),
                z.lazy(() => SpaceUserUncheckedCreateWithoutUserInputObjectSchema),
                z.lazy(() => SpaceUserUncheckedCreateWithoutUserInputObjectSchema).array(),
            ])
            .optional(),
        connectOrCreate: z
            .union([
                z.lazy(() => SpaceUserCreateOrConnectWithoutUserInputObjectSchema),
                z.lazy(() => SpaceUserCreateOrConnectWithoutUserInputObjectSchema).array(),
            ])
            .optional(),
        createMany: z.lazy(() => SpaceUserCreateManyUserInputEnvelopeObjectSchema).optional(),
        connect: z
            .union([
                z.lazy(() => SpaceUserWhereUniqueInputObjectSchema),
                z.lazy(() => SpaceUserWhereUniqueInputObjectSchema).array(),
            ])
            .optional(),
    })
    .strict();

export const SpaceUserUncheckedCreateNestedManyWithoutUserInputObjectSchema = Schema;
