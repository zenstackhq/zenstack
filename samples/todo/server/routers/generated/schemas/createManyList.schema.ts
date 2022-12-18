import { z } from 'zod';
import { ListCreateManyInputObjectSchema } from './objects/ListCreateManyInput.schema';

export const ListCreateManySchema = z.object({
  data: ListCreateManyInputObjectSchema,
});
