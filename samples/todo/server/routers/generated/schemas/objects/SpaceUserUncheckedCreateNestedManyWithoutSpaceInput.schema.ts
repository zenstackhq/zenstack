import { z } from 'zod';
import { SpaceUserCreateWithoutSpaceInputObjectSchema } from './SpaceUserCreateWithoutSpaceInput.schema';
import { SpaceUserUncheckedCreateWithoutSpaceInputObjectSchema } from './SpaceUserUncheckedCreateWithoutSpaceInput.schema';
import { SpaceUserCreateOrConnectWithoutSpaceInputObjectSchema } from './SpaceUserCreateOrConnectWithoutSpaceInput.schema';
import { SpaceUserCreateManySpaceInputEnvelopeObjectSchema } from './SpaceUserCreateManySpaceInputEnvelope.schema';
import { SpaceUserWhereUniqueInputObjectSchema } from './SpaceUserWhereUniqueInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceUserUncheckedCreateNestedManyWithoutSpaceInput> =
  z
    .object({
      create: z
        .union([
          z.lazy(() => SpaceUserCreateWithoutSpaceInputObjectSchema),
          z.lazy(() => SpaceUserCreateWithoutSpaceInputObjectSchema).array(),
          z.lazy(() => SpaceUserUncheckedCreateWithoutSpaceInputObjectSchema),
          z
            .lazy(() => SpaceUserUncheckedCreateWithoutSpaceInputObjectSchema)
            .array(),
        ])
        .optional(),
      connectOrCreate: z
        .union([
          z.lazy(() => SpaceUserCreateOrConnectWithoutSpaceInputObjectSchema),
          z
            .lazy(() => SpaceUserCreateOrConnectWithoutSpaceInputObjectSchema)
            .array(),
        ])
        .optional(),
      createMany: z
        .lazy(() => SpaceUserCreateManySpaceInputEnvelopeObjectSchema)
        .optional(),
      connect: z
        .union([
          z.lazy(() => SpaceUserWhereUniqueInputObjectSchema),
          z.lazy(() => SpaceUserWhereUniqueInputObjectSchema).array(),
        ])
        .optional(),
    })
    .strict();

export const SpaceUserUncheckedCreateNestedManyWithoutSpaceInputObjectSchema =
  Schema;
