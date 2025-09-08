import z from 'zod';

/**
 * Zod schema for OpenAPI security schemes: https://swagger.io/docs/specification/authentication/
 */
export const SecuritySchemesSchema = z.record(
    z.string(),
    z.union([
        z.object({ type: z.literal('http'), scheme: z.literal('basic') }),
        z.object({ type: z.literal('http'), scheme: z.literal('bearer'), bearerFormat: z.string().optional() }),
        z.object({
            type: z.literal('apiKey'),
            in: z.union([z.literal('header'), z.literal('query'), z.literal('cookie')]),
            name: z.string(),
        }),
        z.object({
            type: z.literal('oauth2'),
            description: z.string(),
            flows: z.object({
                authorizationCode: z.object({
                    authorizationUrl: z.string(),
                    tokenUrl: z.string(),
                    refreshUrl: z.string(),
                    scopes: z.record(z.string(), z.string()),
                }),
                implicit: z.object({
                    authorizationUrl: z.string(),
                    refreshUrl: z.string(),
                    scopes: z.record(z.string(), z.string()),
                }),
                password: z.object({
                    tokenUrl: z.string(),
                    refreshUrl: z.string(),
                    scopes: z.record(z.string(), z.string()),
                }),
                clientCredentials: z.object({
                    tokenUrl: z.string(),
                    refreshUrl: z.string(),
                    scopes: z.record(z.string(), z.string()),
                }),
            }),
        }),
    ])
);
