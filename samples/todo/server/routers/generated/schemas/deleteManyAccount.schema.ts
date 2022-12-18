import { z } from 'zod';
import { AccountWhereInputObjectSchema } from './objects/AccountWhereInput.schema';

export const AccountDeleteManySchema = z.object({
  where: AccountWhereInputObjectSchema.optional(),
});
