import { Model } from '@lang/generated/ast';

export interface Context {
    schema: Model;
    outDir: string;
    generatedCodeDir: string;
}

export interface Generator {
    get name(): string;
    get startMessage(): string;
    get successMessage(): string;
    generate(context: Context): Promise<string[]>;
}

export class GeneratorError extends Error {
    constructor(message: string) {
        super(message);
    }
}
