import { z } from 'zod';
import { ListSelectObjectSchema } from './objects/ListSelect.schema';
import { ListIncludeObjectSchema } from './objects/ListInclude.schema';
import { ListWhereInputObjectSchema } from './objects/ListWhereInput.schema';
import { ListOrderByWithRelationInputObjectSchema } from './objects/ListOrderByWithRelationInput.schema';
import { ListWhereUniqueInputObjectSchema } from './objects/ListWhereUniqueInput.schema';
import { ListScalarFieldEnumSchema } from './enums/ListScalarFieldEnum.schema';

export const ListFindFirstSchema = z.object({
  select: ListSelectObjectSchema.optional(),
  include: ListIncludeObjectSchema.optional(),
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
  distinct: z.array(ListScalarFieldEnumSchema).optional(),
});
