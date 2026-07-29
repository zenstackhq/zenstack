import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    // @zenstackhq/orm uses node:async_hooks (AsyncLocalStorage).
    // Mark it as server-external so Turbopack never tries to analyze it in any bundle context.
    serverExternalPackages: ['@zenstackhq/orm', '@zenstackhq/tanstack-query'],
};

export default nextConfig;
