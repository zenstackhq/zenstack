import { z } from 'zod';
import { SpaceCreateManyInputObjectSchema } from './objects/SpaceCreateManyInput.schema';

export const SpaceCreateManySchema = z.object({
  data: SpaceCreateManyInputObjectSchema,
});
