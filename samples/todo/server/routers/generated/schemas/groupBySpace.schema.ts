import { z } from 'zod';
import { SpaceWhereInputObjectSchema } from './objects/SpaceWhereInput.schema';
import { SpaceOrderByWithAggregationInputObjectSchema } from './objects/SpaceOrderByWithAggregationInput.schema';
import { SpaceScalarWhereWithAggregatesInputObjectSchema } from './objects/SpaceScalarWhereWithAggregatesInput.schema';
import { SpaceScalarFieldEnumSchema } from './enums/SpaceScalarFieldEnum.schema';

export const SpaceGroupBySchema = z.object({
  where: SpaceWhereInputObjectSchema.optional(),
  orderBy: z.union([
    SpaceOrderByWithAggregationInputObjectSchema,
    SpaceOrderByWithAggregationInputObjectSchema.array(),
  ]),
  having: SpaceScalarWhereWithAggregatesInputObjectSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  by: z.array(SpaceScalarFieldEnumSchema),
});
