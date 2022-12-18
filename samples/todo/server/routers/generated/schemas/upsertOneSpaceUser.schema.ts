import { z } from 'zod';
import { SpaceUserSelectObjectSchema } from './objects/SpaceUserSelect.schema';
import { SpaceUserIncludeObjectSchema } from './objects/SpaceUserInclude.schema';
import { SpaceUserWhereUniqueInputObjectSchema } from './objects/SpaceUserWhereUniqueInput.schema';
import { SpaceUserCreateInputObjectSchema } from './objects/SpaceUserCreateInput.schema';
import { SpaceUserUpdateInputObjectSchema } from './objects/SpaceUserUpdateInput.schema';

export const SpaceUserUpsertSchema = z.object({
  select: SpaceUserSelectObjectSchema.optional(),
  include: SpaceUserIncludeObjectSchema.optional(),
  where: SpaceUserWhereUniqueInputObjectSchema,
  create: SpaceUserCreateInputObjectSchema,
  update: SpaceUserUpdateInputObjectSchema,
});
