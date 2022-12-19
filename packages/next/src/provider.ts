import { createContext } from 'react';

/**
 * Context type for configuring react hooks.
 */
export type RequestHandlerContext = {
    endpoint: string;
};

/**
 * Context for configuring react hooks.
 */
export const RequestHandlerContext = createContext<RequestHandlerContext>({
    endpoint: '',
});

/**
 * Context provider.
 */
export const Provider = RequestHandlerContext.Provider;
