import { z } from 'zod';
import { SpaceUserSelectObjectSchema } from './objects/SpaceUserSelect.schema';
import { SpaceUserIncludeObjectSchema } from './objects/SpaceUserInclude.schema';
import { SpaceUserWhereUniqueInputObjectSchema } from './objects/SpaceUserWhereUniqueInput.schema';

export const SpaceUserFindUniqueSchema = z.object({
  select: SpaceUserSelectObjectSchema.optional(),
  include: SpaceUserIncludeObjectSchema.optional(),
  where: SpaceUserWhereUniqueInputObjectSchema,
});
