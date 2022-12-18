import { z } from 'zod';
import { ListWhereInputObjectSchema } from './objects/ListWhereInput.schema';
import { ListOrderByWithAggregationInputObjectSchema } from './objects/ListOrderByWithAggregationInput.schema';
import { ListScalarWhereWithAggregatesInputObjectSchema } from './objects/ListScalarWhereWithAggregatesInput.schema';
import { ListScalarFieldEnumSchema } from './enums/ListScalarFieldEnum.schema';

export const ListGroupBySchema = z.object({
  where: ListWhereInputObjectSchema.optional(),
  orderBy: z.union([
    ListOrderByWithAggregationInputObjectSchema,
    ListOrderByWithAggregationInputObjectSchema.array(),
  ]),
  having: ListScalarWhereWithAggregatesInputObjectSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  by: z.array(ListScalarFieldEnumSchema),
});
