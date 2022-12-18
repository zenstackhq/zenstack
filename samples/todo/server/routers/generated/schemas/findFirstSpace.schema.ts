import { z } from 'zod';
import { SpaceSelectObjectSchema } from './objects/SpaceSelect.schema';
import { SpaceIncludeObjectSchema } from './objects/SpaceInclude.schema';
import { SpaceWhereInputObjectSchema } from './objects/SpaceWhereInput.schema';
import { SpaceOrderByWithRelationInputObjectSchema } from './objects/SpaceOrderByWithRelationInput.schema';
import { SpaceWhereUniqueInputObjectSchema } from './objects/SpaceWhereUniqueInput.schema';
import { SpaceScalarFieldEnumSchema } from './enums/SpaceScalarFieldEnum.schema';

export const SpaceFindFirstSchema = z.object({
  select: SpaceSelectObjectSchema.optional(),
  include: SpaceIncludeObjectSchema.optional(),
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
  distinct: z.array(SpaceScalarFieldEnumSchema).optional(),
});
