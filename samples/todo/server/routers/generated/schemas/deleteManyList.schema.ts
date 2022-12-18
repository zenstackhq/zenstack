import { z } from 'zod';
import { ListWhereInputObjectSchema } from './objects/ListWhereInput.schema';

export const ListDeleteManySchema = z.object({
  where: ListWhereInputObjectSchema.optional(),
});
