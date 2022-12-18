import { z } from 'zod';
import { SpaceSelectObjectSchema } from './objects/SpaceSelect.schema';
import { SpaceIncludeObjectSchema } from './objects/SpaceInclude.schema';
import { SpaceWhereUniqueInputObjectSchema } from './objects/SpaceWhereUniqueInput.schema';
import { SpaceCreateInputObjectSchema } from './objects/SpaceCreateInput.schema';
import { SpaceUpdateInputObjectSchema } from './objects/SpaceUpdateInput.schema';

export const SpaceUpsertSchema = z.object({
  select: SpaceSelectObjectSchema.optional(),
  include: SpaceIncludeObjectSchema.optional(),
  where: SpaceWhereUniqueInputObjectSchema,
  create: SpaceCreateInputObjectSchema,
  update: SpaceUpdateInputObjectSchema,
});
