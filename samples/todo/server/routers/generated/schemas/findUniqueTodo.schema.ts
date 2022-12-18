import { z } from 'zod';
import { TodoSelectObjectSchema } from './objects/TodoSelect.schema';
import { TodoIncludeObjectSchema } from './objects/TodoInclude.schema';
import { TodoWhereUniqueInputObjectSchema } from './objects/TodoWhereUniqueInput.schema';

export const TodoFindUniqueSchema = z.object({
  select: TodoSelectObjectSchema.optional(),
  include: TodoIncludeObjectSchema.optional(),
  where: TodoWhereUniqueInputObjectSchema,
});
