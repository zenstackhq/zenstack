import { Model } from '@zenstackhq/language/ast';

export interface Context {
    schema: Model;
    schemaPath: string;
    outDir: string;
}

export interface Generator {
    get name(): string;
    get startMessage(): string;
    get successMessage(): string;
    generate(context: Context): Promise<string[]>;
}
