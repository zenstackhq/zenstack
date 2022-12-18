import { z } from 'zod';
import { SpaceUserFindManySchema } from '../findManySpaceUser.schema';
import { ListFindManySchema } from '../findManyList.schema';
import { TodoFindManySchema } from '../findManyTodo.schema';
import { AccountFindManySchema } from '../findManyAccount.schema';
import { UserCountOutputTypeArgsObjectSchema } from './UserCountOutputTypeArgs.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.UserSelect> = z
  .object({
    id: z.boolean().optional(),
    createdAt: z.boolean().optional(),
    updatedAt: z.boolean().optional(),
    email: z.boolean().optional(),
    emailVerified: z.boolean().optional(),
    password: z.boolean().optional(),
    name: z.boolean().optional(),
    spaces: z
      .union([z.boolean(), z.lazy(() => SpaceUserFindManySchema)])
      .optional(),
    image: z.boolean().optional(),
    lists: z.union([z.boolean(), z.lazy(() => ListFindManySchema)]).optional(),
    todos: z.union([z.boolean(), z.lazy(() => TodoFindManySchema)]).optional(),
    accounts: z
      .union([z.boolean(), z.lazy(() => AccountFindManySchema)])
      .optional(),
    zenstack_guard: z.boolean().optional(),
    zenstack_transaction: z.boolean().optional(),
    _count: z
      .union([z.boolean(), z.lazy(() => UserCountOutputTypeArgsObjectSchema)])
      .optional(),
  })
  .strict();

export const UserSelectObjectSchema = Schema;
