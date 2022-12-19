import { z } from 'zod';
import { AccountSelectObjectSchema } from './objects/AccountSelect.schema';
import { AccountIncludeObjectSchema } from './objects/AccountInclude.schema';
import { AccountWhereUniqueInputObjectSchema } from './objects/AccountWhereUniqueInput.schema';
import { AccountWhereInputObjectSchema } from './objects/AccountWhereInput.schema';
import { AccountOrderByWithRelationInputObjectSchema } from './objects/AccountOrderByWithRelationInput.schema';
import { AccountScalarFieldEnumSchema } from './enums/AccountScalarFieldEnum.schema';
import { AccountCreateInputObjectSchema } from './objects/AccountCreateInput.schema';
import { AccountCreateManyInputObjectSchema } from './objects/AccountCreateManyInput.schema';
import { AccountUpdateInputObjectSchema } from './objects/AccountUpdateInput.schema';
import { AccountUpdateManyMutationInputObjectSchema } from './objects/AccountUpdateManyMutationInput.schema';
import { AccountCountAggregateInputObjectSchema } from './objects/AccountCountAggregateInput.schema';
import { AccountMinAggregateInputObjectSchema } from './objects/AccountMinAggregateInput.schema';
import { AccountMaxAggregateInputObjectSchema } from './objects/AccountMaxAggregateInput.schema';
import { AccountAvgAggregateInputObjectSchema } from './objects/AccountAvgAggregateInput.schema';
import { AccountSumAggregateInputObjectSchema } from './objects/AccountSumAggregateInput.schema';
import { AccountOrderByWithAggregationInputObjectSchema } from './objects/AccountOrderByWithAggregationInput.schema';
import { AccountScalarWhereWithAggregatesInputObjectSchema } from './objects/AccountScalarWhereWithAggregatesInput.schema';

export const AccountSchema = {
  findUnique: z.object({
    select: AccountSelectObjectSchema.optional(),
    include: AccountIncludeObjectSchema.optional(),
    where: AccountWhereUniqueInputObjectSchema,
  }),
  findFirst: z.object({
    select: AccountSelectObjectSchema.optional(),
    include: AccountIncludeObjectSchema.optional(),
    where: AccountWhereInputObjectSchema.optional(),
    orderBy: z
      .union([
        AccountOrderByWithRelationInputObjectSchema,
        AccountOrderByWithRelationInputObjectSchema.array(),
      ])
      .optional(),
    cursor: AccountWhereUniqueInputObjectSchema.optional(),
    take: z.number().optional(),
    skip: z.number().optional(),
    distinct: z.array(AccountScalarFieldEnumSchema).optional(),
  }),
  findMany: z.object({
    select: z.lazy(() => AccountSelectObjectSchema.optional()),
    include: z.lazy(() => AccountIncludeObjectSchema.optional()),
    where: AccountWhereInputObjectSchema.optional(),
    orderBy: z
      .union([
        AccountOrderByWithRelationInputObjectSchema,
        AccountOrderByWithRelationInputObjectSchema.array(),
      ])
      .optional(),
    cursor: AccountWhereUniqueInputObjectSchema.optional(),
    take: z.number().optional(),
    skip: z.number().optional(),
    distinct: z.array(AccountScalarFieldEnumSchema).optional(),
  }),
  create: z.object({
    select: AccountSelectObjectSchema.optional(),
    include: AccountIncludeObjectSchema.optional(),
    data: AccountCreateInputObjectSchema,
  }),
  createMany: z.object({ data: AccountCreateManyInputObjectSchema }),
  delete: z.object({
    select: AccountSelectObjectSchema.optional(),
    include: AccountIncludeObjectSchema.optional(),
    where: AccountWhereUniqueInputObjectSchema,
  }),
  deleteMany: z.object({ where: AccountWhereInputObjectSchema.optional() }),
  update: z.object({
    select: AccountSelectObjectSchema.optional(),
    include: AccountIncludeObjectSchema.optional(),
    data: AccountUpdateInputObjectSchema,
    where: AccountWhereUniqueInputObjectSchema,
  }),
  updateMany: z.object({
    data: AccountUpdateManyMutationInputObjectSchema,
    where: AccountWhereInputObjectSchema.optional(),
  }),
  upsert: z.object({
    select: AccountSelectObjectSchema.optional(),
    include: AccountIncludeObjectSchema.optional(),
    where: AccountWhereUniqueInputObjectSchema,
    create: AccountCreateInputObjectSchema,
    update: AccountUpdateInputObjectSchema,
  }),
  aggregate: z.object({
    where: AccountWhereInputObjectSchema.optional(),
    orderBy: z
      .union([
        AccountOrderByWithRelationInputObjectSchema,
        AccountOrderByWithRelationInputObjectSchema.array(),
      ])
      .optional(),
    cursor: AccountWhereUniqueInputObjectSchema.optional(),
    take: z.number().optional(),
    skip: z.number().optional(),
    _count: z
      .union([z.literal(true), AccountCountAggregateInputObjectSchema])
      .optional(),
    _min: AccountMinAggregateInputObjectSchema.optional(),
    _max: AccountMaxAggregateInputObjectSchema.optional(),
    _avg: AccountAvgAggregateInputObjectSchema.optional(),
    _sum: AccountSumAggregateInputObjectSchema.optional(),
  }),
  groupBy: z.object({
    where: AccountWhereInputObjectSchema.optional(),
    orderBy: z.union([
      AccountOrderByWithAggregationInputObjectSchema,
      AccountOrderByWithAggregationInputObjectSchema.array(),
    ]),
    having: AccountScalarWhereWithAggregatesInputObjectSchema.optional(),
    take: z.number().optional(),
    skip: z.number().optional(),
    by: z.array(AccountScalarFieldEnumSchema),
  }),
};
