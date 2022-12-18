import { z } from 'zod';
import { UserWhereInputObjectSchema } from './objects/UserWhereInput.schema';

export const UserDeleteManySchema = z.object({
  where: UserWhereInputObjectSchema.optional(),
});
