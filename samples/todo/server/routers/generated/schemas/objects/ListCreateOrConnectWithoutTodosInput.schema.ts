import { z } from 'zod';
import { ListWhereUniqueInputObjectSchema } from './ListWhereUniqueInput.schema';
import { ListCreateWithoutTodosInputObjectSchema } from './ListCreateWithoutTodosInput.schema';
import { ListUncheckedCreateWithoutTodosInputObjectSchema } from './ListUncheckedCreateWithoutTodosInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.ListCreateOrConnectWithoutTodosInput> = z
    .object({
        where: z.lazy(() => ListWhereUniqueInputObjectSchema),
        create: z.union([
            z.lazy(() => ListCreateWithoutTodosInputObjectSchema),
            z.lazy(() => ListUncheckedCreateWithoutTodosInputObjectSchema),
        ]),
    })
    .strict();

export const ListCreateOrConnectWithoutTodosInputObjectSchema = Schema;
