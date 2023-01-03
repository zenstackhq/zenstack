import { z } from 'zod';
import { ListCreateWithoutOwnerInputObjectSchema } from './ListCreateWithoutOwnerInput.schema';
import { ListUncheckedCreateWithoutOwnerInputObjectSchema } from './ListUncheckedCreateWithoutOwnerInput.schema';
import { ListCreateOrConnectWithoutOwnerInputObjectSchema } from './ListCreateOrConnectWithoutOwnerInput.schema';
import { ListCreateManyOwnerInputEnvelopeObjectSchema } from './ListCreateManyOwnerInputEnvelope.schema';
import { ListWhereUniqueInputObjectSchema } from './ListWhereUniqueInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.ListUncheckedCreateNestedManyWithoutOwnerInput> = z
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
        createMany: z.lazy(() => ListCreateManyOwnerInputEnvelopeObjectSchema).optional(),
        connect: z
            .union([
                z.lazy(() => ListWhereUniqueInputObjectSchema),
                z.lazy(() => ListWhereUniqueInputObjectSchema).array(),
            ])
            .optional(),
    })
    .strict();

export const ListUncheckedCreateNestedManyWithoutOwnerInputObjectSchema = Schema;
