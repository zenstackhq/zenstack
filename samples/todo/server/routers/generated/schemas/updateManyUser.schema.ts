import { z } from 'zod';
import { UserUpdateManyMutationInputObjectSchema } from './objects/UserUpdateManyMutationInput.schema';
import { UserWhereInputObjectSchema } from './objects/UserWhereInput.schema';

export const UserUpdateManySchema = z.object({
  data: UserUpdateManyMutationInputObjectSchema,
  where: UserWhereInputObjectSchema.optional(),
});
