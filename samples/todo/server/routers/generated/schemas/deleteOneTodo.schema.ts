import { z } from 'zod';
import { TodoSelectObjectSchema } from './objects/TodoSelect.schema';
import { TodoIncludeObjectSchema } from './objects/TodoInclude.schema';
import { TodoWhereUniqueInputObjectSchema } from './objects/TodoWhereUniqueInput.schema';

export const TodoDeleteOneSchema = z.object({
  select: TodoSelectObjectSchema.optional(),
  include: TodoIncludeObjectSchema.optional(),
  where: TodoWhereUniqueInputObjectSchema,
});
