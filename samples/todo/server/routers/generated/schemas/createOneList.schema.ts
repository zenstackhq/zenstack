import { z } from 'zod';
import { ListSelectObjectSchema } from './objects/ListSelect.schema';
import { ListIncludeObjectSchema } from './objects/ListInclude.schema';
import { ListCreateInputObjectSchema } from './objects/ListCreateInput.schema';

export const ListCreateOneSchema = z.object({
  select: ListSelectObjectSchema.optional(),
  include: ListIncludeObjectSchema.optional(),
  data: ListCreateInputObjectSchema,
});
