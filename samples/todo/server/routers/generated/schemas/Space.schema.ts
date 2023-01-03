import { z } from 'zod';
import { SpaceSelectObjectSchema } from './objects/SpaceSelect.schema';
import { SpaceIncludeObjectSchema } from './objects/SpaceInclude.schema';
import { SpaceWhereUniqueInputObjectSchema } from './objects/SpaceWhereUniqueInput.schema';
import { SpaceWhereInputObjectSchema } from './objects/SpaceWhereInput.schema';
import { SpaceOrderByWithRelationInputObjectSchema } from './objects/SpaceOrderByWithRelationInput.schema';
import { SpaceScalarFieldEnumSchema } from './enums/SpaceScalarFieldEnum.schema';
import { SpaceCreateInputObjectSchema } from './objects/SpaceCreateInput.schema';
import { SpaceCreateManyInputObjectSchema } from './objects/SpaceCreateManyInput.schema';
import { SpaceUpdateInputObjectSchema } from './objects/SpaceUpdateInput.schema';
import { SpaceUpdateManyMutationInputObjectSchema } from './objects/SpaceUpdateManyMutationInput.schema';
import { SpaceCountAggregateInputObjectSchema } from './objects/SpaceCountAggregateInput.schema';
import { SpaceMinAggregateInputObjectSchema } from './objects/SpaceMinAggregateInput.schema';
import { SpaceMaxAggregateInputObjectSchema } from './objects/SpaceMaxAggregateInput.schema';
import { SpaceOrderByWithAggregationInputObjectSchema } from './objects/SpaceOrderByWithAggregationInput.schema';
import { SpaceScalarWhereWithAggregatesInputObjectSchema } from './objects/SpaceScalarWhereWithAggregatesInput.schema';

export const SpaceSchema = {
    findUnique: z.object({
        select: SpaceSelectObjectSchema.optional(),
        include: SpaceIncludeObjectSchema.optional(),
        where: SpaceWhereUniqueInputObjectSchema,
    }),
    findFirst: z.object({
        select: SpaceSelectObjectSchema.optional(),
        include: SpaceIncludeObjectSchema.optional(),
        where: SpaceWhereInputObjectSchema.optional(),
        orderBy: z
            .union([SpaceOrderByWithRelationInputObjectSchema, SpaceOrderByWithRelationInputObjectSchema.array()])
            .optional(),
        cursor: SpaceWhereUniqueInputObjectSchema.optional(),
        take: z.number().optional(),
        skip: z.number().optional(),
        distinct: z.array(SpaceScalarFieldEnumSchema).optional(),
    }),
    findMany: z.object({
        select: z.lazy(() => SpaceSelectObjectSchema.optional()),
        include: z.lazy(() => SpaceIncludeObjectSchema.optional()),
        where: SpaceWhereInputObjectSchema.optional(),
        orderBy: z
            .union([SpaceOrderByWithRelationInputObjectSchema, SpaceOrderByWithRelationInputObjectSchema.array()])
            .optional(),
        cursor: SpaceWhereUniqueInputObjectSchema.optional(),
        take: z.number().optional(),
        skip: z.number().optional(),
        distinct: z.array(SpaceScalarFieldEnumSchema).optional(),
    }),
    create: z.object({
        select: SpaceSelectObjectSchema.optional(),
        include: SpaceIncludeObjectSchema.optional(),
        data: SpaceCreateInputObjectSchema,
    }),
    createMany: z.object({ data: SpaceCreateManyInputObjectSchema }),
    delete: z.object({
        select: SpaceSelectObjectSchema.optional(),
        include: SpaceIncludeObjectSchema.optional(),
        where: SpaceWhereUniqueInputObjectSchema,
    }),
    deleteMany: z.object({ where: SpaceWhereInputObjectSchema.optional() }),
    update: z.object({
        select: SpaceSelectObjectSchema.optional(),
        include: SpaceIncludeObjectSchema.optional(),
        data: SpaceUpdateInputObjectSchema,
        where: SpaceWhereUniqueInputObjectSchema,
    }),
    updateMany: z.object({
        data: SpaceUpdateManyMutationInputObjectSchema,
        where: SpaceWhereInputObjectSchema.optional(),
    }),
    upsert: z.object({
        select: SpaceSelectObjectSchema.optional(),
        include: SpaceIncludeObjectSchema.optional(),
        where: SpaceWhereUniqueInputObjectSchema,
        create: SpaceCreateInputObjectSchema,
        update: SpaceUpdateInputObjectSchema,
    }),
    aggregate: z.object({
        where: SpaceWhereInputObjectSchema.optional(),
        orderBy: z
            .union([SpaceOrderByWithRelationInputObjectSchema, SpaceOrderByWithRelationInputObjectSchema.array()])
            .optional(),
        cursor: SpaceWhereUniqueInputObjectSchema.optional(),
        take: z.number().optional(),
        skip: z.number().optional(),
        _count: z.union([z.literal(true), SpaceCountAggregateInputObjectSchema]).optional(),
        _min: SpaceMinAggregateInputObjectSchema.optional(),
        _max: SpaceMaxAggregateInputObjectSchema.optional(),
    }),
    groupBy: z.object({
        where: SpaceWhereInputObjectSchema.optional(),
        orderBy: z.union([
            SpaceOrderByWithAggregationInputObjectSchema,
            SpaceOrderByWithAggregationInputObjectSchema.array(),
        ]),
        having: SpaceScalarWhereWithAggregatesInputObjectSchema.optional(),
        take: z.number().optional(),
        skip: z.number().optional(),
        by: z.array(SpaceScalarFieldEnumSchema),
    }),
};
