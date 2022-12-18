import { z } from 'zod';
import { SpaceUserCreateWithoutUserInputObjectSchema } from './SpaceUserCreateWithoutUserInput.schema';
import { SpaceUserUncheckedCreateWithoutUserInputObjectSchema } from './SpaceUserUncheckedCreateWithoutUserInput.schema';
import { SpaceUserCreateOrConnectWithoutUserInputObjectSchema } from './SpaceUserCreateOrConnectWithoutUserInput.schema';
import { SpaceUserUpsertWithWhereUniqueWithoutUserInputObjectSchema } from './SpaceUserUpsertWithWhereUniqueWithoutUserInput.schema';
import { SpaceUserCreateManyUserInputEnvelopeObjectSchema } from './SpaceUserCreateManyUserInputEnvelope.schema';
import { SpaceUserWhereUniqueInputObjectSchema } from './SpaceUserWhereUniqueInput.schema';
import { SpaceUserUpdateWithWhereUniqueWithoutUserInputObjectSchema } from './SpaceUserUpdateWithWhereUniqueWithoutUserInput.schema';
import { SpaceUserUpdateManyWithWhereWithoutUserInputObjectSchema } from './SpaceUserUpdateManyWithWhereWithoutUserInput.schema';
import { SpaceUserScalarWhereInputObjectSchema } from './SpaceUserScalarWhereInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceUserUpdateManyWithoutUserNestedInput> = z
  .object({
    create: z
      .union([
        z.lazy(() => SpaceUserCreateWithoutUserInputObjectSchema),
        z.lazy(() => SpaceUserCreateWithoutUserInputObjectSchema).array(),
        z.lazy(() => SpaceUserUncheckedCreateWithoutUserInputObjectSchema),
        z
          .lazy(() => SpaceUserUncheckedCreateWithoutUserInputObjectSchema)
          .array(),
      ])
      .optional(),
    connectOrCreate: z
      .union([
        z.lazy(() => SpaceUserCreateOrConnectWithoutUserInputObjectSchema),
        z
          .lazy(() => SpaceUserCreateOrConnectWithoutUserInputObjectSchema)
          .array(),
      ])
      .optional(),
    upsert: z
      .union([
        z.lazy(
          () => SpaceUserUpsertWithWhereUniqueWithoutUserInputObjectSchema,
        ),
        z
          .lazy(
            () => SpaceUserUpsertWithWhereUniqueWithoutUserInputObjectSchema,
          )
          .array(),
      ])
      .optional(),
    createMany: z
      .lazy(() => SpaceUserCreateManyUserInputEnvelopeObjectSchema)
      .optional(),
    set: z
      .union([
        z.lazy(() => SpaceUserWhereUniqueInputObjectSchema),
        z.lazy(() => SpaceUserWhereUniqueInputObjectSchema).array(),
      ])
      .optional(),
    disconnect: z
      .union([
        z.lazy(() => SpaceUserWhereUniqueInputObjectSchema),
        z.lazy(() => SpaceUserWhereUniqueInputObjectSchema).array(),
      ])
      .optional(),
    delete: z
      .union([
        z.lazy(() => SpaceUserWhereUniqueInputObjectSchema),
        z.lazy(() => SpaceUserWhereUniqueInputObjectSchema).array(),
      ])
      .optional(),
    connect: z
      .union([
        z.lazy(() => SpaceUserWhereUniqueInputObjectSchema),
        z.lazy(() => SpaceUserWhereUniqueInputObjectSchema).array(),
      ])
      .optional(),
    update: z
      .union([
        z.lazy(
          () => SpaceUserUpdateWithWhereUniqueWithoutUserInputObjectSchema,
        ),
        z
          .lazy(
            () => SpaceUserUpdateWithWhereUniqueWithoutUserInputObjectSchema,
          )
          .array(),
      ])
      .optional(),
    updateMany: z
      .union([
        z.lazy(() => SpaceUserUpdateManyWithWhereWithoutUserInputObjectSchema),
        z
          .lazy(() => SpaceUserUpdateManyWithWhereWithoutUserInputObjectSchema)
          .array(),
      ])
      .optional(),
    deleteMany: z
      .union([
        z.lazy(() => SpaceUserScalarWhereInputObjectSchema),
        z.lazy(() => SpaceUserScalarWhereInputObjectSchema).array(),
      ])
      .optional(),
  })
  .strict();

export const SpaceUserUpdateManyWithoutUserNestedInputObjectSchema = Schema;
