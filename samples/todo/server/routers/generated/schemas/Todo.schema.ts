import { z } from 'zod';
import { TodoSelectObjectSchema } from './objects/TodoSelect.schema';
import { TodoIncludeObjectSchema } from './objects/TodoInclude.schema';
import { TodoWhereUniqueInputObjectSchema } from './objects/TodoWhereUniqueInput.schema';
import { TodoWhereInputObjectSchema } from './objects/TodoWhereInput.schema';
import { TodoOrderByWithRelationInputObjectSchema } from './objects/TodoOrderByWithRelationInput.schema';
import { TodoScalarFieldEnumSchema } from './enums/TodoScalarFieldEnum.schema';
import { TodoCreateInputObjectSchema } from './objects/TodoCreateInput.schema';
import { TodoCreateManyInputObjectSchema } from './objects/TodoCreateManyInput.schema';
import { TodoUpdateInputObjectSchema } from './objects/TodoUpdateInput.schema';
import { TodoUpdateManyMutationInputObjectSchema } from './objects/TodoUpdateManyMutationInput.schema';
import { TodoCountAggregateInputObjectSchema } from './objects/TodoCountAggregateInput.schema';
import { TodoMinAggregateInputObjectSchema } from './objects/TodoMinAggregateInput.schema';
import { TodoMaxAggregateInputObjectSchema } from './objects/TodoMaxAggregateInput.schema';
import { TodoOrderByWithAggregationInputObjectSchema } from './objects/TodoOrderByWithAggregationInput.schema';
import { TodoScalarWhereWithAggregatesInputObjectSchema } from './objects/TodoScalarWhereWithAggregatesInput.schema';

export const TodoSchema = {
    findUnique: z.object({
        select: TodoSelectObjectSchema.optional(),
        include: TodoIncludeObjectSchema.optional(),
        where: TodoWhereUniqueInputObjectSchema,
    }),
    findFirst: z.object({
        select: TodoSelectObjectSchema.optional(),
        include: TodoIncludeObjectSchema.optional(),
        where: TodoWhereInputObjectSchema.optional(),
        orderBy: z
            .union([TodoOrderByWithRelationInputObjectSchema, TodoOrderByWithRelationInputObjectSchema.array()])
            .optional(),
        cursor: TodoWhereUniqueInputObjectSchema.optional(),
        take: z.number().optional(),
        skip: z.number().optional(),
        distinct: z.array(TodoScalarFieldEnumSchema).optional(),
    }),
    findMany: z.object({
        select: z.lazy(() => TodoSelectObjectSchema.optional()),
        include: z.lazy(() => TodoIncludeObjectSchema.optional()),
        where: TodoWhereInputObjectSchema.optional(),
        orderBy: z
            .union([TodoOrderByWithRelationInputObjectSchema, TodoOrderByWithRelationInputObjectSchema.array()])
            .optional(),
        cursor: TodoWhereUniqueInputObjectSchema.optional(),
        take: z.number().optional(),
        skip: z.number().optional(),
        distinct: z.array(TodoScalarFieldEnumSchema).optional(),
    }),
    create: z.object({
        select: TodoSelectObjectSchema.optional(),
        include: TodoIncludeObjectSchema.optional(),
        data: TodoCreateInputObjectSchema,
    }),
    createMany: z.object({ data: TodoCreateManyInputObjectSchema }),
    delete: z.object({
        select: TodoSelectObjectSchema.optional(),
        include: TodoIncludeObjectSchema.optional(),
        where: TodoWhereUniqueInputObjectSchema,
    }),
    deleteMany: z.object({ where: TodoWhereInputObjectSchema.optional() }),
    update: z.object({
        select: TodoSelectObjectSchema.optional(),
        include: TodoIncludeObjectSchema.optional(),
        data: TodoUpdateInputObjectSchema,
        where: TodoWhereUniqueInputObjectSchema,
    }),
    updateMany: z.object({
        data: TodoUpdateManyMutationInputObjectSchema,
        where: TodoWhereInputObjectSchema.optional(),
    }),
    upsert: z.object({
        select: TodoSelectObjectSchema.optional(),
        include: TodoIncludeObjectSchema.optional(),
        where: TodoWhereUniqueInputObjectSchema,
        create: TodoCreateInputObjectSchema,
        update: TodoUpdateInputObjectSchema,
    }),
    aggregate: z.object({
        where: TodoWhereInputObjectSchema.optional(),
        orderBy: z
            .union([TodoOrderByWithRelationInputObjectSchema, TodoOrderByWithRelationInputObjectSchema.array()])
            .optional(),
        cursor: TodoWhereUniqueInputObjectSchema.optional(),
        take: z.number().optional(),
        skip: z.number().optional(),
        _count: z.union([z.literal(true), TodoCountAggregateInputObjectSchema]).optional(),
        _min: TodoMinAggregateInputObjectSchema.optional(),
        _max: TodoMaxAggregateInputObjectSchema.optional(),
    }),
    groupBy: z.object({
        where: TodoWhereInputObjectSchema.optional(),
        orderBy: z.union([
            TodoOrderByWithAggregationInputObjectSchema,
            TodoOrderByWithAggregationInputObjectSchema.array(),
        ]),
        having: TodoScalarWhereWithAggregatesInputObjectSchema.optional(),
        take: z.number().optional(),
        skip: z.number().optional(),
        by: z.array(TodoScalarFieldEnumSchema),
    }),
};
