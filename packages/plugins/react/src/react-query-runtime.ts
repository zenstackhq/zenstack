import { createContext } from 'react';
import superjson from 'superjson';
import { registerSerializers } from './serialization-utils';
import { useQuery, UseQueryOptions, useMutation, UseMutationOptions } from "@tanstack/react-query"

// register superjson custom serializers
registerSerializers();

async function fetcher<R>(url: string, options?: RequestInit)
{
    const res = await fetch(url, options);
    if (!res.ok)
    {
        const error: Error & { info?: unknown; status?: number } = new Error(
            'An error occurred while fetching the data.'
        );
        error.info = await res.json();
        error.status = res.status;
        throw error;
    }

    const textResult = await res.text();
    try
    {
        return unmarshal(textResult) as R;
    } catch (err)
    {
        console.error(`Unable to deserialize data:`, textResult);
        throw err;
    }
};

function marshal(value: unknown)
{
    return superjson.stringify(value);
}

function unmarshal(value: string)
{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return superjson.parse<any>(value);
}

function makeUrl(url: string, args: unknown)
{
    return args ? url + `?q=${encodeURIComponent(marshal(args))}` : url;
}


/**
 * Makes a GET request with react-query.
 *
 * @param queryKey The unique key to identify this query. Useful to handle later invalidation.
 * @param url The request URL.
 * @param args The request args object, which will be superjson-stringified and appended as "?q=" parameter
 * @param options The react-query options object
 * @returns useQuery hook
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function get<R extends any>(
    queryKey: string,
    url: string,
    args?: unknown,
    options?: UseQueryOptions<R>
)
{
    const reqUrl = makeUrl(url, args);

    return useQuery<R>({ queryKey: [queryKey, args], queryFn: () => fetcher<R>(reqUrl), ...options })
}

/**
 * Makes a POST request.
 *
 * @param url The request URL.
 * @param data The request data.
 * @param options The react-query options.
 * @returns useMutation hooks
 */
export async function post<T extends any, R extends any = any>(url: string, options: Omit<UseMutationOptions<R, unknown, T>, "mutationFn">)
{
    const mutation = useMutation<R, unknown, T>(
        {
            mutationFn: (data) => fetcher<R>(url, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: marshal(data),
            }),
            ...options
        }
    )

    return mutation
}

/**
 * Makes a PUT request.
 *
 * @param url The request URL.
 * @param data The request data.
 * @param options The react-query options.
 * @returns useMutation hooks
 */
export async function put<T extends any, R extends any = any>(url: string, options: Omit<UseMutationOptions<R, unknown, T>, "mutationFn">)
{
    const mutation = useMutation<R, unknown, T>(
        {
            mutationFn: (data) => fetcher<R>(url, {
                method: 'PUT',
                headers: {
                    'content-type': 'application/json',
                },
                body: marshal(data),
            }),
            ...options
        }
    )

    return mutation
}

/**
 * Makes a DELETE request.
 *
 * @param url The request URL.
 * @param data The request data.
 * @param options The react-query options.
 * @returns useMutation hooks
 */
export async function del<T extends any, R extends any = any>(url: string, options: Omit<UseMutationOptions<R, unknown, T>, "mutationFn">)
{
    const mutation = useMutation<R, unknown, T>(
        {
            mutationFn: (data) => fetcher<R>(url, {
                method: 'DELETE',
                headers: {
                    'content-type': 'application/json',
                },
                body: marshal(data),
            }),
            ...options
        }
    )

    return mutation
}

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
