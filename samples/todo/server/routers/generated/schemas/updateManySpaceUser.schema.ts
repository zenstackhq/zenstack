import { z } from 'zod';
import { SpaceUserUpdateManyMutationInputObjectSchema } from './objects/SpaceUserUpdateManyMutationInput.schema';
import { SpaceUserWhereInputObjectSchema } from './objects/SpaceUserWhereInput.schema';

export const SpaceUserUpdateManySchema = z.object({
  data: SpaceUserUpdateManyMutationInputObjectSchema,
  where: SpaceUserWhereInputObjectSchema.optional(),
});
