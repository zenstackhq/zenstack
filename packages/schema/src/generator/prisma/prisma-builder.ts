import indentString from 'utils/indent-string';

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

    addGenerator(name: string, provider: string, output: string) {
        const generator = new Generator(name, provider, output);
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
        return `datasource ${this.name} {\n` +
            indentString(`provider="${this.provider}"\n`) +
            indentString(`url=${this.url}\n`) +
            this.shadowDatabaseUrl
            ? indentString(`shadowDatabaseurl=${this.shadowDatabaseUrl}\n`)
            : '' + `}`;
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
        public output: string
    ) {}

    toString() {
        return (
            `generator ${this.name} {` +
            indentString(`provider = "${this.provider}"\n`) +
            indentString(`output = "${this.output}"\n`) +
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
        type: ModelFieldType,
        attributes: ModelAttribute[] = []
    ) {
        const field = new ModelField(name, type, attributes);
        this.fields.push(field);
        return field;
    }

    toString() {
        return (
            `model ${this.name} {` +
            indentString(
                [...this.fields, ...this.attributes]
                    .map((d) => d.toString())
                    .join('\n')
            ) +
            `}`
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

export type ModelFieldType = {
    type: ScalarTypes | string;
    array?: boolean;
    optional?: boolean;
};

export class ModelField {
    constructor(
        public name: string,
        public type: ModelFieldType,
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
    ) {}

    toString(): string {
        switch (this.type) {
            case 'String':
                return `"${this.value}"`;
            case 'Number':
            case 'FieldReference':
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
    constructor(public name: 'sort', value: 'Asc' | 'Desc') {}
}

export class FunctionCall {
    constructor(public func: string, public args: FunctionCallArg[]) {}

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
            `enum ${this.name} {\n` + indentString(this.fields.join('\n')) + '}'
        );
    }
}

type EnumField = String;
