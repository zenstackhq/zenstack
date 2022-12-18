import { z } from 'zod';
import { TodoCreateWithoutOwnerInputObjectSchema } from './TodoCreateWithoutOwnerInput.schema';
import { TodoUncheckedCreateWithoutOwnerInputObjectSchema } from './TodoUncheckedCreateWithoutOwnerInput.schema';
import { TodoCreateOrConnectWithoutOwnerInputObjectSchema } from './TodoCreateOrConnectWithoutOwnerInput.schema';
import { TodoUpsertWithWhereUniqueWithoutOwnerInputObjectSchema } from './TodoUpsertWithWhereUniqueWithoutOwnerInput.schema';
import { TodoCreateManyOwnerInputEnvelopeObjectSchema } from './TodoCreateManyOwnerInputEnvelope.schema';
import { TodoWhereUniqueInputObjectSchema } from './TodoWhereUniqueInput.schema';
import { TodoUpdateWithWhereUniqueWithoutOwnerInputObjectSchema } from './TodoUpdateWithWhereUniqueWithoutOwnerInput.schema';
import { TodoUpdateManyWithWhereWithoutOwnerInputObjectSchema } from './TodoUpdateManyWithWhereWithoutOwnerInput.schema';
import { TodoScalarWhereInputObjectSchema } from './TodoScalarWhereInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.TodoUncheckedUpdateManyWithoutOwnerNestedInput> =
  z
    .object({
      create: z
        .union([
          z.lazy(() => TodoCreateWithoutOwnerInputObjectSchema),
          z.lazy(() => TodoCreateWithoutOwnerInputObjectSchema).array(),
          z.lazy(() => TodoUncheckedCreateWithoutOwnerInputObjectSchema),
          z
            .lazy(() => TodoUncheckedCreateWithoutOwnerInputObjectSchema)
            .array(),
        ])
        .optional(),
      connectOrCreate: z
        .union([
          z.lazy(() => TodoCreateOrConnectWithoutOwnerInputObjectSchema),
          z
            .lazy(() => TodoCreateOrConnectWithoutOwnerInputObjectSchema)
            .array(),
        ])
        .optional(),
      upsert: z
        .union([
          z.lazy(() => TodoUpsertWithWhereUniqueWithoutOwnerInputObjectSchema),
          z
            .lazy(() => TodoUpsertWithWhereUniqueWithoutOwnerInputObjectSchema)
            .array(),
        ])
        .optional(),
      createMany: z
        .lazy(() => TodoCreateManyOwnerInputEnvelopeObjectSchema)
        .optional(),
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
          z.lazy(() => TodoUpdateWithWhereUniqueWithoutOwnerInputObjectSchema),
          z
            .lazy(() => TodoUpdateWithWhereUniqueWithoutOwnerInputObjectSchema)
            .array(),
        ])
        .optional(),
      updateMany: z
        .union([
          z.lazy(() => TodoUpdateManyWithWhereWithoutOwnerInputObjectSchema),
          z
            .lazy(() => TodoUpdateManyWithWhereWithoutOwnerInputObjectSchema)
            .array(),
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

export const TodoUncheckedUpdateManyWithoutOwnerNestedInputObjectSchema =
  Schema;
