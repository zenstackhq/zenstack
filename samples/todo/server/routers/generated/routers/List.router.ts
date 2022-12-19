import { type RouterFactory, type ProcBuilder, type BaseConfig, db } from ".";
import { ListSchema } from '../schemas/List.schema';

export default function createRouter<Config extends BaseConfig>(router: RouterFactory<Config>, procedure: ProcBuilder<Config>) {
    return router({

        aggregate: procedure.input(ListSchema.aggregate).query(({ ctx, input }) => db(ctx).list.aggregate(input)),

        createMany: procedure.input(ListSchema.createMany).mutation(({ ctx, input }) => db(ctx).list.createMany(input)),

        create: procedure.input(ListSchema.create).mutation(({ ctx, input }) => db(ctx).list.create(input)),

        deleteMany: procedure.input(ListSchema.deleteMany).mutation(({ ctx, input }) => db(ctx).list.deleteMany(input)),

        delete: procedure.input(ListSchema.delete).mutation(({ ctx, input }) => db(ctx).list.delete(input)),

        findFirst: procedure.input(ListSchema.findFirst).query(({ ctx, input }) => db(ctx).list.findFirst(input)),

        findFirstOrThrow: procedure.input(ListSchema.findFirst).query(({ ctx, input }) => db(ctx).list.findFirstOrThrow(input)),

        findMany: procedure.input(ListSchema.findMany).query(({ ctx, input }) => db(ctx).list.findMany(input)),

        findUnique: procedure.input(ListSchema.findUnique).query(({ ctx, input }) => db(ctx).list.findUnique(input)),

        findUniqueOrThrow: procedure.input(ListSchema.findUnique).query(({ ctx, input }) => db(ctx).list.findUniqueOrThrow(input)),

        groupBy: procedure.input(ListSchema.groupBy).query(({ ctx, input }) => db(ctx).list.groupBy(input)),

        updateMany: procedure.input(ListSchema.updateMany).mutation(({ ctx, input }) => db(ctx).list.updateMany(input)),

        update: procedure.input(ListSchema.update).mutation(({ ctx, input }) => db(ctx).list.update(input)),

        upsert: procedure.input(ListSchema.upsert).mutation(({ ctx, input }) => db(ctx).list.upsert(input)),

    }
    );
}
