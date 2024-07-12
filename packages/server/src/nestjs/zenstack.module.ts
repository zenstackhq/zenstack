import { Module, type DynamicModule, type FactoryProvider, type ModuleMetadata, type Provider } from '@nestjs/common';

/**
 * The default token used to export the enhanced Prisma service.
 */
export const ENHANCED_PRISMA = 'ENHANCED_PRISMA';

/**
 * ZenStack module options.
 */
export interface ZenStackModuleOptions {
    /**
     * A callback for getting an enhanced `PrismaClient`.
     */
    getEnhancedPrisma: (model?: string | symbol ) => unknown;
}

/**
 * ZenStack module async registration options.
 */
export interface ZenStackModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
    /**
     * Whether the module is global-scoped.
     */
    global?: boolean;

    /**
     * The token to export the enhanced Prisma service. Default is {@link ENHANCED_PRISMA}.
     */
    exportToken?: string;

    /**
     * The factory function to create the enhancement options.
     */
    useFactory: (...args: unknown[]) => Promise<ZenStackModuleOptions> | ZenStackModuleOptions;

    /**
     * The dependencies to inject into the factory function.
     */
    inject?: FactoryProvider['inject'];

    /**
     * Extra providers to facilitate dependency injection.
     */
    extraProviders?: Provider[];
}

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
