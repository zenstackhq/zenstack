import { z } from 'zod';
import { ListCreateWithoutSpaceInputObjectSchema } from './ListCreateWithoutSpaceInput.schema';
import { ListUncheckedCreateWithoutSpaceInputObjectSchema } from './ListUncheckedCreateWithoutSpaceInput.schema';
import { ListCreateOrConnectWithoutSpaceInputObjectSchema } from './ListCreateOrConnectWithoutSpaceInput.schema';
import { ListCreateManySpaceInputEnvelopeObjectSchema } from './ListCreateManySpaceInputEnvelope.schema';
import { ListWhereUniqueInputObjectSchema } from './ListWhereUniqueInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.ListUncheckedCreateNestedManyWithoutSpaceInput> = z
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
        createMany: z.lazy(() => ListCreateManySpaceInputEnvelopeObjectSchema).optional(),
        connect: z
            .union([
                z.lazy(() => ListWhereUniqueInputObjectSchema),
                z.lazy(() => ListWhereUniqueInputObjectSchema).array(),
            ])
            .optional(),
    })
    .strict();

export const ListUncheckedCreateNestedManyWithoutSpaceInputObjectSchema = Schema;
