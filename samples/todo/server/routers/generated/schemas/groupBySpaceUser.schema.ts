import { z } from 'zod';
import { SpaceUserWhereInputObjectSchema } from './objects/SpaceUserWhereInput.schema';
import { SpaceUserOrderByWithAggregationInputObjectSchema } from './objects/SpaceUserOrderByWithAggregationInput.schema';
import { SpaceUserScalarWhereWithAggregatesInputObjectSchema } from './objects/SpaceUserScalarWhereWithAggregatesInput.schema';
import { SpaceUserScalarFieldEnumSchema } from './enums/SpaceUserScalarFieldEnum.schema';

export const SpaceUserGroupBySchema = z.object({
  where: SpaceUserWhereInputObjectSchema.optional(),
  orderBy: z.union([
    SpaceUserOrderByWithAggregationInputObjectSchema,
    SpaceUserOrderByWithAggregationInputObjectSchema.array(),
  ]),
  having: SpaceUserScalarWhereWithAggregatesInputObjectSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  by: z.array(SpaceUserScalarFieldEnumSchema),
});
