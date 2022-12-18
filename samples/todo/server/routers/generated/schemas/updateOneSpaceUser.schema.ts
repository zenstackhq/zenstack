import { z } from 'zod';
import { SpaceUserSelectObjectSchema } from './objects/SpaceUserSelect.schema';
import { SpaceUserIncludeObjectSchema } from './objects/SpaceUserInclude.schema';
import { SpaceUserUpdateInputObjectSchema } from './objects/SpaceUserUpdateInput.schema';
import { SpaceUserWhereUniqueInputObjectSchema } from './objects/SpaceUserWhereUniqueInput.schema';

export const SpaceUserUpdateOneSchema = z.object({
  select: SpaceUserSelectObjectSchema.optional(),
  include: SpaceUserIncludeObjectSchema.optional(),
  data: SpaceUserUpdateInputObjectSchema,
  where: SpaceUserWhereUniqueInputObjectSchema,
});
