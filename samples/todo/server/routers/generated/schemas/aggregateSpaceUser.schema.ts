import { z } from 'zod';
import { SpaceUserWhereInputObjectSchema } from './objects/SpaceUserWhereInput.schema';
import { SpaceUserOrderByWithRelationInputObjectSchema } from './objects/SpaceUserOrderByWithRelationInput.schema';
import { SpaceUserWhereUniqueInputObjectSchema } from './objects/SpaceUserWhereUniqueInput.schema';
import { SpaceUserCountAggregateInputObjectSchema } from './objects/SpaceUserCountAggregateInput.schema';
import { SpaceUserMinAggregateInputObjectSchema } from './objects/SpaceUserMinAggregateInput.schema';
import { SpaceUserMaxAggregateInputObjectSchema } from './objects/SpaceUserMaxAggregateInput.schema';

export const SpaceUserAggregateSchema = z.object({
  where: SpaceUserWhereInputObjectSchema.optional(),
  orderBy: z
    .union([
      SpaceUserOrderByWithRelationInputObjectSchema,
      SpaceUserOrderByWithRelationInputObjectSchema.array(),
    ])
    .optional(),
  cursor: SpaceUserWhereUniqueInputObjectSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  _count: z
    .union([z.literal(true), SpaceUserCountAggregateInputObjectSchema])
    .optional(),
  _min: SpaceUserMinAggregateInputObjectSchema.optional(),
  _max: SpaceUserMaxAggregateInputObjectSchema.optional(),
});
