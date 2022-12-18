import { z } from 'zod';
import { SpaceUpdateManyMutationInputObjectSchema } from './objects/SpaceUpdateManyMutationInput.schema';
import { SpaceWhereInputObjectSchema } from './objects/SpaceWhereInput.schema';

export const SpaceUpdateManySchema = z.object({
  data: SpaceUpdateManyMutationInputObjectSchema,
  where: SpaceWhereInputObjectSchema.optional(),
});
