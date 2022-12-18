import { z } from 'zod';
import { TodoUpdateManyMutationInputObjectSchema } from './objects/TodoUpdateManyMutationInput.schema';
import { TodoWhereInputObjectSchema } from './objects/TodoWhereInput.schema';

export const TodoUpdateManySchema = z.object({
  data: TodoUpdateManyMutationInputObjectSchema,
  where: TodoWhereInputObjectSchema.optional(),
});
