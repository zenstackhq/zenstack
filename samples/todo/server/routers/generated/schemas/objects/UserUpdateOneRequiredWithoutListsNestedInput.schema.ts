import { z } from 'zod';
import { UserCreateWithoutListsInputObjectSchema } from './UserCreateWithoutListsInput.schema';
import { UserUncheckedCreateWithoutListsInputObjectSchema } from './UserUncheckedCreateWithoutListsInput.schema';
import { UserCreateOrConnectWithoutListsInputObjectSchema } from './UserCreateOrConnectWithoutListsInput.schema';
import { UserUpsertWithoutListsInputObjectSchema } from './UserUpsertWithoutListsInput.schema';
import { UserWhereUniqueInputObjectSchema } from './UserWhereUniqueInput.schema';
import { UserUpdateWithoutListsInputObjectSchema } from './UserUpdateWithoutListsInput.schema';
import { UserUncheckedUpdateWithoutListsInputObjectSchema } from './UserUncheckedUpdateWithoutListsInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.UserUpdateOneRequiredWithoutListsNestedInput> = z
  .object({
    create: z
      .union([
        z.lazy(() => UserCreateWithoutListsInputObjectSchema),
        z.lazy(() => UserUncheckedCreateWithoutListsInputObjectSchema),
      ])
      .optional(),
    connectOrCreate: z
      .lazy(() => UserCreateOrConnectWithoutListsInputObjectSchema)
      .optional(),
    upsert: z.lazy(() => UserUpsertWithoutListsInputObjectSchema).optional(),
    connect: z.lazy(() => UserWhereUniqueInputObjectSchema).optional(),
    update: z
      .union([
        z.lazy(() => UserUpdateWithoutListsInputObjectSchema),
        z.lazy(() => UserUncheckedUpdateWithoutListsInputObjectSchema),
      ])
      .optional(),
  })
  .strict();

export const UserUpdateOneRequiredWithoutListsNestedInputObjectSchema = Schema;
