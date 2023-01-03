import { z } from 'zod';
import { TodoCreateWithoutListInputObjectSchema } from './TodoCreateWithoutListInput.schema';
import { TodoUncheckedCreateWithoutListInputObjectSchema } from './TodoUncheckedCreateWithoutListInput.schema';
import { TodoCreateOrConnectWithoutListInputObjectSchema } from './TodoCreateOrConnectWithoutListInput.schema';
import { TodoUpsertWithWhereUniqueWithoutListInputObjectSchema } from './TodoUpsertWithWhereUniqueWithoutListInput.schema';
import { TodoCreateManyListInputEnvelopeObjectSchema } from './TodoCreateManyListInputEnvelope.schema';
import { TodoWhereUniqueInputObjectSchema } from './TodoWhereUniqueInput.schema';
import { TodoUpdateWithWhereUniqueWithoutListInputObjectSchema } from './TodoUpdateWithWhereUniqueWithoutListInput.schema';
import { TodoUpdateManyWithWhereWithoutListInputObjectSchema } from './TodoUpdateManyWithWhereWithoutListInput.schema';
import { TodoScalarWhereInputObjectSchema } from './TodoScalarWhereInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.TodoUncheckedUpdateManyWithoutListNestedInput> = z
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
        upsert: z
            .union([
                z.lazy(() => TodoUpsertWithWhereUniqueWithoutListInputObjectSchema),
                z.lazy(() => TodoUpsertWithWhereUniqueWithoutListInputObjectSchema).array(),
            ])
            .optional(),
        createMany: z.lazy(() => TodoCreateManyListInputEnvelopeObjectSchema).optional(),
        set: z
            .union([
                z.lazy(() => TodoWhereUniqueInputObjectSchema),
                z.lazy(() => TodoWhereUniqueInputObjectSchema).array(),
            ])
            .optional(),
        disconnect: z
            .union([
                z.lazy(() => TodoWhereUniqueInputObjectSchema),
                z.lazy(() => TodoWhereUniqueInputObjectSchema).array(),
            ])
            .optional(),
        delete: z
            .union([
                z.lazy(() => TodoWhereUniqueInputObjectSchema),
                z.lazy(() => TodoWhereUniqueInputObjectSchema).array(),
            ])
            .optional(),
        connect: z
            .union([
                z.lazy(() => TodoWhereUniqueInputObjectSchema),
                z.lazy(() => TodoWhereUniqueInputObjectSchema).array(),
            ])
            .optional(),
        update: z
            .union([
                z.lazy(() => TodoUpdateWithWhereUniqueWithoutListInputObjectSchema),
                z.lazy(() => TodoUpdateWithWhereUniqueWithoutListInputObjectSchema).array(),
            ])
            .optional(),
        updateMany: z
            .union([
                z.lazy(() => TodoUpdateManyWithWhereWithoutListInputObjectSchema),
                z.lazy(() => TodoUpdateManyWithWhereWithoutListInputObjectSchema).array(),
            ])
            .optional(),
        deleteMany: z
            .union([
                z.lazy(() => TodoScalarWhereInputObjectSchema),
                z.lazy(() => TodoScalarWhereInputObjectSchema).array(),
            ])
            .optional(),
    })
    .strict();

export const TodoUncheckedUpdateManyWithoutListNestedInputObjectSchema = Schema;
