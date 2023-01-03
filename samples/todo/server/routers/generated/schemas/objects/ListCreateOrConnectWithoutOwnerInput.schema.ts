import { z } from 'zod';
import { ListWhereUniqueInputObjectSchema } from './ListWhereUniqueInput.schema';
import { ListCreateWithoutOwnerInputObjectSchema } from './ListCreateWithoutOwnerInput.schema';
import { ListUncheckedCreateWithoutOwnerInputObjectSchema } from './ListUncheckedCreateWithoutOwnerInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.ListCreateOrConnectWithoutOwnerInput> = z
    .object({
        where: z.lazy(() => ListWhereUniqueInputObjectSchema),
        create: z.union([
            z.lazy(() => ListCreateWithoutOwnerInputObjectSchema),
            z.lazy(() => ListUncheckedCreateWithoutOwnerInputObjectSchema),
        ]),
    })
    .strict();

export const ListCreateOrConnectWithoutOwnerInputObjectSchema = Schema;
