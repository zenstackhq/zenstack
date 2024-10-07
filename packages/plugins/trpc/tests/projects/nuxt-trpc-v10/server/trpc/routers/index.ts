import { publicProcedure, router } from '../trpc';
import { createRouter as createCRUDRouter } from './generated/routers';

export const appRouter = createCRUDRouter(router, publicProcedure);

// export type definition of API
export type AppRouter = typeof appRouter;
