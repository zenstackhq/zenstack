import { z } from 'zod';
import { TodoSelectObjectSchema } from './objects/TodoSelect.schema';
import { TodoIncludeObjectSchema } from './objects/TodoInclude.schema';
import { TodoWhereInputObjectSchema } from './objects/TodoWhereInput.schema';
import { TodoOrderByWithRelationInputObjectSchema } from './objects/TodoOrderByWithRelationInput.schema';
import { TodoWhereUniqueInputObjectSchema } from './objects/TodoWhereUniqueInput.schema';
import { TodoScalarFieldEnumSchema } from './enums/TodoScalarFieldEnum.schema';

export const TodoFindManySchema = z.object({
  select: z.lazy(() => TodoSelectObjectSchema.optional()),
  include: z.lazy(() => TodoIncludeObjectSchema.optional()),
  where: TodoWhereInputObjectSchema.optional(),
  orderBy: z
    .union([
      TodoOrderByWithRelationInputObjectSchema,
      TodoOrderByWithRelationInputObjectSchema.array(),
    ])
    .optional(),
  cursor: TodoWhereUniqueInputObjectSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.array(TodoScalarFieldEnumSchema).optional(),
});
