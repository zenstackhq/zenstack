import { handleRequest } from '../api';
import { buildMiddlewareFactory } from '@zenstackhq/server/express';

export default buildMiddlewareFactory(handleRequest);
