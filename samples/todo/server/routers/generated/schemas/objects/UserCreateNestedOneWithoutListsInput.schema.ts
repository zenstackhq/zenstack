import { z } from 'zod';
import { UserCreateWithoutListsInputObjectSchema } from './UserCreateWithoutListsInput.schema';
import { UserUncheckedCreateWithoutListsInputObjectSchema } from './UserUncheckedCreateWithoutListsInput.schema';
import { UserCreateOrConnectWithoutListsInputObjectSchema } from './UserCreateOrConnectWithoutListsInput.schema';
import { UserWhereUniqueInputObjectSchema } from './UserWhereUniqueInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.UserCreateNestedOneWithoutListsInput> = z
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
    connect: z.lazy(() => UserWhereUniqueInputObjectSchema).optional(),
  })
  .strict();

export const UserCreateNestedOneWithoutListsInputObjectSchema = Schema;
