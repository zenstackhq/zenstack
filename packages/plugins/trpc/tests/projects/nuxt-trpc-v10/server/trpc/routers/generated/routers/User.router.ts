/* eslint-disable */
import { type RouterFactory, type ProcBuilder, type BaseConfig, db } from ".";
import * as _Schema from '@zenstackhq/runtime/zod/input';
const $Schema: typeof _Schema = (_Schema as any).default ?? _Schema;
import { checkRead, checkMutate } from '../helper';

export default function createRouter<Config extends BaseConfig>(router: RouterFactory<Config>, procedure: ProcBuilder<Config>) {
    return router({

        aggregate: procedure.input($Schema.UserInputSchema.aggregate).query(({ ctx, input }) => checkRead(db(ctx).user.aggregate(input as any))),

        createMany: procedure.input($Schema.UserInputSchema.createMany.optional()).mutation(async ({ ctx, input }) => checkMutate(db(ctx).user.createMany(input as any))),

        create: procedure.input($Schema.UserInputSchema.create).mutation(async ({ ctx, input }) => checkMutate(db(ctx).user.create(input as any))),

        deleteMany: procedure.input($Schema.UserInputSchema.deleteMany.optional()).mutation(async ({ ctx, input }) => checkMutate(db(ctx).user.deleteMany(input as any))),

        delete: procedure.input($Schema.UserInputSchema.delete).mutation(async ({ ctx, input }) => checkMutate(db(ctx).user.delete(input as any))),

        findFirst: procedure.input($Schema.UserInputSchema.findFirst.optional()).query(({ ctx, input }) => checkRead(db(ctx).user.findFirst(input as any))),

        findFirstOrThrow: procedure.input($Schema.UserInputSchema.findFirst.optional()).query(({ ctx, input }) => checkRead(db(ctx).user.findFirstOrThrow(input as any))),

        findMany: procedure.input($Schema.UserInputSchema.findMany.optional()).query(({ ctx, input }) => checkRead(db(ctx).user.findMany(input as any))),

        findUnique: procedure.input($Schema.UserInputSchema.findUnique).query(({ ctx, input }) => checkRead(db(ctx).user.findUnique(input as any))),

        findUniqueOrThrow: procedure.input($Schema.UserInputSchema.findUnique).query(({ ctx, input }) => checkRead(db(ctx).user.findUniqueOrThrow(input as any))),

        groupBy: procedure.input($Schema.UserInputSchema.groupBy).query(({ ctx, input }) => checkRead(db(ctx).user.groupBy(input as any))),

        updateMany: procedure.input($Schema.UserInputSchema.updateMany).mutation(async ({ ctx, input }) => checkMutate(db(ctx).user.updateMany(input as any))),

        update: procedure.input($Schema.UserInputSchema.update).mutation(async ({ ctx, input }) => checkMutate(db(ctx).user.update(input as any))),

        upsert: procedure.input($Schema.UserInputSchema.upsert).mutation(async ({ ctx, input }) => checkMutate(db(ctx).user.upsert(input as any))),

        count: procedure.input($Schema.UserInputSchema.count.optional()).query(({ ctx, input }) => checkRead(db(ctx).user.count(input as any))),

    }
    );
}
