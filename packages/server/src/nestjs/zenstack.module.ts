import { Module, type DynamicModule } from '@nestjs/common';
import { ENHANCED_PRISMA } from './zenstack.constants';
import { ZenStackModuleAsyncOptions } from './interfaces';

/**
 * The ZenStack module for NestJS. The module exports an enhanced Prisma service,
 * by default with token {@link ENHANCED_PRISMA}.
 */
@Module({})
export class ZenStackModule {
    /**
     * Registers the ZenStack module with the specified options.
     */
    static registerAsync(options: ZenStackModuleAsyncOptions): DynamicModule {
        return {
            module: ZenStackModule,
            global: options?.global,
            imports: options.imports,
            providers: [
                {
                    provide: options.exportToken ?? ENHANCED_PRISMA,
                    useFactory: async (
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        ...args: unknown[]
                    ) => {
                        const { getEnhancedPrisma } = await options.useFactory(...args);
                        if (!getEnhancedPrisma) {
                            throw new Error('`getEnhancedPrisma` must be provided in the options');
                        }

                        // create a proxy to intercept all calls to the Prisma service and forward
                        // to the enhanced version

                        return new Proxy(
                            {},
                            {
                                get(_target, prop) {
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    const enhancedPrisma: any = getEnhancedPrisma(prop);
                                    if (!enhancedPrisma) {
                                        throw new Error('`getEnhancedPrisma` must return a valid Prisma client');
                                    }
                                    return enhancedPrisma[prop];
                                },
                            }
                        );
                    },
                    inject: options.inject,
                },
                ...(options.extraProviders ?? []),
            ],
            exports: [options.exportToken ?? ENHANCED_PRISMA],
        };
    }
}
