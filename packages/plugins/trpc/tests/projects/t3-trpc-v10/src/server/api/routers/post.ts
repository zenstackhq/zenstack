import { createTRPCRouter, publicProcedure } from '../trpc';
import { createRouter } from './generated/routers';

export const postRouter = createRouter(createTRPCRouter, publicProcedure);
