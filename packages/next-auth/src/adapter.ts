import { Adapter } from 'next-auth/adapters';
import type { Service } from '@zenstackhq/runtime/server';
import { PrismaAdapter } from '@next-auth/prisma-adapter';

/**
 * Next-auth adapter for reading and persisting auth entities
 * @param service ZenStack service
 */
export function Adapter(service: Service): Adapter {
    return PrismaAdapter(service.db);
}
