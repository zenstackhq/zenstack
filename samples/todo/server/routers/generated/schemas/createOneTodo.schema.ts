import { z } from 'zod';
import { TodoSelectObjectSchema } from './objects/TodoSelect.schema';
import { TodoIncludeObjectSchema } from './objects/TodoInclude.schema';
import { TodoCreateInputObjectSchema } from './objects/TodoCreateInput.schema';

export const TodoCreateOneSchema = z.object({
  select: TodoSelectObjectSchema.optional(),
  include: TodoIncludeObjectSchema.optional(),
  data: TodoCreateInputObjectSchema,
});
