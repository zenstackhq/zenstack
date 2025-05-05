import { FactoryProvider, ModuleMetadata, Provider } from "@nestjs/common";

/**
 * ZenStack module options.
 */
export interface ZenStackModuleOptions {
    /**
     * A callback for getting an enhanced `PrismaClient`.
     */
    getEnhancedPrisma: (model?: string | symbol) => unknown;
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
