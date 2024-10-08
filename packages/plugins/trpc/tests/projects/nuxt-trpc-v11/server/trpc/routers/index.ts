import { createRouter as createCRUDRouter } from './generated/routers';

export const appRouter = createCRUDRouter();

// export type definition of API
export type AppRouter = typeof appRouter;
