import { type RouterFactory, type ProcBuilder, type BaseConfig, db } from ".";
import { SpaceFindUniqueSchema } from "../schemas/findUniqueSpace.schema";
import { SpaceFindFirstSchema } from "../schemas/findFirstSpace.schema";
import { SpaceFindManySchema } from "../schemas/findManySpace.schema";
import { SpaceCreateOneSchema } from "../schemas/createOneSpace.schema";
import { SpaceCreateManySchema } from "../schemas/createManySpace.schema";
import { SpaceDeleteOneSchema } from "../schemas/deleteOneSpace.schema";
import { SpaceUpdateOneSchema } from "../schemas/updateOneSpace.schema";
import { SpaceDeleteManySchema } from "../schemas/deleteManySpace.schema";
import { SpaceUpdateManySchema } from "../schemas/updateManySpace.schema";
import { SpaceUpsertSchema } from "../schemas/upsertOneSpace.schema";
import { SpaceAggregateSchema } from "../schemas/aggregateSpace.schema";
import { SpaceGroupBySchema } from "../schemas/groupBySpace.schema";

export default function createRouter<Config extends BaseConfig>(router: RouterFactory<Config>, procedure: ProcBuilder<Config>) {
    return router({

        aggregate: procedure.input(SpaceAggregateSchema).query(({ ctx, input }) => db(ctx).space.aggregate(input)),

        createMany: procedure.input(SpaceCreateManySchema).mutation(({ ctx, input }) => db(ctx).space.createMany(input)),

        createOne: procedure.input(SpaceCreateOneSchema).mutation(({ ctx, input }) => db(ctx).space.create(input)),

        deleteMany: procedure.input(SpaceDeleteManySchema).mutation(({ ctx, input }) => db(ctx).space.deleteMany(input)),

        deleteOne: procedure.input(SpaceDeleteOneSchema).mutation(({ ctx, input }) => db(ctx).space.delete(input)),

        findFirst: procedure.input(SpaceFindFirstSchema).query(({ ctx, input }) => db(ctx).space.findFirst(input)),

        findFirstOrThrow: procedure.input(SpaceFindFirstSchema).query(({ ctx, input }) => db(ctx).space.findFirstOrThrow(input)),

        findMany: procedure.input(SpaceFindManySchema).query(({ ctx, input }) => db(ctx).space.findMany(input)),

        findUnique: procedure.input(SpaceFindUniqueSchema).query(({ ctx, input }) => db(ctx).space.findUnique(input)),

        findUniqueOrThrow: procedure.input(SpaceFindUniqueSchema).query(({ ctx, input }) => db(ctx).space.findUniqueOrThrow(input)),

        groupBy: procedure.input(SpaceGroupBySchema).query(({ ctx, input }) => db(ctx).space.groupBy(input)),

        updateMany: procedure.input(SpaceUpdateManySchema).mutation(({ ctx, input }) => db(ctx).space.updateMany(input)),

        updateOne: procedure.input(SpaceUpdateOneSchema).mutation(({ ctx, input }) => db(ctx).space.update(input)),

        upsertOne: procedure.input(SpaceUpsertSchema).mutation(({ ctx, input }) => db(ctx).space.upsert(input)),

    }
    );
}
