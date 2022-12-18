import { type RouterFactory, type ProcBuilder, type BaseConfig, db } from ".";
import { SpaceUserFindUniqueSchema } from "../schemas/findUniqueSpaceUser.schema";
import { SpaceUserFindFirstSchema } from "../schemas/findFirstSpaceUser.schema";
import { SpaceUserFindManySchema } from "../schemas/findManySpaceUser.schema";
import { SpaceUserCreateOneSchema } from "../schemas/createOneSpaceUser.schema";
import { SpaceUserCreateManySchema } from "../schemas/createManySpaceUser.schema";
import { SpaceUserDeleteOneSchema } from "../schemas/deleteOneSpaceUser.schema";
import { SpaceUserUpdateOneSchema } from "../schemas/updateOneSpaceUser.schema";
import { SpaceUserDeleteManySchema } from "../schemas/deleteManySpaceUser.schema";
import { SpaceUserUpdateManySchema } from "../schemas/updateManySpaceUser.schema";
import { SpaceUserUpsertSchema } from "../schemas/upsertOneSpaceUser.schema";
import { SpaceUserAggregateSchema } from "../schemas/aggregateSpaceUser.schema";
import { SpaceUserGroupBySchema } from "../schemas/groupBySpaceUser.schema";

export default function createRouter<Config extends BaseConfig>(router: RouterFactory<Config>, procedure: ProcBuilder<Config>) {
    return router({

        aggregate: procedure.input(SpaceUserAggregateSchema).query(({ ctx, input }) => db(ctx).spaceUser.aggregate(input)),

        createMany: procedure.input(SpaceUserCreateManySchema).mutation(({ ctx, input }) => db(ctx).spaceUser.createMany(input)),

        createOne: procedure.input(SpaceUserCreateOneSchema).mutation(({ ctx, input }) => db(ctx).spaceUser.create(input)),

        deleteMany: procedure.input(SpaceUserDeleteManySchema).mutation(({ ctx, input }) => db(ctx).spaceUser.deleteMany(input)),

        deleteOne: procedure.input(SpaceUserDeleteOneSchema).mutation(({ ctx, input }) => db(ctx).spaceUser.delete(input)),

        findFirst: procedure.input(SpaceUserFindFirstSchema).query(({ ctx, input }) => db(ctx).spaceUser.findFirst(input)),

        findFirstOrThrow: procedure.input(SpaceUserFindFirstSchema).query(({ ctx, input }) => db(ctx).spaceUser.findFirstOrThrow(input)),

        findMany: procedure.input(SpaceUserFindManySchema).query(({ ctx, input }) => db(ctx).spaceUser.findMany(input)),

        findUnique: procedure.input(SpaceUserFindUniqueSchema).query(({ ctx, input }) => db(ctx).spaceUser.findUnique(input)),

        findUniqueOrThrow: procedure.input(SpaceUserFindUniqueSchema).query(({ ctx, input }) => db(ctx).spaceUser.findUniqueOrThrow(input)),

        groupBy: procedure.input(SpaceUserGroupBySchema).query(({ ctx, input }) => db(ctx).spaceUser.groupBy(input)),

        updateMany: procedure.input(SpaceUserUpdateManySchema).mutation(({ ctx, input }) => db(ctx).spaceUser.updateMany(input)),

        updateOne: procedure.input(SpaceUserUpdateOneSchema).mutation(({ ctx, input }) => db(ctx).spaceUser.update(input)),

        upsertOne: procedure.input(SpaceUserUpsertSchema).mutation(({ ctx, input }) => db(ctx).spaceUser.upsert(input)),

    }
    );
}
