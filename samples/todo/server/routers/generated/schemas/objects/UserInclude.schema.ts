import { z } from 'zod';
import { SpaceUserFindManySchema } from '../findManySpaceUser.schema';
import { ListFindManySchema } from '../findManyList.schema';
import { TodoFindManySchema } from '../findManyTodo.schema';
import { AccountFindManySchema } from '../findManyAccount.schema';
import { UserCountOutputTypeArgsObjectSchema } from './UserCountOutputTypeArgs.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.UserInclude> = z
  .object({
    spaces: z
      .union([z.boolean(), z.lazy(() => SpaceUserFindManySchema)])
      .optional(),
    lists: z.union([z.boolean(), z.lazy(() => ListFindManySchema)]).optional(),
    todos: z.union([z.boolean(), z.lazy(() => TodoFindManySchema)]).optional(),
    accounts: z
      .union([z.boolean(), z.lazy(() => AccountFindManySchema)])
      .optional(),
    _count: z
      .union([z.boolean(), z.lazy(() => UserCountOutputTypeArgsObjectSchema)])
      .optional(),
  })
  .strict();

export const UserIncludeObjectSchema = Schema;
