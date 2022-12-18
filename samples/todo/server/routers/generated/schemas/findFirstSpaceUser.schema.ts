import { z } from 'zod';
import { SpaceUserSelectObjectSchema } from './objects/SpaceUserSelect.schema';
import { SpaceUserIncludeObjectSchema } from './objects/SpaceUserInclude.schema';
import { SpaceUserWhereInputObjectSchema } from './objects/SpaceUserWhereInput.schema';
import { SpaceUserOrderByWithRelationInputObjectSchema } from './objects/SpaceUserOrderByWithRelationInput.schema';
import { SpaceUserWhereUniqueInputObjectSchema } from './objects/SpaceUserWhereUniqueInput.schema';
import { SpaceUserScalarFieldEnumSchema } from './enums/SpaceUserScalarFieldEnum.schema';

export const SpaceUserFindFirstSchema = z.object({
  select: SpaceUserSelectObjectSchema.optional(),
  include: SpaceUserIncludeObjectSchema.optional(),
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
  distinct: z.array(SpaceUserScalarFieldEnumSchema).optional(),
});
