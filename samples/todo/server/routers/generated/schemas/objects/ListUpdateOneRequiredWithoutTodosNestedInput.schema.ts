import { z } from 'zod';
import { ListCreateWithoutTodosInputObjectSchema } from './ListCreateWithoutTodosInput.schema';
import { ListUncheckedCreateWithoutTodosInputObjectSchema } from './ListUncheckedCreateWithoutTodosInput.schema';
import { ListCreateOrConnectWithoutTodosInputObjectSchema } from './ListCreateOrConnectWithoutTodosInput.schema';
import { ListUpsertWithoutTodosInputObjectSchema } from './ListUpsertWithoutTodosInput.schema';
import { ListWhereUniqueInputObjectSchema } from './ListWhereUniqueInput.schema';
import { ListUpdateWithoutTodosInputObjectSchema } from './ListUpdateWithoutTodosInput.schema';
import { ListUncheckedUpdateWithoutTodosInputObjectSchema } from './ListUncheckedUpdateWithoutTodosInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.ListUpdateOneRequiredWithoutTodosNestedInput> = z
    .object({
        create: z
            .union([
                z.lazy(() => ListCreateWithoutTodosInputObjectSchema),
                z.lazy(() => ListUncheckedCreateWithoutTodosInputObjectSchema),
            ])
            .optional(),
        connectOrCreate: z.lazy(() => ListCreateOrConnectWithoutTodosInputObjectSchema).optional(),
        upsert: z.lazy(() => ListUpsertWithoutTodosInputObjectSchema).optional(),
        connect: z.lazy(() => ListWhereUniqueInputObjectSchema).optional(),
        update: z
            .union([
                z.lazy(() => ListUpdateWithoutTodosInputObjectSchema),
                z.lazy(() => ListUncheckedUpdateWithoutTodosInputObjectSchema),
            ])
            .optional(),
    })
    .strict();

export const ListUpdateOneRequiredWithoutTodosNestedInputObjectSchema = Schema;
