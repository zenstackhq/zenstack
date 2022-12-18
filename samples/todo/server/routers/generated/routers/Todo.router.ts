import { type RouterFactory, type ProcBuilder, type BaseConfig, db } from ".";
import { TodoFindUniqueSchema } from "../schemas/findUniqueTodo.schema";
import { TodoFindFirstSchema } from "../schemas/findFirstTodo.schema";
import { TodoFindManySchema } from "../schemas/findManyTodo.schema";
import { TodoCreateOneSchema } from "../schemas/createOneTodo.schema";
import { TodoCreateManySchema } from "../schemas/createManyTodo.schema";
import { TodoDeleteOneSchema } from "../schemas/deleteOneTodo.schema";
import { TodoUpdateOneSchema } from "../schemas/updateOneTodo.schema";
import { TodoDeleteManySchema } from "../schemas/deleteManyTodo.schema";
import { TodoUpdateManySchema } from "../schemas/updateManyTodo.schema";
import { TodoUpsertSchema } from "../schemas/upsertOneTodo.schema";
import { TodoAggregateSchema } from "../schemas/aggregateTodo.schema";
import { TodoGroupBySchema } from "../schemas/groupByTodo.schema";

export default function createRouter<Config extends BaseConfig>(router: RouterFactory<Config>, procedure: ProcBuilder<Config>) {
    return router({

        aggregate: procedure.input(TodoAggregateSchema).query(({ ctx, input }) => db(ctx).todo.aggregate(input)),

        createMany: procedure.input(TodoCreateManySchema).mutation(({ ctx, input }) => db(ctx).todo.createMany(input)),

        createOne: procedure.input(TodoCreateOneSchema).mutation(({ ctx, input }) => db(ctx).todo.create(input)),

        deleteMany: procedure.input(TodoDeleteManySchema).mutation(({ ctx, input }) => db(ctx).todo.deleteMany(input)),

        deleteOne: procedure.input(TodoDeleteOneSchema).mutation(({ ctx, input }) => db(ctx).todo.delete(input)),

        findFirst: procedure.input(TodoFindFirstSchema).query(({ ctx, input }) => db(ctx).todo.findFirst(input)),

        findFirstOrThrow: procedure.input(TodoFindFirstSchema).query(({ ctx, input }) => db(ctx).todo.findFirstOrThrow(input)),

        findMany: procedure.input(TodoFindManySchema).query(({ ctx, input }) => db(ctx).todo.findMany(input)),

        findUnique: procedure.input(TodoFindUniqueSchema).query(({ ctx, input }) => db(ctx).todo.findUnique(input)),

        findUniqueOrThrow: procedure.input(TodoFindUniqueSchema).query(({ ctx, input }) => db(ctx).todo.findUniqueOrThrow(input)),

        groupBy: procedure.input(TodoGroupBySchema).query(({ ctx, input }) => db(ctx).todo.groupBy(input)),

        updateMany: procedure.input(TodoUpdateManySchema).mutation(({ ctx, input }) => db(ctx).todo.updateMany(input)),

        updateOne: procedure.input(TodoUpdateOneSchema).mutation(({ ctx, input }) => db(ctx).todo.update(input)),

        upsertOne: procedure.input(TodoUpsertSchema).mutation(({ ctx, input }) => db(ctx).todo.upsert(input)),

    }
    );
}
