import { z } from 'zod';
import { AccountUpdateManyMutationInputObjectSchema } from './objects/AccountUpdateManyMutationInput.schema';
import { AccountWhereInputObjectSchema } from './objects/AccountWhereInput.schema';

export const AccountUpdateManySchema = z.object({
  data: AccountUpdateManyMutationInputObjectSchema,
  where: AccountWhereInputObjectSchema.optional(),
});
