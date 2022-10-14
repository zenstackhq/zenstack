import { Model } from '@lang/generated/ast';

export interface Context {
    schema: Model;
    outDir: string;
    generatedCodeDir: string;
}

export interface Generator {
    generate(context: Context): Promise<void>;
}

export class GeneratorError extends Error {
    constructor(message: string) {
        super(message);
    }
}
