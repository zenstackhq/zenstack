import { type RouterFactory, type ProcBuilder, type BaseConfig, db } from ".";
import { AccountSchema } from '../schemas/Account.schema';

export default function createRouter<Config extends BaseConfig>(router: RouterFactory<Config>, procedure: ProcBuilder<Config>) {
    return router({

        aggregate: procedure.input(AccountSchema.aggregate).query(({ ctx, input }) => db(ctx).account.aggregate(input)),

        createMany: procedure.input(AccountSchema.createMany).mutation(({ ctx, input }) => db(ctx).account.createMany(input)),

        create: procedure.input(AccountSchema.create).mutation(({ ctx, input }) => db(ctx).account.create(input)),

        deleteMany: procedure.input(AccountSchema.deleteMany).mutation(({ ctx, input }) => db(ctx).account.deleteMany(input)),

        delete: procedure.input(AccountSchema.delete).mutation(({ ctx, input }) => db(ctx).account.delete(input)),

        findFirst: procedure.input(AccountSchema.findFirst).query(({ ctx, input }) => db(ctx).account.findFirst(input)),

        findFirstOrThrow: procedure.input(AccountSchema.findFirst).query(({ ctx, input }) => db(ctx).account.findFirstOrThrow(input)),

        findMany: procedure.input(AccountSchema.findMany).query(({ ctx, input }) => db(ctx).account.findMany(input)),

        findUnique: procedure.input(AccountSchema.findUnique).query(({ ctx, input }) => db(ctx).account.findUnique(input)),

        findUniqueOrThrow: procedure.input(AccountSchema.findUnique).query(({ ctx, input }) => db(ctx).account.findUniqueOrThrow(input)),

        groupBy: procedure.input(AccountSchema.groupBy).query(({ ctx, input }) => db(ctx).account.groupBy(input)),

        updateMany: procedure.input(AccountSchema.updateMany).mutation(({ ctx, input }) => db(ctx).account.updateMany(input)),

        update: procedure.input(AccountSchema.update).mutation(({ ctx, input }) => db(ctx).account.update(input)),

        upsert: procedure.input(AccountSchema.upsert).mutation(({ ctx, input }) => db(ctx).account.upsert(input)),

    }
    );
}
