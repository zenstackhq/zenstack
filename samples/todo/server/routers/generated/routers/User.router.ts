import { type RouterFactory, type ProcBuilder, type BaseConfig, db } from '.';
import { UserSchema } from '../schemas/User.schema';

export default function createRouter<Config extends BaseConfig>(
    router: RouterFactory<Config>,
    procedure: ProcBuilder<Config>
) {
    return router({
        aggregate: procedure
            .input(UserSchema.aggregate)
            .query(({ ctx, input }) => db(ctx).user.aggregate(input)),

        createMany: procedure
            .input(UserSchema.createMany)
            .mutation(({ ctx, input }) => db(ctx).user.createMany(input)),

        create: procedure
            .input(UserSchema.create)
            .mutation(({ ctx, input }) => {
                return db(ctx).user.create(input);
            }),

        deleteMany: procedure
            .input(UserSchema.deleteMany)
            .mutation(({ ctx, input }) => db(ctx).user.deleteMany(input)),

        delete: procedure
            .input(UserSchema.delete)
            .mutation(({ ctx, input }) => db(ctx).user.delete(input)),

        findFirst: procedure
            .input(UserSchema.findFirst)
            .query(({ ctx, input }) => db(ctx).user.findFirst(input)),

        findFirstOrThrow: procedure
            .input(UserSchema.findFirst)
            .query(({ ctx, input }) => db(ctx).user.findFirstOrThrow(input)),

        findMany: procedure
            .input(UserSchema.findMany)
            .query(({ ctx, input }) => db(ctx).user.findMany(input)),

        findUnique: procedure
            .input(UserSchema.findUnique)
            .query(({ ctx, input }) => db(ctx).user.findUnique(input)),

        findUniqueOrThrow: procedure
            .input(UserSchema.findUnique)
            .query(({ ctx, input }) => db(ctx).user.findUniqueOrThrow(input)),

        groupBy: procedure
            .input(UserSchema.groupBy)
            .query(({ ctx, input }) => db(ctx).user.groupBy(input)),

        updateMany: procedure
            .input(UserSchema.updateMany)
            .mutation(({ ctx, input }) => db(ctx).user.updateMany(input)),

        update: procedure
            .input(UserSchema.update)
            .mutation(({ ctx, input }) => db(ctx).user.update(input)),

        upsert: procedure
            .input(UserSchema.upsert)
            .mutation(({ ctx, input }) => db(ctx).user.upsert(input)),
    });
}
