import { z } from 'zod';
import { TodoCreateWithoutListInputObjectSchema } from './TodoCreateWithoutListInput.schema';
import { TodoUncheckedCreateWithoutListInputObjectSchema } from './TodoUncheckedCreateWithoutListInput.schema';
import { TodoCreateOrConnectWithoutListInputObjectSchema } from './TodoCreateOrConnectWithoutListInput.schema';
import { TodoCreateManyListInputEnvelopeObjectSchema } from './TodoCreateManyListInputEnvelope.schema';
import { TodoWhereUniqueInputObjectSchema } from './TodoWhereUniqueInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.TodoUncheckedCreateNestedManyWithoutListInput> = z
    .object({
        create: z
            .union([
                z.lazy(() => TodoCreateWithoutListInputObjectSchema),
                z.lazy(() => TodoCreateWithoutListInputObjectSchema).array(),
                z.lazy(() => TodoUncheckedCreateWithoutListInputObjectSchema),
                z.lazy(() => TodoUncheckedCreateWithoutListInputObjectSchema).array(),
            ])
            .optional(),
        connectOrCreate: z
            .union([
                z.lazy(() => TodoCreateOrConnectWithoutListInputObjectSchema),
                z.lazy(() => TodoCreateOrConnectWithoutListInputObjectSchema).array(),
            ])
            .optional(),
        createMany: z.lazy(() => TodoCreateManyListInputEnvelopeObjectSchema).optional(),
        connect: z
            .union([
                z.lazy(() => TodoWhereUniqueInputObjectSchema),
                z.lazy(() => TodoWhereUniqueInputObjectSchema).array(),
            ])
            .optional(),
    })
    .strict();

export const TodoUncheckedCreateNestedManyWithoutListInputObjectSchema = Schema;
