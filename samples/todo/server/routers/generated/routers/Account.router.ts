import { type RouterFactory, type ProcBuilder, type BaseConfig, db } from ".";
import { AccountFindUniqueSchema } from "../schemas/findUniqueAccount.schema";
import { AccountFindFirstSchema } from "../schemas/findFirstAccount.schema";
import { AccountFindManySchema } from "../schemas/findManyAccount.schema";
import { AccountCreateOneSchema } from "../schemas/createOneAccount.schema";
import { AccountCreateManySchema } from "../schemas/createManyAccount.schema";
import { AccountDeleteOneSchema } from "../schemas/deleteOneAccount.schema";
import { AccountUpdateOneSchema } from "../schemas/updateOneAccount.schema";
import { AccountDeleteManySchema } from "../schemas/deleteManyAccount.schema";
import { AccountUpdateManySchema } from "../schemas/updateManyAccount.schema";
import { AccountUpsertSchema } from "../schemas/upsertOneAccount.schema";
import { AccountAggregateSchema } from "../schemas/aggregateAccount.schema";
import { AccountGroupBySchema } from "../schemas/groupByAccount.schema";

export default function createRouter<Config extends BaseConfig>(router: RouterFactory<Config>, procedure: ProcBuilder<Config>) {
    return router({

        aggregate: procedure.input(AccountAggregateSchema).query(({ ctx, input }) => db(ctx).account.aggregate(input)),

        createMany: procedure.input(AccountCreateManySchema).mutation(({ ctx, input }) => db(ctx).account.createMany(input)),

        createOne: procedure.input(AccountCreateOneSchema).mutation(({ ctx, input }) => db(ctx).account.create(input)),

        deleteMany: procedure.input(AccountDeleteManySchema).mutation(({ ctx, input }) => db(ctx).account.deleteMany(input)),

        deleteOne: procedure.input(AccountDeleteOneSchema).mutation(({ ctx, input }) => db(ctx).account.delete(input)),

        findFirst: procedure.input(AccountFindFirstSchema).query(({ ctx, input }) => db(ctx).account.findFirst(input)),

        findFirstOrThrow: procedure.input(AccountFindFirstSchema).query(({ ctx, input }) => db(ctx).account.findFirstOrThrow(input)),

        findMany: procedure.input(AccountFindManySchema).query(({ ctx, input }) => db(ctx).account.findMany(input)),

        findUnique: procedure.input(AccountFindUniqueSchema).query(({ ctx, input }) => db(ctx).account.findUnique(input)),

        findUniqueOrThrow: procedure.input(AccountFindUniqueSchema).query(({ ctx, input }) => db(ctx).account.findUniqueOrThrow(input)),

        groupBy: procedure.input(AccountGroupBySchema).query(({ ctx, input }) => db(ctx).account.groupBy(input)),

        updateMany: procedure.input(AccountUpdateManySchema).mutation(({ ctx, input }) => db(ctx).account.updateMany(input)),

        updateOne: procedure.input(AccountUpdateOneSchema).mutation(({ ctx, input }) => db(ctx).account.update(input)),

        upsertOne: procedure.input(AccountUpsertSchema).mutation(({ ctx, input }) => db(ctx).account.upsert(input)),

    }
    );
}
