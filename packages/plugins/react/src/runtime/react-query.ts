/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, UseMutationOptions, useQuery, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { marshal, registerSerializers } from '../serialization-utils';
import { fetcher, makeUrl } from './utils';

// register superjson custom serializers
registerSerializers();

const QUERY_KEY_PREFIX = 'zenstack:';

/**
 * Creates a react-query query.
 *
 * @param model The name of the model under query.
 * @param url The request URL.
 * @param args The request args object, which will be superjson-stringified and appended as "?q=" parameter
 * @param options The react-query options object
 * @returns useQuery hook
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function query<R>(model: string, url: string, args?: unknown, options?: UseQueryOptions<R>) {
    const reqUrl = makeUrl(url, args);
    return useQuery<R>({
        queryKey: [QUERY_KEY_PREFIX + model, url, args],
        queryFn: () => fetcher<R>(reqUrl),
        ...options,
    });
}

/**
 * Creates a POST mutation with react-query.
 *
 * @param model The name of the model under mutation.
 * @param url The request URL.
 * @param options The react-query options.
 * @param invalidateQueries Whether to invalidate queries after mutation.
 * @returns useMutation hooks
 */
export function postMutation<T, R = any>(
    model: string,
    url: string,
    options?: Omit<UseMutationOptions<R, unknown, T>, 'mutationFn'>,
    invalidateQueries = true
) {
    const queryClient = useQueryClient();
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
        onSuccess: invalidateQueries ? () => queryClient.invalidateQueries([QUERY_KEY_PREFIX + model]) : undefined,
    });

    return mutation;
}

/**
 * Creates a PUT mutation with react-query.
 *
 * @param model The name of the model under mutation.
 * @param url The request URL.
 * @param options The react-query options.
 * @param invalidateQueries Whether to invalidate queries after mutation.
 * @returns useMutation hooks
 */
export function putMutation<T, R = any>(
    model: string,
    url: string,
    options?: Omit<UseMutationOptions<R, unknown, T>, 'mutationFn'>,
    invalidateQueries = true
) {
    const queryClient = useQueryClient();
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
        onSuccess: invalidateQueries ? () => queryClient.invalidateQueries([QUERY_KEY_PREFIX + model]) : undefined,
    });

    return mutation;
}

/**
 * Creates a DELETE mutation with react-query.
 *
 * @param model The name of the model under mutation.
 * @param url The request URL.
 * @param options The react-query options.
 * @param invalidateQueries Whether to invalidate queries after mutation.
 * @returns useMutation hooks
 */
export function deleteMutation<T, R = any>(
    model: string,
    url: string,
    options?: Omit<UseMutationOptions<R, unknown, T>, 'mutationFn'>,
    invalidateQueries = true
) {
    const queryClient = useQueryClient();
    const mutation = useMutation<R, unknown, T>({
        mutationFn: (data: any) =>
            fetcher<R>(makeUrl(url, data), {
                method: 'DELETE',
            }),
        ...options,
        onSuccess: invalidateQueries ? () => queryClient.invalidateQueries([QUERY_KEY_PREFIX + model]) : undefined,
    });

    return mutation;
}
