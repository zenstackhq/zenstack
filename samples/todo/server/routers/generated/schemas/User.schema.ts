import { z } from 'zod';
import { UserSelectObjectSchema } from './objects/UserSelect.schema';
import { UserIncludeObjectSchema } from './objects/UserInclude.schema';
import { UserWhereUniqueInputObjectSchema } from './objects/UserWhereUniqueInput.schema';
import { UserWhereInputObjectSchema } from './objects/UserWhereInput.schema';
import { UserOrderByWithRelationInputObjectSchema } from './objects/UserOrderByWithRelationInput.schema';
import { UserScalarFieldEnumSchema } from './enums/UserScalarFieldEnum.schema';
import { UserCreateInputObjectSchema } from './objects/UserCreateInput.schema';
import { UserCreateManyInputObjectSchema } from './objects/UserCreateManyInput.schema';
import { UserUpdateInputObjectSchema } from './objects/UserUpdateInput.schema';
import { UserUpdateManyMutationInputObjectSchema } from './objects/UserUpdateManyMutationInput.schema';
import { UserCountAggregateInputObjectSchema } from './objects/UserCountAggregateInput.schema';
import { UserMinAggregateInputObjectSchema } from './objects/UserMinAggregateInput.schema';
import { UserMaxAggregateInputObjectSchema } from './objects/UserMaxAggregateInput.schema';
import { UserOrderByWithAggregationInputObjectSchema } from './objects/UserOrderByWithAggregationInput.schema';
import { UserScalarWhereWithAggregatesInputObjectSchema } from './objects/UserScalarWhereWithAggregatesInput.schema';

export const UserSchema = {
  findUnique: z.object({
    select: UserSelectObjectSchema.optional(),
    include: UserIncludeObjectSchema.optional(),
    where: UserWhereUniqueInputObjectSchema,
  }),
  findFirst: z.object({
    select: UserSelectObjectSchema.optional(),
    include: UserIncludeObjectSchema.optional(),
    where: UserWhereInputObjectSchema.optional(),
    orderBy: z
      .union([
        UserOrderByWithRelationInputObjectSchema,
        UserOrderByWithRelationInputObjectSchema.array(),
      ])
      .optional(),
    cursor: UserWhereUniqueInputObjectSchema.optional(),
    take: z.number().optional(),
    skip: z.number().optional(),
    distinct: z.array(UserScalarFieldEnumSchema).optional(),
  }),
  findMany: z.object({
    select: z.lazy(() => UserSelectObjectSchema.optional()),
    include: z.lazy(() => UserIncludeObjectSchema.optional()),
    where: UserWhereInputObjectSchema.optional(),
    orderBy: z
      .union([
        UserOrderByWithRelationInputObjectSchema,
        UserOrderByWithRelationInputObjectSchema.array(),
      ])
      .optional(),
    cursor: UserWhereUniqueInputObjectSchema.optional(),
    take: z.number().optional(),
    skip: z.number().optional(),
    distinct: z.array(UserScalarFieldEnumSchema).optional(),
  }),
  create: z.object({
    select: UserSelectObjectSchema.optional(),
    include: UserIncludeObjectSchema.optional(),
    data: UserCreateInputObjectSchema,
  }),
  createMany: z.object({ data: UserCreateManyInputObjectSchema }),
  delete: z.object({
    select: UserSelectObjectSchema.optional(),
    include: UserIncludeObjectSchema.optional(),
    where: UserWhereUniqueInputObjectSchema,
  }),
  deleteMany: z.object({ where: UserWhereInputObjectSchema.optional() }),
  update: z.object({
    select: UserSelectObjectSchema.optional(),
    include: UserIncludeObjectSchema.optional(),
    data: UserUpdateInputObjectSchema,
    where: UserWhereUniqueInputObjectSchema,
  }),
  updateMany: z.object({
    data: UserUpdateManyMutationInputObjectSchema,
    where: UserWhereInputObjectSchema.optional(),
  }),
  upsert: z.object({
    select: UserSelectObjectSchema.optional(),
    include: UserIncludeObjectSchema.optional(),
    where: UserWhereUniqueInputObjectSchema,
    create: UserCreateInputObjectSchema,
    update: UserUpdateInputObjectSchema,
  }),
  aggregate: z.object({
    where: UserWhereInputObjectSchema.optional(),
    orderBy: z
      .union([
        UserOrderByWithRelationInputObjectSchema,
        UserOrderByWithRelationInputObjectSchema.array(),
      ])
      .optional(),
    cursor: UserWhereUniqueInputObjectSchema.optional(),
    take: z.number().optional(),
    skip: z.number().optional(),
    _count: z
      .union([z.literal(true), UserCountAggregateInputObjectSchema])
      .optional(),
    _min: UserMinAggregateInputObjectSchema.optional(),
    _max: UserMaxAggregateInputObjectSchema.optional(),
  }),
  groupBy: z.object({
    where: UserWhereInputObjectSchema.optional(),
    orderBy: z.union([
      UserOrderByWithAggregationInputObjectSchema,
      UserOrderByWithAggregationInputObjectSchema.array(),
    ]),
    having: UserScalarWhereWithAggregatesInputObjectSchema.optional(),
    take: z.number().optional(),
    skip: z.number().optional(),
    by: z.array(UserScalarFieldEnumSchema),
  }),
};
