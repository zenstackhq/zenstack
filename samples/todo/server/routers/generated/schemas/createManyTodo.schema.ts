import { z } from 'zod';
import { TodoCreateManyInputObjectSchema } from './objects/TodoCreateManyInput.schema';

export const TodoCreateManySchema = z.object({
  data: TodoCreateManyInputObjectSchema,
});
