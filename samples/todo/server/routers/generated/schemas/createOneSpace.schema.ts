import { z } from 'zod';
import { SpaceSelectObjectSchema } from './objects/SpaceSelect.schema';
import { SpaceIncludeObjectSchema } from './objects/SpaceInclude.schema';
import { SpaceCreateInputObjectSchema } from './objects/SpaceCreateInput.schema';

export const SpaceCreateOneSchema = z.object({
  select: SpaceSelectObjectSchema.optional(),
  include: SpaceIncludeObjectSchema.optional(),
  data: SpaceCreateInputObjectSchema,
});
