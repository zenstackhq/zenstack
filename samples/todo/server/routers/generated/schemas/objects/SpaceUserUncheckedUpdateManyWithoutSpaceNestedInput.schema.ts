import { z } from 'zod';
import { SpaceUserCreateWithoutSpaceInputObjectSchema } from './SpaceUserCreateWithoutSpaceInput.schema';
import { SpaceUserUncheckedCreateWithoutSpaceInputObjectSchema } from './SpaceUserUncheckedCreateWithoutSpaceInput.schema';
import { SpaceUserCreateOrConnectWithoutSpaceInputObjectSchema } from './SpaceUserCreateOrConnectWithoutSpaceInput.schema';
import { SpaceUserUpsertWithWhereUniqueWithoutSpaceInputObjectSchema } from './SpaceUserUpsertWithWhereUniqueWithoutSpaceInput.schema';
import { SpaceUserCreateManySpaceInputEnvelopeObjectSchema } from './SpaceUserCreateManySpaceInputEnvelope.schema';
import { SpaceUserWhereUniqueInputObjectSchema } from './SpaceUserWhereUniqueInput.schema';
import { SpaceUserUpdateWithWhereUniqueWithoutSpaceInputObjectSchema } from './SpaceUserUpdateWithWhereUniqueWithoutSpaceInput.schema';
import { SpaceUserUpdateManyWithWhereWithoutSpaceInputObjectSchema } from './SpaceUserUpdateManyWithWhereWithoutSpaceInput.schema';
import { SpaceUserScalarWhereInputObjectSchema } from './SpaceUserScalarWhereInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceUserUncheckedUpdateManyWithoutSpaceNestedInput> = z
    .object({
        create: z
            .union([
                z.lazy(() => SpaceUserCreateWithoutSpaceInputObjectSchema),
                z.lazy(() => SpaceUserCreateWithoutSpaceInputObjectSchema).array(),
                z.lazy(() => SpaceUserUncheckedCreateWithoutSpaceInputObjectSchema),
                z.lazy(() => SpaceUserUncheckedCreateWithoutSpaceInputObjectSchema).array(),
            ])
            .optional(),
        connectOrCreate: z
            .union([
                z.lazy(() => SpaceUserCreateOrConnectWithoutSpaceInputObjectSchema),
                z.lazy(() => SpaceUserCreateOrConnectWithoutSpaceInputObjectSchema).array(),
            ])
            .optional(),
        upsert: z
            .union([
                z.lazy(() => SpaceUserUpsertWithWhereUniqueWithoutSpaceInputObjectSchema),
                z.lazy(() => SpaceUserUpsertWithWhereUniqueWithoutSpaceInputObjectSchema).array(),
            ])
            .optional(),
        createMany: z.lazy(() => SpaceUserCreateManySpaceInputEnvelopeObjectSchema).optional(),
        set: z
            .union([
                z.lazy(() => SpaceUserWhereUniqueInputObjectSchema),
                z.lazy(() => SpaceUserWhereUniqueInputObjectSchema).array(),
            ])
            .optional(),
        disconnect: z
            .union([
                z.lazy(() => SpaceUserWhereUniqueInputObjectSchema),
                z.lazy(() => SpaceUserWhereUniqueInputObjectSchema).array(),
            ])
            .optional(),
        delete: z
            .union([
                z.lazy(() => SpaceUserWhereUniqueInputObjectSchema),
                z.lazy(() => SpaceUserWhereUniqueInputObjectSchema).array(),
            ])
            .optional(),
        connect: z
            .union([
                z.lazy(() => SpaceUserWhereUniqueInputObjectSchema),
                z.lazy(() => SpaceUserWhereUniqueInputObjectSchema).array(),
            ])
            .optional(),
        update: z
            .union([
                z.lazy(() => SpaceUserUpdateWithWhereUniqueWithoutSpaceInputObjectSchema),
                z.lazy(() => SpaceUserUpdateWithWhereUniqueWithoutSpaceInputObjectSchema).array(),
            ])
            .optional(),
        updateMany: z
            .union([
                z.lazy(() => SpaceUserUpdateManyWithWhereWithoutSpaceInputObjectSchema),
                z.lazy(() => SpaceUserUpdateManyWithWhereWithoutSpaceInputObjectSchema).array(),
            ])
            .optional(),
        deleteMany: z
            .union([
                z.lazy(() => SpaceUserScalarWhereInputObjectSchema),
                z.lazy(() => SpaceUserScalarWhereInputObjectSchema).array(),
            ])
            .optional(),
    })
    .strict();

export const SpaceUserUncheckedUpdateManyWithoutSpaceNestedInputObjectSchema = Schema;
