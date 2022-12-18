import { z } from 'zod';
import { SpaceWhereInputObjectSchema } from './objects/SpaceWhereInput.schema';
import { SpaceOrderByWithRelationInputObjectSchema } from './objects/SpaceOrderByWithRelationInput.schema';
import { SpaceWhereUniqueInputObjectSchema } from './objects/SpaceWhereUniqueInput.schema';
import { SpaceCountAggregateInputObjectSchema } from './objects/SpaceCountAggregateInput.schema';
import { SpaceMinAggregateInputObjectSchema } from './objects/SpaceMinAggregateInput.schema';
import { SpaceMaxAggregateInputObjectSchema } from './objects/SpaceMaxAggregateInput.schema';

export const SpaceAggregateSchema = z.object({
  where: SpaceWhereInputObjectSchema.optional(),
  orderBy: z
    .union([
      SpaceOrderByWithRelationInputObjectSchema,
      SpaceOrderByWithRelationInputObjectSchema.array(),
    ])
    .optional(),
  cursor: SpaceWhereUniqueInputObjectSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  _count: z
    .union([z.literal(true), SpaceCountAggregateInputObjectSchema])
    .optional(),
  _min: SpaceMinAggregateInputObjectSchema.optional(),
  _max: SpaceMaxAggregateInputObjectSchema.optional(),
});
