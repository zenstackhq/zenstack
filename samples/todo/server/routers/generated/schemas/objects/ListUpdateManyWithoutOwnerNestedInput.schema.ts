import { z } from 'zod';
import { ListCreateWithoutOwnerInputObjectSchema } from './ListCreateWithoutOwnerInput.schema';
import { ListUncheckedCreateWithoutOwnerInputObjectSchema } from './ListUncheckedCreateWithoutOwnerInput.schema';
import { ListCreateOrConnectWithoutOwnerInputObjectSchema } from './ListCreateOrConnectWithoutOwnerInput.schema';
import { ListUpsertWithWhereUniqueWithoutOwnerInputObjectSchema } from './ListUpsertWithWhereUniqueWithoutOwnerInput.schema';
import { ListCreateManyOwnerInputEnvelopeObjectSchema } from './ListCreateManyOwnerInputEnvelope.schema';
import { ListWhereUniqueInputObjectSchema } from './ListWhereUniqueInput.schema';
import { ListUpdateWithWhereUniqueWithoutOwnerInputObjectSchema } from './ListUpdateWithWhereUniqueWithoutOwnerInput.schema';
import { ListUpdateManyWithWhereWithoutOwnerInputObjectSchema } from './ListUpdateManyWithWhereWithoutOwnerInput.schema';
import { ListScalarWhereInputObjectSchema } from './ListScalarWhereInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.ListUpdateManyWithoutOwnerNestedInput> = z
    .object({
        create: z
            .union([
                z.lazy(() => ListCreateWithoutOwnerInputObjectSchema),
                z.lazy(() => ListCreateWithoutOwnerInputObjectSchema).array(),
                z.lazy(() => ListUncheckedCreateWithoutOwnerInputObjectSchema),
                z.lazy(() => ListUncheckedCreateWithoutOwnerInputObjectSchema).array(),
            ])
            .optional(),
        connectOrCreate: z
            .union([
                z.lazy(() => ListCreateOrConnectWithoutOwnerInputObjectSchema),
                z.lazy(() => ListCreateOrConnectWithoutOwnerInputObjectSchema).array(),
            ])
            .optional(),
        upsert: z
            .union([
                z.lazy(() => ListUpsertWithWhereUniqueWithoutOwnerInputObjectSchema),
                z.lazy(() => ListUpsertWithWhereUniqueWithoutOwnerInputObjectSchema).array(),
            ])
            .optional(),
        createMany: z.lazy(() => ListCreateManyOwnerInputEnvelopeObjectSchema).optional(),
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
                z.lazy(() => ListUpdateWithWhereUniqueWithoutOwnerInputObjectSchema),
                z.lazy(() => ListUpdateWithWhereUniqueWithoutOwnerInputObjectSchema).array(),
            ])
            .optional(),
        updateMany: z
            .union([
                z.lazy(() => ListUpdateManyWithWhereWithoutOwnerInputObjectSchema),
                z.lazy(() => ListUpdateManyWithWhereWithoutOwnerInputObjectSchema).array(),
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

export const ListUpdateManyWithoutOwnerNestedInputObjectSchema = Schema;
