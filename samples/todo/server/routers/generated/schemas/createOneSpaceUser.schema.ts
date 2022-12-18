import { z } from 'zod';
import { SpaceUserSelectObjectSchema } from './objects/SpaceUserSelect.schema';
import { SpaceUserIncludeObjectSchema } from './objects/SpaceUserInclude.schema';
import { SpaceUserCreateInputObjectSchema } from './objects/SpaceUserCreateInput.schema';

export const SpaceUserCreateOneSchema = z.object({
  select: SpaceUserSelectObjectSchema.optional(),
  include: SpaceUserIncludeObjectSchema.optional(),
  data: SpaceUserCreateInputObjectSchema,
});
