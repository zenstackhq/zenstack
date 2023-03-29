import { createContext } from 'react';
import { marshal } from '../serialization-utils';

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
    endpoint: '/api/model',
});

/**
 * Context provider.
 */
export const Provider = RequestHandlerContext.Provider;

export function makeUrl(url: string, args: unknown) {
    return args ? url + `?q=${encodeURIComponent(marshal(args))}` : url;
}
