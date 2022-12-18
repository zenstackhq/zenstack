import { z } from 'zod';
import { SpaceWhereInputObjectSchema } from './objects/SpaceWhereInput.schema';

export const SpaceDeleteManySchema = z.object({
  where: SpaceWhereInputObjectSchema.optional(),
});
