import { z } from 'zod';
import { SpaceUserSelectObjectSchema } from './objects/SpaceUserSelect.schema';
import { SpaceUserIncludeObjectSchema } from './objects/SpaceUserInclude.schema';
import { SpaceUserWhereUniqueInputObjectSchema } from './objects/SpaceUserWhereUniqueInput.schema';
import { SpaceUserWhereInputObjectSchema } from './objects/SpaceUserWhereInput.schema';
import { SpaceUserOrderByWithRelationInputObjectSchema } from './objects/SpaceUserOrderByWithRelationInput.schema';
import { SpaceUserScalarFieldEnumSchema } from './enums/SpaceUserScalarFieldEnum.schema';
import { SpaceUserCreateInputObjectSchema } from './objects/SpaceUserCreateInput.schema';
import { SpaceUserCreateManyInputObjectSchema } from './objects/SpaceUserCreateManyInput.schema';
import { SpaceUserUpdateInputObjectSchema } from './objects/SpaceUserUpdateInput.schema';
import { SpaceUserUpdateManyMutationInputObjectSchema } from './objects/SpaceUserUpdateManyMutationInput.schema';
import { SpaceUserCountAggregateInputObjectSchema } from './objects/SpaceUserCountAggregateInput.schema';
import { SpaceUserMinAggregateInputObjectSchema } from './objects/SpaceUserMinAggregateInput.schema';
import { SpaceUserMaxAggregateInputObjectSchema } from './objects/SpaceUserMaxAggregateInput.schema';
import { SpaceUserOrderByWithAggregationInputObjectSchema } from './objects/SpaceUserOrderByWithAggregationInput.schema';
import { SpaceUserScalarWhereWithAggregatesInputObjectSchema } from './objects/SpaceUserScalarWhereWithAggregatesInput.schema';

export const SpaceUserSchema = {
    findUnique: z.object({
        select: SpaceUserSelectObjectSchema.optional(),
        include: SpaceUserIncludeObjectSchema.optional(),
        where: SpaceUserWhereUniqueInputObjectSchema,
    }),
    findFirst: z.object({
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
    }),
    findMany: z.object({
        select: z.lazy(() => SpaceUserSelectObjectSchema.optional()),
        include: z.lazy(() => SpaceUserIncludeObjectSchema.optional()),
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
    }),
    create: z.object({
        select: SpaceUserSelectObjectSchema.optional(),
        include: SpaceUserIncludeObjectSchema.optional(),
        data: SpaceUserCreateInputObjectSchema,
    }),
    createMany: z.object({ data: SpaceUserCreateManyInputObjectSchema }),
    delete: z.object({
        select: SpaceUserSelectObjectSchema.optional(),
        include: SpaceUserIncludeObjectSchema.optional(),
        where: SpaceUserWhereUniqueInputObjectSchema,
    }),
    deleteMany: z.object({ where: SpaceUserWhereInputObjectSchema.optional() }),
    update: z.object({
        select: SpaceUserSelectObjectSchema.optional(),
        include: SpaceUserIncludeObjectSchema.optional(),
        data: SpaceUserUpdateInputObjectSchema,
        where: SpaceUserWhereUniqueInputObjectSchema,
    }),
    updateMany: z.object({
        data: SpaceUserUpdateManyMutationInputObjectSchema,
        where: SpaceUserWhereInputObjectSchema.optional(),
    }),
    upsert: z.object({
        select: SpaceUserSelectObjectSchema.optional(),
        include: SpaceUserIncludeObjectSchema.optional(),
        where: SpaceUserWhereUniqueInputObjectSchema,
        create: SpaceUserCreateInputObjectSchema,
        update: SpaceUserUpdateInputObjectSchema,
    }),
    aggregate: z.object({
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
        _count: z.union([z.literal(true), SpaceUserCountAggregateInputObjectSchema]).optional(),
        _min: SpaceUserMinAggregateInputObjectSchema.optional(),
        _max: SpaceUserMaxAggregateInputObjectSchema.optional(),
    }),
    groupBy: z.object({
        where: SpaceUserWhereInputObjectSchema.optional(),
        orderBy: z.union([
            SpaceUserOrderByWithAggregationInputObjectSchema,
            SpaceUserOrderByWithAggregationInputObjectSchema.array(),
        ]),
        having: SpaceUserScalarWhereWithAggregatesInputObjectSchema.optional(),
        take: z.number().optional(),
        skip: z.number().optional(),
        by: z.array(SpaceUserScalarFieldEnumSchema),
    }),
};
