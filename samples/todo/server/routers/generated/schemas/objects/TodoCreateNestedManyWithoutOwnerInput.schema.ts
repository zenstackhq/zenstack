import { z } from 'zod';
import { TodoCreateWithoutOwnerInputObjectSchema } from './TodoCreateWithoutOwnerInput.schema';
import { TodoUncheckedCreateWithoutOwnerInputObjectSchema } from './TodoUncheckedCreateWithoutOwnerInput.schema';
import { TodoCreateOrConnectWithoutOwnerInputObjectSchema } from './TodoCreateOrConnectWithoutOwnerInput.schema';
import { TodoCreateManyOwnerInputEnvelopeObjectSchema } from './TodoCreateManyOwnerInputEnvelope.schema';
import { TodoWhereUniqueInputObjectSchema } from './TodoWhereUniqueInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.TodoCreateNestedManyWithoutOwnerInput> = z
  .object({
    create: z
      .union([
        z.lazy(() => TodoCreateWithoutOwnerInputObjectSchema),
        z.lazy(() => TodoCreateWithoutOwnerInputObjectSchema).array(),
        z.lazy(() => TodoUncheckedCreateWithoutOwnerInputObjectSchema),
        z.lazy(() => TodoUncheckedCreateWithoutOwnerInputObjectSchema).array(),
      ])
      .optional(),
    connectOrCreate: z
      .union([
        z.lazy(() => TodoCreateOrConnectWithoutOwnerInputObjectSchema),
        z.lazy(() => TodoCreateOrConnectWithoutOwnerInputObjectSchema).array(),
      ])
      .optional(),
    createMany: z
      .lazy(() => TodoCreateManyOwnerInputEnvelopeObjectSchema)
      .optional(),
    connect: z
      .union([
        z.lazy(() => TodoWhereUniqueInputObjectSchema),
        z.lazy(() => TodoWhereUniqueInputObjectSchema).array(),
      ])
      .optional(),
  })
  .strict();

export const TodoCreateNestedManyWithoutOwnerInputObjectSchema = Schema;
