import { z } from 'zod';
import { TodoSelectObjectSchema } from './objects/TodoSelect.schema';
import { TodoIncludeObjectSchema } from './objects/TodoInclude.schema';
import { TodoUpdateInputObjectSchema } from './objects/TodoUpdateInput.schema';
import { TodoWhereUniqueInputObjectSchema } from './objects/TodoWhereUniqueInput.schema';

export const TodoUpdateOneSchema = z.object({
  select: TodoSelectObjectSchema.optional(),
  include: TodoIncludeObjectSchema.optional(),
  data: TodoUpdateInputObjectSchema,
  where: TodoWhereUniqueInputObjectSchema,
});
