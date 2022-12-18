import { z } from 'zod';
import { TodoWhereInputObjectSchema } from './objects/TodoWhereInput.schema';
import { TodoOrderByWithAggregationInputObjectSchema } from './objects/TodoOrderByWithAggregationInput.schema';
import { TodoScalarWhereWithAggregatesInputObjectSchema } from './objects/TodoScalarWhereWithAggregatesInput.schema';
import { TodoScalarFieldEnumSchema } from './enums/TodoScalarFieldEnum.schema';

export const TodoGroupBySchema = z.object({
  where: TodoWhereInputObjectSchema.optional(),
  orderBy: z.union([
    TodoOrderByWithAggregationInputObjectSchema,
    TodoOrderByWithAggregationInputObjectSchema.array(),
  ]),
  having: TodoScalarWhereWithAggregatesInputObjectSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  by: z.array(TodoScalarFieldEnumSchema),
});
