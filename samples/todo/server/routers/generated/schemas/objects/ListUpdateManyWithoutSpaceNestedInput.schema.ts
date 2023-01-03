import { z } from 'zod';
import { ListCreateWithoutSpaceInputObjectSchema } from './ListCreateWithoutSpaceInput.schema';
import { ListUncheckedCreateWithoutSpaceInputObjectSchema } from './ListUncheckedCreateWithoutSpaceInput.schema';
import { ListCreateOrConnectWithoutSpaceInputObjectSchema } from './ListCreateOrConnectWithoutSpaceInput.schema';
import { ListUpsertWithWhereUniqueWithoutSpaceInputObjectSchema } from './ListUpsertWithWhereUniqueWithoutSpaceInput.schema';
import { ListCreateManySpaceInputEnvelopeObjectSchema } from './ListCreateManySpaceInputEnvelope.schema';
import { ListWhereUniqueInputObjectSchema } from './ListWhereUniqueInput.schema';
import { ListUpdateWithWhereUniqueWithoutSpaceInputObjectSchema } from './ListUpdateWithWhereUniqueWithoutSpaceInput.schema';
import { ListUpdateManyWithWhereWithoutSpaceInputObjectSchema } from './ListUpdateManyWithWhereWithoutSpaceInput.schema';
import { ListScalarWhereInputObjectSchema } from './ListScalarWhereInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.ListUpdateManyWithoutSpaceNestedInput> = z
    .object({
        create: z
            .union([
                z.lazy(() => ListCreateWithoutSpaceInputObjectSchema),
                z.lazy(() => ListCreateWithoutSpaceInputObjectSchema).array(),
                z.lazy(() => ListUncheckedCreateWithoutSpaceInputObjectSchema),
                z.lazy(() => ListUncheckedCreateWithoutSpaceInputObjectSchema).array(),
            ])
            .optional(),
        connectOrCreate: z
            .union([
                z.lazy(() => ListCreateOrConnectWithoutSpaceInputObjectSchema),
                z.lazy(() => ListCreateOrConnectWithoutSpaceInputObjectSchema).array(),
            ])
            .optional(),
        upsert: z
            .union([
                z.lazy(() => ListUpsertWithWhereUniqueWithoutSpaceInputObjectSchema),
                z.lazy(() => ListUpsertWithWhereUniqueWithoutSpaceInputObjectSchema).array(),
            ])
            .optional(),
        createMany: z.lazy(() => ListCreateManySpaceInputEnvelopeObjectSchema).optional(),
        set: z
            .union([
                z.lazy(() => ListWhereUniqueInputObjectSchema),
                z.lazy(() => ListWhereUniqueInputObjectSchema).array(),
            ])
            .optional(),
        disconnect: z
            .union([
                z.lazy(() => ListWhereUniqueInputObjectSchema),
                z.lazy(() => ListWhereUniqueInputObjectSchema).array(),
            ])
            .optional(),
        delete: z
            .union([
                z.lazy(() => ListWhereUniqueInputObjectSchema),
                z.lazy(() => ListWhereUniqueInputObjectSchema).array(),
            ])
            .optional(),
        connect: z
            .union([
                z.lazy(() => ListWhereUniqueInputObjectSchema),
                z.lazy(() => ListWhereUniqueInputObjectSchema).array(),
            ])
            .optional(),
        update: z
            .union([
                z.lazy(() => ListUpdateWithWhereUniqueWithoutSpaceInputObjectSchema),
                z.lazy(() => ListUpdateWithWhereUniqueWithoutSpaceInputObjectSchema).array(),
            ])
            .optional(),
        updateMany: z
            .union([
                z.lazy(() => ListUpdateManyWithWhereWithoutSpaceInputObjectSchema),
                z.lazy(() => ListUpdateManyWithWhereWithoutSpaceInputObjectSchema).array(),
            ])
            .optional(),
        deleteMany: z
            .union([
                z.lazy(() => ListScalarWhereInputObjectSchema),
                z.lazy(() => ListScalarWhereInputObjectSchema).array(),
            ])
            .optional(),
    })
    .strict();

export const ListUpdateManyWithoutSpaceNestedInputObjectSchema = Schema;
