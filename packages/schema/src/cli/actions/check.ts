import { getDefaultSchemaLocation, loadDocument } from '../cli-util';

type Options = {
    schema: string;
};

/**
 * CLI action for checking schema
 */
export async function check(_projectPath: string, options: Options) {
    const schema = options.schema ?? getDefaultSchemaLocation();
    await loadDocument(schema);
    console.log('The schema is valid.');
}
