/* eslint-disable */
import { db } from ".";
import { createTRPCRouter } from "../../generated-router-helper";
import { procedure } from "../../generated-router-helper";
import * as _Schema from '@zenstackhq/runtime/zod/input';
const $Schema: typeof _Schema = (_Schema as any).default ?? _Schema;
import { checkRead, checkMutate } from '../helper';

export default function createRouter() {
    return createTRPCRouter({

        aggregate: procedure.input($Schema.PostInputSchema.aggregate).query(({ ctx, input }) => checkRead(db(ctx).post.aggregate(input as any))),

        createMany: procedure.input($Schema.PostInputSchema.createMany.optional()).mutation(async ({ ctx, input }) => checkMutate(db(ctx).post.createMany(input as any))),

        create: procedure.input($Schema.PostInputSchema.create).mutation(async ({ ctx, input }) => checkMutate(db(ctx).post.create(input as any))),

        deleteMany: procedure.input($Schema.PostInputSchema.deleteMany.optional()).mutation(async ({ ctx, input }) => checkMutate(db(ctx).post.deleteMany(input as any))),

        delete: procedure.input($Schema.PostInputSchema.delete).mutation(async ({ ctx, input }) => checkMutate(db(ctx).post.delete(input as any))),

        findFirst: procedure.input($Schema.PostInputSchema.findFirst.optional()).query(({ ctx, input }) => checkRead(db(ctx).post.findFirst(input as any))),

        findFirstOrThrow: procedure.input($Schema.PostInputSchema.findFirst.optional()).query(({ ctx, input }) => checkRead(db(ctx).post.findFirstOrThrow(input as any))),

        findMany: procedure.input($Schema.PostInputSchema.findMany.optional()).query(({ ctx, input }) => checkRead(db(ctx).post.findMany(input as any))),

        findUnique: procedure.input($Schema.PostInputSchema.findUnique).query(({ ctx, input }) => checkRead(db(ctx).post.findUnique(input as any))),

        findUniqueOrThrow: procedure.input($Schema.PostInputSchema.findUnique).query(({ ctx, input }) => checkRead(db(ctx).post.findUniqueOrThrow(input as any))),

        groupBy: procedure.input($Schema.PostInputSchema.groupBy).query(({ ctx, input }) => checkRead(db(ctx).post.groupBy(input as any))),

        updateMany: procedure.input($Schema.PostInputSchema.updateMany).mutation(async ({ ctx, input }) => checkMutate(db(ctx).post.updateMany(input as any))),

        update: procedure.input($Schema.PostInputSchema.update).mutation(async ({ ctx, input }) => checkMutate(db(ctx).post.update(input as any))),

        upsert: procedure.input($Schema.PostInputSchema.upsert).mutation(async ({ ctx, input }) => checkMutate(db(ctx).post.upsert(input as any))),

        count: procedure.input($Schema.PostInputSchema.count.optional()).query(({ ctx, input }) => checkRead(db(ctx).post.count(input as any))),

    }
    );
}
