import { z } from 'zod';
import { ListWhereInputObjectSchema } from './objects/ListWhereInput.schema';
import { ListOrderByWithRelationInputObjectSchema } from './objects/ListOrderByWithRelationInput.schema';
import { ListWhereUniqueInputObjectSchema } from './objects/ListWhereUniqueInput.schema';
import { ListCountAggregateInputObjectSchema } from './objects/ListCountAggregateInput.schema';
import { ListMinAggregateInputObjectSchema } from './objects/ListMinAggregateInput.schema';
import { ListMaxAggregateInputObjectSchema } from './objects/ListMaxAggregateInput.schema';

export const ListAggregateSchema = z.object({
  where: ListWhereInputObjectSchema.optional(),
  orderBy: z
    .union([
      ListOrderByWithRelationInputObjectSchema,
      ListOrderByWithRelationInputObjectSchema.array(),
    ])
    .optional(),
  cursor: ListWhereUniqueInputObjectSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  _count: z
    .union([z.literal(true), ListCountAggregateInputObjectSchema])
    .optional(),
  _min: ListMinAggregateInputObjectSchema.optional(),
  _max: ListMaxAggregateInputObjectSchema.optional(),
});
