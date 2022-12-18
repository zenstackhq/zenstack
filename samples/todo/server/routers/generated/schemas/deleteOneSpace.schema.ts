import { z } from 'zod';
import { SpaceSelectObjectSchema } from './objects/SpaceSelect.schema';
import { SpaceIncludeObjectSchema } from './objects/SpaceInclude.schema';
import { SpaceWhereUniqueInputObjectSchema } from './objects/SpaceWhereUniqueInput.schema';

export const SpaceDeleteOneSchema = z.object({
  select: SpaceSelectObjectSchema.optional(),
  include: SpaceIncludeObjectSchema.optional(),
  where: SpaceWhereUniqueInputObjectSchema,
});
