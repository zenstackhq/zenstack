import { z } from 'zod';
import { AccountSelectObjectSchema } from './objects/AccountSelect.schema';
import { AccountIncludeObjectSchema } from './objects/AccountInclude.schema';
import { AccountWhereUniqueInputObjectSchema } from './objects/AccountWhereUniqueInput.schema';
import { AccountCreateInputObjectSchema } from './objects/AccountCreateInput.schema';
import { AccountUpdateInputObjectSchema } from './objects/AccountUpdateInput.schema';

export const AccountUpsertSchema = z.object({
  select: AccountSelectObjectSchema.optional(),
  include: AccountIncludeObjectSchema.optional(),
  where: AccountWhereUniqueInputObjectSchema,
  create: AccountCreateInputObjectSchema,
  update: AccountUpdateInputObjectSchema,
});
