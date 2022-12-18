import { z } from 'zod';
import { ListSelectObjectSchema } from './objects/ListSelect.schema';
import { ListIncludeObjectSchema } from './objects/ListInclude.schema';
import { ListWhereUniqueInputObjectSchema } from './objects/ListWhereUniqueInput.schema';

export const ListFindUniqueSchema = z.object({
  select: ListSelectObjectSchema.optional(),
  include: ListIncludeObjectSchema.optional(),
  where: ListWhereUniqueInputObjectSchema,
});
