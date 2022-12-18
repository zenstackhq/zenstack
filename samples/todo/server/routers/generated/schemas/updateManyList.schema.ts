import { z } from 'zod';
import { ListUpdateManyMutationInputObjectSchema } from './objects/ListUpdateManyMutationInput.schema';
import { ListWhereInputObjectSchema } from './objects/ListWhereInput.schema';

export const ListUpdateManySchema = z.object({
  data: ListUpdateManyMutationInputObjectSchema,
  where: ListWhereInputObjectSchema.optional(),
});
