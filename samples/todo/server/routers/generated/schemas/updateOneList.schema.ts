import { z } from 'zod';
import { ListSelectObjectSchema } from './objects/ListSelect.schema';
import { ListIncludeObjectSchema } from './objects/ListInclude.schema';
import { ListUpdateInputObjectSchema } from './objects/ListUpdateInput.schema';
import { ListWhereUniqueInputObjectSchema } from './objects/ListWhereUniqueInput.schema';

export const ListUpdateOneSchema = z.object({
  select: ListSelectObjectSchema.optional(),
  include: ListIncludeObjectSchema.optional(),
  data: ListUpdateInputObjectSchema,
  where: ListWhereUniqueInputObjectSchema,
});
