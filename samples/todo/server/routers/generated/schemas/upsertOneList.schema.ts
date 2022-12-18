import { z } from 'zod';
import { ListSelectObjectSchema } from './objects/ListSelect.schema';
import { ListIncludeObjectSchema } from './objects/ListInclude.schema';
import { ListWhereUniqueInputObjectSchema } from './objects/ListWhereUniqueInput.schema';
import { ListCreateInputObjectSchema } from './objects/ListCreateInput.schema';
import { ListUpdateInputObjectSchema } from './objects/ListUpdateInput.schema';

export const ListUpsertSchema = z.object({
  select: ListSelectObjectSchema.optional(),
  include: ListIncludeObjectSchema.optional(),
  where: ListWhereUniqueInputObjectSchema,
  create: ListCreateInputObjectSchema,
  update: ListUpdateInputObjectSchema,
});
