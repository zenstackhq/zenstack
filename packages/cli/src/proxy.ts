import type { ClientContract } from '@zenstackhq/orm';
import type { SchemaDef } from '@zenstackhq/orm/schema';
import { RPCApiHandler } from '@zenstackhq/server/api';
import { createHonoHandler } from '@zenstackhq/server/hono';
import colors from 'colors';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { verify } from 'node:crypto';
import { z } from 'zod';
import { getVersion } from './utils/version-utils';

export const ProxyAuthError = {
    MISSING_SIGNATURE_HEADER: 'Missing x-zenstack-signature header',
    INVALID_TIMESTAMP: 'Request timestamp is expired or invalid',
    INVALID_SIGNATURE_FORMAT: 'Invalid x-zenstack-signature format',
} as const;

export type ProxyAuthErrorCode = keyof typeof ProxyAuthError;

function rejectAuth(c: Context, code: ProxyAuthErrorCode) {
    return c.json({ code, message: ProxyAuthError[code] }, 401);
}

const UserClaimSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('superUser') }),
    z.object({ type: z.literal('user'), data: z.record(z.string(), z.unknown()) }),
]);

type UserClaim = z.infer<typeof UserClaimSchema>;

export function normalizePublicKey(key: string): string {
    key = key.trim();
    if (key.startsWith('-----BEGIN PUBLIC KEY-----')) {
        return key;
    }
    const b64 = key.replace(/-/g, '+').replace(/_/g, '/');
    return `-----BEGIN PUBLIC KEY-----\n${b64}\n-----END PUBLIC KEY-----`;
}

export interface CreateProxyAppOptions<Schema extends SchemaDef = SchemaDef> {
    client: ClientContract<Schema>;
    schema: Schema;
    authDb?: ClientContract<Schema>;
    auth?: {
        studioAuthKey?: string;
        /** Seconds within which a signed request is considered valid. Defaults to 60. */
        signatureToleranceSecs?: number;
    };
    cors?: Parameters<typeof cors>[0];
}

export function createProxyApp<Schema extends SchemaDef = SchemaDef>(options: CreateProxyAppOptions<Schema>): Hono {
    const app = new Hono();
    app.use('*', cors(options.cors));

    if (options.auth?.studioAuthKey) {
        const toleranceSecs = options.auth.signatureToleranceSecs ?? 60;
        const normalizedKey = normalizePublicKey(options.auth.studioAuthKey);
        const sigMiddleware = createSignatureMiddleware(normalizedKey, toleranceSecs);
        app.use('/api/model/*', sigMiddleware);
        app.use('/api/schema', sigMiddleware);
    }

    app.use(
        '/api/model/*',
        createHonoHandler<Schema>({
            apiHandler: new RPCApiHandler({ schema: options.schema }),
            getClient: (c) =>
                resolveClient(options.client, options.authDb ?? options.client, c, !!options.auth?.studioAuthKey),
        }),
    );

    app.get('/api/schema', (c) => {
        return c.json({ ...options.schema, zenstackVersion: getVersion() });
    });

    return app;
}

export function createSignatureMiddleware(publicKey: string, toleranceSeconds: number): MiddlewareHandler {
    let lastInvalidSigWarnAt = 0;
    const WARN_THROTTLE_SECS = 60;

    function warnInvalidSignature() {
        const now = Math.floor(Date.now() / 1000);
        if (now - lastInvalidSigWarnAt >= WARN_THROTTLE_SECS) {
            lastInvalidSigWarnAt = now;
            console.warn(
                colors.yellow(
                    'Warning: Received a request with an invalid signature. ' +
                        'Please double-check whether you have the correct public API key configured.',
                ),
            );
        }
    }

    return async (c, next) => {
        const signatureHeader = c.req.header('x-zenstack-signature');
        if (!signatureHeader) {
            return rejectAuth(c, 'MISSING_SIGNATURE_HEADER');
        }

        const parts = signatureHeader.split(',');
        const timestampPart = parts.find((p) => p.startsWith('t='));
        const sigPart = parts.find((p) => p.startsWith('v1='));
        if (!timestampPart || !sigPart) {
            return rejectAuth(c, 'INVALID_SIGNATURE_FORMAT');
        }
        const timestamp = timestampPart.substring(2);
        const sig = sigPart.substring(3);

        const requestTime = parseInt(timestamp, 10);
        const now = Math.floor(Date.now() / 1000);
        if (isNaN(requestTime) || Math.abs(now - requestTime) > toleranceSeconds) {
            return rejectAuth(c, 'INVALID_TIMESTAMP');
        }

        let payload: string;
        if (c.req.method === 'GET' || c.req.method === 'DELETE') {
            const rawUrl = c.req.url;
            const qMark = rawUrl.indexOf('?');
            payload = qMark >= 0 ? rawUrl.substring(qMark + 1) : '';
        } else {
            payload = await c.req.text();
        }

        const authHeader = c.req.header('authorization');
        const authorizationToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

        const message = authorizationToken ? `${payload}${timestamp}${authorizationToken}` : `${payload}${timestamp}`;

        try {
            const isValid = verify(null, Buffer.from(message, 'utf8'), publicKey, Buffer.from(sig, 'base64url'));
            if (!isValid) {
                warnInvalidSignature();
                return rejectAuth(c, 'INVALID_SIGNATURE_FORMAT');
            }
        } catch {
            warnInvalidSignature();
            return rejectAuth(c, 'INVALID_SIGNATURE_FORMAT');
        }

        return next();
    };
}

export function resolveClient<Schema extends SchemaDef = SchemaDef>(
    client: ClientContract<Schema>,
    authDb: ClientContract<Schema>,
    c: Context,
    isAuthKeyEnabled: boolean,
): ClientContract<Schema> {
    const authHeader = c.req.header('authorization');

    if (!isAuthKeyEnabled && !authHeader) {
        return client;
    }

    if (!authHeader?.startsWith('Bearer ')) {
        return authDb;
    }

    const token = authHeader.substring(7);
    let claim: UserClaim;
    try {
        claim = UserClaimSchema.parse(JSON.parse(Buffer.from(token, 'base64').toString('utf8')));
    } catch (err) {
        console.error(
            colors.red(`Failed to parse user claim from token: ${err instanceof Error ? err.message : String(err)}`),
        );
        return authDb;
    }

    if (claim.type === 'superUser') {
        return client;
    } else {
        return authDb.$setAuth(claim.data as any) as ClientContract<Schema>;
    }
}
