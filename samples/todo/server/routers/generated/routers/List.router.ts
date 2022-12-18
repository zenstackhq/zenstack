import { type RouterFactory, type ProcBuilder, type BaseConfig, db } from ".";
import { ListFindUniqueSchema } from "../schemas/findUniqueList.schema";
import { ListFindFirstSchema } from "../schemas/findFirstList.schema";
import { ListFindManySchema } from "../schemas/findManyList.schema";
import { ListCreateOneSchema } from "../schemas/createOneList.schema";
import { ListCreateManySchema } from "../schemas/createManyList.schema";
import { ListDeleteOneSchema } from "../schemas/deleteOneList.schema";
import { ListUpdateOneSchema } from "../schemas/updateOneList.schema";
import { ListDeleteManySchema } from "../schemas/deleteManyList.schema";
import { ListUpdateManySchema } from "../schemas/updateManyList.schema";
import { ListUpsertSchema } from "../schemas/upsertOneList.schema";
import { ListAggregateSchema } from "../schemas/aggregateList.schema";
import { ListGroupBySchema } from "../schemas/groupByList.schema";

export default function createRouter<Config extends BaseConfig>(router: RouterFactory<Config>, procedure: ProcBuilder<Config>) {
    return router({

        aggregate: procedure.input(ListAggregateSchema).query(({ ctx, input }) => db(ctx).list.aggregate(input)),

        createMany: procedure.input(ListCreateManySchema).mutation(({ ctx, input }) => db(ctx).list.createMany(input)),

        createOne: procedure.input(ListCreateOneSchema).mutation(({ ctx, input }) => db(ctx).list.create(input)),

        deleteMany: procedure.input(ListDeleteManySchema).mutation(({ ctx, input }) => db(ctx).list.deleteMany(input)),

        deleteOne: procedure.input(ListDeleteOneSchema).mutation(({ ctx, input }) => db(ctx).list.delete(input)),

        findFirst: procedure.input(ListFindFirstSchema).query(({ ctx, input }) => db(ctx).list.findFirst(input)),

        findFirstOrThrow: procedure.input(ListFindFirstSchema).query(({ ctx, input }) => db(ctx).list.findFirstOrThrow(input)),

        findMany: procedure.input(ListFindManySchema).query(({ ctx, input }) => db(ctx).list.findMany(input)),

        findUnique: procedure.input(ListFindUniqueSchema).query(({ ctx, input }) => db(ctx).list.findUnique(input)),

        findUniqueOrThrow: procedure.input(ListFindUniqueSchema).query(({ ctx, input }) => db(ctx).list.findUniqueOrThrow(input)),

        groupBy: procedure.input(ListGroupBySchema).query(({ ctx, input }) => db(ctx).list.groupBy(input)),

        updateMany: procedure.input(ListUpdateManySchema).mutation(({ ctx, input }) => db(ctx).list.updateMany(input)),

        updateOne: procedure.input(ListUpdateOneSchema).mutation(({ ctx, input }) => db(ctx).list.update(input)),

        upsertOne: procedure.input(ListUpsertSchema).mutation(({ ctx, input }) => db(ctx).list.upsert(input)),

    }
    );
}
