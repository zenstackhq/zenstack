import { z } from 'zod';
import { TodoWhereInputObjectSchema } from './objects/TodoWhereInput.schema';

export const TodoDeleteManySchema = z.object({
  where: TodoWhereInputObjectSchema.optional(),
});
