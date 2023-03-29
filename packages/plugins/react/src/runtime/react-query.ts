/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, UseMutationOptions, useQuery, UseQueryOptions } from '@tanstack/react-query';
import { makeUrl } from '.';
import { marshal, registerSerializers, unmarshal } from '../serialization-utils';

// register superjson custom serializers
registerSerializers();

async function fetcher<R>(url: string, options?: RequestInit) {
    const res = await fetch(url, options);
    if (!res.ok) {
        const error: Error & { info?: unknown; status?: number } = new Error(
            'An error occurred while fetching the data.'
        );
        error.info = await res.json();
        error.status = res.status;
        throw error;
    }

    const textResult = await res.text();
    try {
        return unmarshal(textResult) as R;
    } catch (err) {
        console.error(`Unable to deserialize data:`, textResult);
        throw err;
    }
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
export function get<R>(queryKey: string, url: string, args?: unknown, options?: UseQueryOptions<R>) {
    const reqUrl = makeUrl(url, args);
    return useQuery<R>({ queryKey: [queryKey, args], queryFn: () => fetcher<R>(reqUrl), ...options });
}

/**
 * Makes a POST request.
 *
 * @param url The request URL.
 * @param options The react-query options.
 * @returns useMutation hooks
 */
export function postMutate<T, R = any>(url: string, options?: Omit<UseMutationOptions<R, unknown, T>, 'mutationFn'>) {
    const mutation = useMutation<R, unknown, T>({
        mutationFn: (data: any) =>
            fetcher<R>(url, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: marshal(data),
            }),
        ...options,
    });

    return mutation;
}

/**
 * Makes a PUT request.
 *
 * @param url The request URL.
 * @param options The react-query options.
 * @returns useMutation hooks
 */
export function putMutate<T, R = any>(url: string, options?: Omit<UseMutationOptions<R, unknown, T>, 'mutationFn'>) {
    const mutation = useMutation<R, unknown, T>({
        mutationFn: (data: any) =>
            fetcher<R>(url, {
                method: 'PUT',
                headers: {
                    'content-type': 'application/json',
                },
                body: marshal(data),
            }),
        ...options,
    });

    return mutation;
}

/**
 * Makes a DELETE request.
 *
 * @param url The request URL.
 * @param options The react-query options.
 * @returns useMutation hooks
 */
export function delMutate<T, R = any>(url: string, options?: Omit<UseMutationOptions<R, unknown, T>, 'mutationFn'>) {
    const mutation = useMutation<R, unknown, T>({
        mutationFn: (data: any) =>
            fetcher<R>(url, {
                method: 'DELETE',
                headers: {
                    'content-type': 'application/json',
                },
                body: marshal(data),
            }),
        ...options,
    });

    return mutation;
}
