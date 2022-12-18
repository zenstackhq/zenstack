import { z } from 'zod';
import { SpaceUserCreateNestedManyWithoutUserInputObjectSchema } from './SpaceUserCreateNestedManyWithoutUserInput.schema';
import { ListCreateNestedManyWithoutOwnerInputObjectSchema } from './ListCreateNestedManyWithoutOwnerInput.schema';
import { AccountCreateNestedManyWithoutUserInputObjectSchema } from './AccountCreateNestedManyWithoutUserInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.UserCreateWithoutTodosInput> = z
  .object({
    id: z.string().optional(),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
    email: z.string(),
    emailVerified: z.date().optional().nullable(),
    password: z.string().optional().nullable(),
    name: z.string().optional().nullable(),
    spaces: z
      .lazy(() => SpaceUserCreateNestedManyWithoutUserInputObjectSchema)
      .optional(),
    image: z.string().optional().nullable(),
    lists: z
      .lazy(() => ListCreateNestedManyWithoutOwnerInputObjectSchema)
      .optional(),
    accounts: z
      .lazy(() => AccountCreateNestedManyWithoutUserInputObjectSchema)
      .optional(),
    zenstack_guard: z.boolean().optional(),
    zenstack_transaction: z.string().optional().nullable(),
  })
  .strict();

export const UserCreateWithoutTodosInputObjectSchema = Schema;
