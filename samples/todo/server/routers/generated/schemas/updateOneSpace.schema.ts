import { z } from 'zod';
import { SpaceSelectObjectSchema } from './objects/SpaceSelect.schema';
import { SpaceIncludeObjectSchema } from './objects/SpaceInclude.schema';
import { SpaceUpdateInputObjectSchema } from './objects/SpaceUpdateInput.schema';
import { SpaceWhereUniqueInputObjectSchema } from './objects/SpaceWhereUniqueInput.schema';

export const SpaceUpdateOneSchema = z.object({
  select: SpaceSelectObjectSchema.optional(),
  include: SpaceIncludeObjectSchema.optional(),
  data: SpaceUpdateInputObjectSchema,
  where: SpaceWhereUniqueInputObjectSchema,
});
