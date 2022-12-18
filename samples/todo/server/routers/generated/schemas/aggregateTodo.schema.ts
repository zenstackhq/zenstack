import { z } from 'zod';
import { TodoWhereInputObjectSchema } from './objects/TodoWhereInput.schema';
import { TodoOrderByWithRelationInputObjectSchema } from './objects/TodoOrderByWithRelationInput.schema';
import { TodoWhereUniqueInputObjectSchema } from './objects/TodoWhereUniqueInput.schema';
import { TodoCountAggregateInputObjectSchema } from './objects/TodoCountAggregateInput.schema';
import { TodoMinAggregateInputObjectSchema } from './objects/TodoMinAggregateInput.schema';
import { TodoMaxAggregateInputObjectSchema } from './objects/TodoMaxAggregateInput.schema';

export const TodoAggregateSchema = z.object({
  where: TodoWhereInputObjectSchema.optional(),
  orderBy: z
    .union([
      TodoOrderByWithRelationInputObjectSchema,
      TodoOrderByWithRelationInputObjectSchema.array(),
    ])
    .optional(),
  cursor: TodoWhereUniqueInputObjectSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  _count: z
    .union([z.literal(true), TodoCountAggregateInputObjectSchema])
    .optional(),
  _min: TodoMinAggregateInputObjectSchema.optional(),
  _max: TodoMaxAggregateInputObjectSchema.optional(),
});
