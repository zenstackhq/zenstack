import type { ClientContract } from '@zenstackhq/orm';
import type { SchemaDef } from '@zenstackhq/orm/schema';
import type { EventHandlerRequest, H3Event } from 'h3';
import type { RequestEvent } from 'nuxt/server';
import { logInternalError, type CommonAdapterOptions } from '../common';

/**
 * The event passed to Nuxt server handlers: the portable `RequestEvent` from `nuxt/server` (Nuxt 4.6+),
 * or an h3 v1 `H3Event` when the handler is used without `defineEventHandler` from `nuxt/server`.
 */
export type NuxtHandlerEvent = RequestEvent | H3Event<EventHandlerRequest>;

/**
 * Nuxt request handler options
 */
export interface NuxtHandlerOptions<Schema extends SchemaDef> extends CommonAdapterOptions<Schema> {
    /**
     * Callback for getting a ZenStackClient for the given request
     */
    // method syntax keeps parameter bivariance, so callbacks typed with a single event type remain assignable
    getClient(event: NuxtHandlerEvent): ClientContract<Schema> | Promise<ClientContract<Schema>>;
}

interface ParsedRequest {
    method: string;
    path: string;
    query: Record<string, string | string[]>;
    requestBody: unknown;
}

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

function jsonResponse(body: unknown, status: number) {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function isPortableEvent(event: NuxtHandlerEvent): event is RequestEvent {
    return typeof (event.req as { text?: unknown } | undefined)?.text === 'function';
}

async function parsePortableRequest(event: RequestEvent): Promise<ParsedRequest> {
    const { req } = event;
    const url = event.url ?? new URL(req.url);

    const query: Record<string, string | string[]> = {};
    for (const key of new Set(url.searchParams.keys())) {
        const values = url.searchParams.getAll(key);
        query[key] = values.length > 1 ? values : values[0]!;
    }

    let requestBody: unknown;
    if (BODY_METHODS.has(req.method)) {
        const text = await req.text();
        if (text) {
            requestBody = JSON.parse(text);
        }
    }

    return { method: req.method, path: event.context.params?.['_'] ?? '', query, requestBody };
}

async function parseH3Request(event: H3Event<EventHandlerRequest>): Promise<ParsedRequest> {
    const { getQuery, getRouterParams, readBody } = await import('h3');
    const requestBody = BODY_METHODS.has(event.method) ? await readBody(event) : undefined;
    return {
        method: event.method,
        path: getRouterParams(event)['_'] ?? '',
        query: getQuery(event) as Record<string, string | string[]>,
        requestBody,
    };
}

/**
 * Creates a Nuxt server route handler for handling CRUD requests. Wrap it with `defineEventHandler` from
 * `nuxt/server` to run on the portable event, which also works with Nuxt 5.
 */
export function createEventHandler<Schema extends SchemaDef>(options: NuxtHandlerOptions<Schema>) {
    return async (event: NuxtHandlerEvent): Promise<Response> => {
        const client = await options.getClient(event);
        if (!client) {
            return jsonResponse({ message: 'unable to get ZenStackClient from request context' }, 500);
        }

        let request: ParsedRequest;
        try {
            request = isPortableEvent(event) ? await parsePortableRequest(event) : await parseH3Request(event);
        } catch {
            return jsonResponse({ message: 'invalid request payload' }, 400);
        }

        try {
            const { status, body } = await options.apiHandler.handleRequest({ ...request, client });
            return jsonResponse(body, status);
        } catch (err) {
            logInternalError(options.apiHandler.log, err);
            return jsonResponse({ message: 'An internal server error occurred' }, 500);
        }
    };
}
