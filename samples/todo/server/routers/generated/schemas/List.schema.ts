import { z } from 'zod';
import { ListSelectObjectSchema } from './objects/ListSelect.schema';
import { ListIncludeObjectSchema } from './objects/ListInclude.schema';
import { ListWhereUniqueInputObjectSchema } from './objects/ListWhereUniqueInput.schema';
import { ListWhereInputObjectSchema } from './objects/ListWhereInput.schema';
import { ListOrderByWithRelationInputObjectSchema } from './objects/ListOrderByWithRelationInput.schema';
import { ListScalarFieldEnumSchema } from './enums/ListScalarFieldEnum.schema';
import { ListCreateInputObjectSchema } from './objects/ListCreateInput.schema';
import { ListCreateManyInputObjectSchema } from './objects/ListCreateManyInput.schema';
import { ListUpdateInputObjectSchema } from './objects/ListUpdateInput.schema';
import { ListUpdateManyMutationInputObjectSchema } from './objects/ListUpdateManyMutationInput.schema';
import { ListCountAggregateInputObjectSchema } from './objects/ListCountAggregateInput.schema';
import { ListMinAggregateInputObjectSchema } from './objects/ListMinAggregateInput.schema';
import { ListMaxAggregateInputObjectSchema } from './objects/ListMaxAggregateInput.schema';
import { ListOrderByWithAggregationInputObjectSchema } from './objects/ListOrderByWithAggregationInput.schema';
import { ListScalarWhereWithAggregatesInputObjectSchema } from './objects/ListScalarWhereWithAggregatesInput.schema';

export const ListSchema = {
  findUnique: z.object({
    select: ListSelectObjectSchema.optional(),
    include: ListIncludeObjectSchema.optional(),
    where: ListWhereUniqueInputObjectSchema,
  }),
  findFirst: z.object({
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
  }),
  findMany: z.object({
    select: z.lazy(() => ListSelectObjectSchema.optional()),
    include: z.lazy(() => ListIncludeObjectSchema.optional()),
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
  }),
  create: z.object({
    select: ListSelectObjectSchema.optional(),
    include: ListIncludeObjectSchema.optional(),
    data: ListCreateInputObjectSchema,
  }),
  createMany: z.object({ data: ListCreateManyInputObjectSchema }),
  delete: z.object({
    select: ListSelectObjectSchema.optional(),
    include: ListIncludeObjectSchema.optional(),
    where: ListWhereUniqueInputObjectSchema,
  }),
  deleteMany: z.object({ where: ListWhereInputObjectSchema.optional() }),
  update: z.object({
    select: ListSelectObjectSchema.optional(),
    include: ListIncludeObjectSchema.optional(),
    data: ListUpdateInputObjectSchema,
    where: ListWhereUniqueInputObjectSchema,
  }),
  updateMany: z.object({
    data: ListUpdateManyMutationInputObjectSchema,
    where: ListWhereInputObjectSchema.optional(),
  }),
  upsert: z.object({
    select: ListSelectObjectSchema.optional(),
    include: ListIncludeObjectSchema.optional(),
    where: ListWhereUniqueInputObjectSchema,
    create: ListCreateInputObjectSchema,
    update: ListUpdateInputObjectSchema,
  }),
  aggregate: z.object({
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
    _count: z
      .union([z.literal(true), ListCountAggregateInputObjectSchema])
      .optional(),
    _min: ListMinAggregateInputObjectSchema.optional(),
    _max: ListMaxAggregateInputObjectSchema.optional(),
  }),
  groupBy: z.object({
    where: ListWhereInputObjectSchema.optional(),
    orderBy: z.union([
      ListOrderByWithAggregationInputObjectSchema,
      ListOrderByWithAggregationInputObjectSchema.array(),
    ]),
    having: ListScalarWhereWithAggregatesInputObjectSchema.optional(),
    take: z.number().optional(),
    skip: z.number().optional(),
    by: z.array(ListScalarFieldEnumSchema),
  }),
};
