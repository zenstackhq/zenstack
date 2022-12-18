import { z } from 'zod';
import { SpaceUserCreateManyInputObjectSchema } from './objects/SpaceUserCreateManyInput.schema';

export const SpaceUserCreateManySchema = z.object({
  data: SpaceUserCreateManyInputObjectSchema,
});
