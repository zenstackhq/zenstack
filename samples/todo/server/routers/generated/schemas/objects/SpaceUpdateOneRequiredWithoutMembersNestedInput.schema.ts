import { z } from 'zod';
import { SpaceCreateWithoutMembersInputObjectSchema } from './SpaceCreateWithoutMembersInput.schema';
import { SpaceUncheckedCreateWithoutMembersInputObjectSchema } from './SpaceUncheckedCreateWithoutMembersInput.schema';
import { SpaceCreateOrConnectWithoutMembersInputObjectSchema } from './SpaceCreateOrConnectWithoutMembersInput.schema';
import { SpaceUpsertWithoutMembersInputObjectSchema } from './SpaceUpsertWithoutMembersInput.schema';
import { SpaceWhereUniqueInputObjectSchema } from './SpaceWhereUniqueInput.schema';
import { SpaceUpdateWithoutMembersInputObjectSchema } from './SpaceUpdateWithoutMembersInput.schema';
import { SpaceUncheckedUpdateWithoutMembersInputObjectSchema } from './SpaceUncheckedUpdateWithoutMembersInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceUpdateOneRequiredWithoutMembersNestedInput> =
  z
    .object({
      create: z
        .union([
          z.lazy(() => SpaceCreateWithoutMembersInputObjectSchema),
          z.lazy(() => SpaceUncheckedCreateWithoutMembersInputObjectSchema),
        ])
        .optional(),
      connectOrCreate: z
        .lazy(() => SpaceCreateOrConnectWithoutMembersInputObjectSchema)
        .optional(),
      upsert: z
        .lazy(() => SpaceUpsertWithoutMembersInputObjectSchema)
        .optional(),
      connect: z.lazy(() => SpaceWhereUniqueInputObjectSchema).optional(),
      update: z
        .union([
          z.lazy(() => SpaceUpdateWithoutMembersInputObjectSchema),
          z.lazy(() => SpaceUncheckedUpdateWithoutMembersInputObjectSchema),
        ])
        .optional(),
    })
    .strict();

export const SpaceUpdateOneRequiredWithoutMembersNestedInputObjectSchema =
  Schema;
