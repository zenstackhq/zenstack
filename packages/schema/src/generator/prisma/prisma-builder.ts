import indentString from '../../utils/indent-string';

export class PrismaModel {
    private datasources: DataSource[] = [];
    private generators: Generator[] = [];
    private models: Model[] = [];
    private enums: Enum[] = [];

    addDataSource(
        name: string,
        provider: string,
        url: DataSourceUrl,
        shadowDatabaseUrl?: DataSourceUrl
    ) {
        const ds = new DataSource(name, provider, url, shadowDatabaseUrl);
        this.datasources.push(ds);
        return ds;
    }

    addGenerator(
        name: string,
        provider: string,
        output: string,
        previewFeatures?: string[]
    ) {
        const generator = new Generator(
            name,
            provider,
            output,
            previewFeatures
        );
        this.generators.push(generator);
        return generator;
    }

    addModel(name: string) {
        const model = new Model(name);
        this.models.push(model);
        return model;
    }

    addEnum(name: string, fields: string[]) {
        const e = new Enum(name, fields);
        this.enums.push(e);
        return e;
    }

    toString() {
        return [
            ...this.datasources,
            ...this.generators,
            ...this.enums,
            ...this.models,
        ]
            .map((d) => d.toString())
            .join('\n\n');
    }
}

export class DataSource {
    constructor(
        public name: string,
        public provider: string,
        public url: DataSourceUrl,
        public shadowDatabaseUrl?: DataSourceUrl
    ) {}

    toString() {
        return (
            `datasource ${this.name} {\n` +
            indentString(`provider="${this.provider}"\n`) +
            indentString(`url=${this.url}\n`) +
            (this.shadowDatabaseUrl
                ? indentString(`shadowDatabaseurl=${this.shadowDatabaseUrl}\n`)
                : '') +
            `}`
        );
    }
}

export class DataSourceUrl {
    constructor(public value: string, public isEnv: boolean) {}

    toString() {
        return this.isEnv ? `env("${this.value}")` : `"${this.value}"`;
    }
}

export class Generator {
    constructor(
        public name: string,
        public provider: string,
        public output: string,
        public previewFeatures?: string[]
    ) {}

    toString() {
        return (
            `generator ${this.name} {\n` +
            indentString(`provider = "${this.provider}"\n`) +
            indentString(`output = "${this.output}"\n`) +
            (this.previewFeatures
                ? indentString(
                      `previewFeatures = [${this.previewFeatures
                          ?.map((f) => '"' + f + '"')
                          .join(',')}]\n`
                  )
                : '') +
            `}`
        );
    }
}

export class Model {
    public fields: ModelField[] = [];
    public attributes: ModelAttribute[] = [];
    constructor(public name: string) {}

    addField(
        name: string,
        type: ModelFieldType | string,
        attributes: FieldAttribute[] = []
    ) {
        const field = new ModelField(name, type, attributes);
        this.fields.push(field);
        return field;
    }

    addAttribute(name: string, args: AttributeArg[] = []) {
        const attr = new ModelAttribute(name, args);
        this.attributes.push(attr);
        return attr;
    }

    toString() {
        return (
            `model ${this.name} {\n` +
            indentString(
                [...this.fields, ...this.attributes]
                    .map((d) => d.toString())
                    .join('\n')
            ) +
            `\n}`
        );
    }
}

export type ScalarTypes =
    | 'String'
    | 'Boolean'
    | 'Int'
    | 'BigInt'
    | 'Float'
    | 'Decimal'
    | 'DateTime'
    | 'Json'
    | 'Bytes'
    | 'Unsupported';

export class ModelFieldType {
    constructor(
        public type: ScalarTypes | string,
        public array?: boolean,
        public optional?: boolean
    ) {}

    toString() {
        return `${this.type}${this.array ? '[]' : ''}${
            this.optional ? '?' : ''
        }`;
    }
}

export class ModelField {
    constructor(
        public name: string,
        public type: ModelFieldType | string,
        public attributes: FieldAttribute[] = []
    ) {}

    addAttribute(name: string, args: AttributeArg[] = []) {
        const attr = new FieldAttribute(name, args);
        this.attributes.push(attr);
        return attr;
    }

    toString() {
        return (
            `${this.name} ${this.type}` +
            (this.attributes.length > 0
                ? ' ' + this.attributes.map((a) => a.toString()).join(' ')
                : '')
        );
    }
}

export class FieldAttribute {
    constructor(public name: string, public args: AttributeArg[] = []) {}

    toString() {
        return (
            `@${this.name}(` +
            this.args.map((a) => a.toString()).join(', ') +
            `)`
        );
    }
}

export class ModelAttribute {
    constructor(public name: string, public args: AttributeArg[] = []) {}

    toString() {
        return (
            `@@${this.name}(` +
            this.args.map((a) => a.toString()).join(', ') +
            `)`
        );
    }
}

export class AttributeArg {
    constructor(
        public name: string | undefined,
        public value: AttributeArgValue
    ) {}

    toString() {
        return this.name
            ? `${this.name}: ${this.value}`
            : this.value.toString();
    }
}

export class AttributeArgValue {
    constructor(
        public type:
            | 'String'
            | 'FieldReference'
            | 'Number'
            | 'Boolean'
            | 'Array'
            | 'FunctionCall',
        public value:
            | string
            | number
            | boolean
            | FieldReference
            | FunctionCall
            | AttributeArgValue[]
    ) {
        switch (type) {
            case 'String':
                if (typeof value !== 'string')
                    throw new Error('Value must be string');
                break;
            case 'Number':
                if (typeof value !== 'number')
                    throw new Error('Value must be number');
                break;
            case 'Boolean':
                if (typeof value !== 'boolean')
                    throw new Error('Value must be boolean');
                break;
            case 'Array':
                if (!Array.isArray(value))
                    throw new Error('Value must be array');
                break;
            case 'FieldReference':
                if (
                    typeof value !== 'string' &&
                    !(value instanceof FieldReference)
                )
                    throw new Error('Value must be string or FieldReference');
                break;
            case 'FunctionCall':
                if (!(value instanceof FunctionCall))
                    throw new Error('Value must be FunctionCall');
                break;
        }
    }

    toString(): string {
        switch (this.type) {
            case 'String':
                return `"${this.value}"`;
            case 'Number':
                return this.value.toString();
            case 'FieldReference': {
                if (typeof this.value === 'string') {
                    return this.value;
                } else {
                    const fr = this.value as FieldReference;
                    let r = fr.field;
                    if (fr.args.length > 0) {
                        r +=
                            '(' +
                            fr.args.map((a) => a.toString()).join(',') +
                            ')';
                    }
                    return r;
                }
            }
            case 'FunctionCall':
                return this.value.toString();
            case 'Boolean':
                return this.value ? 'true' : 'false';
            case 'Array':
                return (
                    '[' +
                    (this.value as AttributeArgValue[])
                        .map((v) => v.toString())
                        .join(', ') +
                    ']'
                );
            default:
                throw new Error(`Unknown attribute value type ${this.type}`);
        }
    }
}

export class FieldReference {
    constructor(public field: string, public args: FieldReferenceArg[] = []) {}
}

export class FieldReferenceArg {
    constructor(public name: 'sort', public value: 'Asc' | 'Desc') {}

    toString() {
        return `${this.name}: ${this.value}`;
    }
}

export class FunctionCall {
    constructor(public func: string, public args: FunctionCallArg[] = []) {}

    toString() {
        return (
            `${this.func}` +
            '(' +
            this.args.map((a) => a.toString()).join(', ') +
            ')'
        );
    }
}

export class FunctionCallArg {
    constructor(public name: string | undefined, public value: any) {}

    toString() {
        return this.name ? `${this.name}: ${this.value}` : this.value;
    }
}

export class Enum {
    constructor(public name: string, public fields: EnumField[]) {}

    toString() {
        return (
            `enum ${this.name} {\n` +
            indentString(this.fields.join('\n')) +
            '\n}'
        );
    }
}

type EnumField = String;
