import { type RouterFactory, type ProcBuilder, type BaseConfig, db } from ".";
import { SpaceSchema } from '../schemas/Space.schema';

export default function createRouter<Config extends BaseConfig>(router: RouterFactory<Config>, procedure: ProcBuilder<Config>) {
    return router({

        aggregate: procedure.input(SpaceSchema.aggregate).query(({ ctx, input }) => db(ctx).space.aggregate(input)),

        createMany: procedure.input(SpaceSchema.createMany).mutation(({ ctx, input }) => db(ctx).space.createMany(input)),

        create: procedure.input(SpaceSchema.create).mutation(({ ctx, input }) => db(ctx).space.create(input)),

        deleteMany: procedure.input(SpaceSchema.deleteMany).mutation(({ ctx, input }) => db(ctx).space.deleteMany(input)),

        delete: procedure.input(SpaceSchema.delete).mutation(({ ctx, input }) => db(ctx).space.delete(input)),

        findFirst: procedure.input(SpaceSchema.findFirst).query(({ ctx, input }) => db(ctx).space.findFirst(input)),

        findFirstOrThrow: procedure.input(SpaceSchema.findFirst).query(({ ctx, input }) => db(ctx).space.findFirstOrThrow(input)),

        findMany: procedure.input(SpaceSchema.findMany).query(({ ctx, input }) => db(ctx).space.findMany(input)),

        findUnique: procedure.input(SpaceSchema.findUnique).query(({ ctx, input }) => db(ctx).space.findUnique(input)),

        findUniqueOrThrow: procedure.input(SpaceSchema.findUnique).query(({ ctx, input }) => db(ctx).space.findUniqueOrThrow(input)),

        groupBy: procedure.input(SpaceSchema.groupBy).query(({ ctx, input }) => db(ctx).space.groupBy(input)),

        updateMany: procedure.input(SpaceSchema.updateMany).mutation(({ ctx, input }) => db(ctx).space.updateMany(input)),

        update: procedure.input(SpaceSchema.update).mutation(({ ctx, input }) => db(ctx).space.update(input)),

        upsert: procedure.input(SpaceSchema.upsert).mutation(({ ctx, input }) => db(ctx).space.upsert(input)),

    }
    );
}
