import { z } from 'zod';
import { TodoSelectObjectSchema } from './objects/TodoSelect.schema';
import { TodoIncludeObjectSchema } from './objects/TodoInclude.schema';
import { TodoWhereUniqueInputObjectSchema } from './objects/TodoWhereUniqueInput.schema';
import { TodoCreateInputObjectSchema } from './objects/TodoCreateInput.schema';
import { TodoUpdateInputObjectSchema } from './objects/TodoUpdateInput.schema';

export const TodoUpsertSchema = z.object({
  select: TodoSelectObjectSchema.optional(),
  include: TodoIncludeObjectSchema.optional(),
  where: TodoWhereUniqueInputObjectSchema,
  create: TodoCreateInputObjectSchema,
  update: TodoUpdateInputObjectSchema,
});
