import { z } from 'zod';
import { SpaceUserWhereInputObjectSchema } from './objects/SpaceUserWhereInput.schema';

export const SpaceUserDeleteManySchema = z.object({
  where: SpaceUserWhereInputObjectSchema.optional(),
});
