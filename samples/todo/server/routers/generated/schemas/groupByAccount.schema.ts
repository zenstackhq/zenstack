import { z } from 'zod';
import { AccountWhereInputObjectSchema } from './objects/AccountWhereInput.schema';
import { AccountOrderByWithAggregationInputObjectSchema } from './objects/AccountOrderByWithAggregationInput.schema';
import { AccountScalarWhereWithAggregatesInputObjectSchema } from './objects/AccountScalarWhereWithAggregatesInput.schema';
import { AccountScalarFieldEnumSchema } from './enums/AccountScalarFieldEnum.schema';

export const AccountGroupBySchema = z.object({
  where: AccountWhereInputObjectSchema.optional(),
  orderBy: z.union([
    AccountOrderByWithAggregationInputObjectSchema,
    AccountOrderByWithAggregationInputObjectSchema.array(),
  ]),
  having: AccountScalarWhereWithAggregatesInputObjectSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  by: z.array(AccountScalarFieldEnumSchema),
});
