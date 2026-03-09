import type { CliPlugin } from '@zenstackhq/sdk';
import { TsSchemaGenerator } from '@zenstackhq/sdk';
import fs from 'node:fs';
import path from 'node:path';

const plugin: CliPlugin = {
    name: 'TypeScript Schema Generator',
    statusText: 'Generating TypeScript schema',
    async generate({ model, defaultOutputPath, pluginOptions }) {
        // output path
        let outDir = defaultOutputPath;
        if (typeof pluginOptions['output'] === 'string') {
            outDir = path.resolve(defaultOutputPath, pluginOptions['output']);
            if (!fs.existsSync(outDir)) {
                fs.mkdirSync(outDir, { recursive: true });
            }
        }

        // lite mode
        const lite = pluginOptions['lite'] === true;

        // liteOnly mode
        const liteOnly = pluginOptions['liteOnly'] === true;

        // add .js extension when importing
        const importWithFileExtension = pluginOptions['importWithFileExtension'];
        if (importWithFileExtension && typeof importWithFileExtension !== 'string') {
            throw new Error('The "importWithFileExtension" option must be a string if specified.');
        }

        // whether to generate models.ts
        const generateModelTypes = pluginOptions['generateModels'] !== false;

        // whether to generate input.ts
        const generateInputTypes = pluginOptions['generateInput'] !== false;

        await new TsSchemaGenerator().generate(model, {
            outDir,
            lite,
            liteOnly,
            importWithFileExtension: importWithFileExtension as string | undefined,
            generateModelTypes,
            generateInputTypes,
        });
    },
};

export default plugin;
