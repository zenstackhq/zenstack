import { type RouterFactory, type ProcBuilder, type BaseConfig, db } from ".";
import { UserFindUniqueSchema } from "../schemas/findUniqueUser.schema";
import { UserFindFirstSchema } from "../schemas/findFirstUser.schema";
import { UserFindManySchema } from "../schemas/findManyUser.schema";
import { UserCreateOneSchema } from "../schemas/createOneUser.schema";
import { UserCreateManySchema } from "../schemas/createManyUser.schema";
import { UserDeleteOneSchema } from "../schemas/deleteOneUser.schema";
import { UserUpdateOneSchema } from "../schemas/updateOneUser.schema";
import { UserDeleteManySchema } from "../schemas/deleteManyUser.schema";
import { UserUpdateManySchema } from "../schemas/updateManyUser.schema";
import { UserUpsertSchema } from "../schemas/upsertOneUser.schema";
import { UserAggregateSchema } from "../schemas/aggregateUser.schema";
import { UserGroupBySchema } from "../schemas/groupByUser.schema";

export default function createRouter<Config extends BaseConfig>(router: RouterFactory<Config>, procedure: ProcBuilder<Config>) {
    return router({

        aggregate: procedure.input(UserAggregateSchema).query(({ ctx, input }) => db(ctx).user.aggregate(input)),

        createMany: procedure.input(UserCreateManySchema).mutation(({ ctx, input }) => db(ctx).user.createMany(input)),

        createOne: procedure.input(UserCreateOneSchema).mutation(({ ctx, input }) => db(ctx).user.create(input)),

        deleteMany: procedure.input(UserDeleteManySchema).mutation(({ ctx, input }) => db(ctx).user.deleteMany(input)),

        deleteOne: procedure.input(UserDeleteOneSchema).mutation(({ ctx, input }) => db(ctx).user.delete(input)),

        findFirst: procedure.input(UserFindFirstSchema).query(({ ctx, input }) => db(ctx).user.findFirst(input)),

        findFirstOrThrow: procedure.input(UserFindFirstSchema).query(({ ctx, input }) => db(ctx).user.findFirstOrThrow(input)),

        findMany: procedure.input(UserFindManySchema).query(({ ctx, input }) => db(ctx).user.findMany(input)),

        findUnique: procedure.input(UserFindUniqueSchema).query(({ ctx, input }) => db(ctx).user.findUnique(input)),

        findUniqueOrThrow: procedure.input(UserFindUniqueSchema).query(({ ctx, input }) => db(ctx).user.findUniqueOrThrow(input)),

        groupBy: procedure.input(UserGroupBySchema).query(({ ctx, input }) => db(ctx).user.groupBy(input)),

        updateMany: procedure.input(UserUpdateManySchema).mutation(({ ctx, input }) => db(ctx).user.updateMany(input)),

        updateOne: procedure.input(UserUpdateOneSchema).mutation(({ ctx, input }) => db(ctx).user.update(input)),

        upsertOne: procedure.input(UserUpsertSchema).mutation(({ ctx, input }) => db(ctx).user.upsert(input)),

    }
    );
}
