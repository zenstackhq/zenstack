import indentString from './indent-string';

/**
 * Field used by datasource and generator declarations.
 */
export type SimpleField = { name: string; text: string };

/**
 * Prisma schema builder
 */
export class PrismaModel {
    private datasources: DataSource[] = [];
    private generators: Generator[] = [];
    private models: Model[] = [];
    private enums: Enum[] = [];

    addDataSource(name: string, fields: SimpleField[] = []): DataSource {
        const ds = new DataSource(name, fields);
        this.datasources.push(ds);
        return ds;
    }

    addGenerator(name: string, fields: SimpleField[]): Generator {
        const generator = new Generator(name, fields);
        this.generators.push(generator);
        return generator;
    }

    addModel(name: string): Model {
        const model = new Model(name, false);
        this.models.push(model);
        return model;
    }

    addView(name: string): Model {
        const model = new Model(name, true);
        this.models.push(model);
        return model;
    }

    addEnum(name: string): Enum {
        const e = new Enum(name);
        this.enums.push(e);
        return e;
    }

    toString(): string {
        return [...this.datasources, ...this.generators, ...this.enums, ...this.models]
            .map((d) => d.toString())
            .join('\n\n');
    }
}

export class DataSource {
    constructor(public name: string, public fields: SimpleField[] = []) {}

    toString(): string {
        return (
            `datasource ${this.name} {\n` +
            this.fields.map((f) => indentString(`${f.name} = ${f.text}`)).join('\n') +
            `\n}`
        );
    }
}

export class Generator {
    constructor(public name: string, public fields: SimpleField[]) {}

    toString(): string {
        return (
            `generator ${this.name} {\n` +
            this.fields.map((f) => indentString(`${f.name} = ${f.text}`)).join('\n') +
            `\n}`
        );
    }
}

export class DeclarationBase {
    constructor(public documentations: string[] = []) {}

    addComment(name: string): string {
        this.documentations.push(name);
        return name;
    }

    toString(): string {
        return this.documentations.map((x) => `${x}\n`).join('');
    }
}

export class ContainerDeclaration extends DeclarationBase {
    constructor(documentations: string[] = [], public attributes: (ContainerAttribute | PassThroughAttribute)[] = []) {
        super(documentations);
    }
}

export class FieldDeclaration extends DeclarationBase {
    constructor(documentations: string[] = [], public attributes: (FieldAttribute | PassThroughAttribute)[] = []) {
        super(documentations);
    }
}

export class Model extends ContainerDeclaration {
    public fields: ModelField[] = [];
    constructor(public name: string, public isView: boolean, documentations: string[] = []) {
        super(documentations);
    }

    addField(
        name: string,
        type: ModelFieldType | string,
        attributes: (FieldAttribute | PassThroughAttribute)[] = [],
        documentations: string[] = []
    ): ModelField {
        const field = new ModelField(name, type, attributes, documentations);
        this.fields.push(field);
        return field;
    }

    addAttribute(name: string, args: AttributeArg[] = []) {
        const attr = new ContainerAttribute(name, args);
        this.attributes.push(attr);
        return attr;
    }

    toString(): string {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any[] = [...this.fields];

        if (this.attributes.length > 0) {
            // Add a blank line before the attributes
            result.push('');
        }

        result.push(...this.attributes);

        return (
            super.toString() +
            `${this.isView ? 'view' : 'model'} ${this.name} {\n` +
            indentString(result.map((d) => d.toString()).join('\n')) +
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
    constructor(public type: ScalarTypes | string, public array?: boolean, public optional?: boolean) {}

    toString(): string {
        return `${this.type}${this.array ? '[]' : ''}${this.optional ? '?' : ''}`;
    }
}

export class ModelField extends FieldDeclaration {
    constructor(
        public name: string,
        public type: ModelFieldType | string,
        attributes: (FieldAttribute | PassThroughAttribute)[] = [],
        documentations: string[] = []
    ) {
        super(documentations, attributes);
    }

    addAttribute(name: string, args: AttributeArg[] = []): FieldAttribute {
        const attr = new FieldAttribute(name, args);
        this.attributes.push(attr);
        return attr;
    }

    toString(): string {
        return (
            super.toString() +
            `${this.name} ${this.type}` +
            (this.attributes.length > 0 ? ' ' + this.attributes.map((a) => a.toString()).join(' ') : '')
        );
    }
}

export class FieldAttribute {
    constructor(public name: string, public args: AttributeArg[] = []) {}

    toString(): string {
        return `${this.name}(` + this.args.map((a) => a.toString()).join(', ') + `)`;
    }
}

export class ContainerAttribute {
    constructor(public name: string, public args: AttributeArg[] = []) {}

    toString(): string {
        return `${this.name}(` + this.args.map((a) => a.toString()).join(', ') + `)`;
    }
}

/**
 * Represents @@prisma.passthrough and @prisma.passthrough
 */
export class PassThroughAttribute {
    constructor(public text: string) {}

    toString(): string {
        return this.text;
    }
}

export class AttributeArg {
    constructor(public name: string | undefined, public value: AttributeArgValue) {}

    toString(): string {
        return this.name ? `${this.name}: ${this.value}` : this.value.toString();
    }
}

export class AttributeArgValue {
    constructor(
        public type: 'String' | 'FieldReference' | 'Number' | 'Boolean' | 'Array' | 'FunctionCall',
        public value: string | number | boolean | FieldReference | FunctionCall | AttributeArgValue[]
    ) {
        switch (type) {
            case 'String':
                if (typeof value !== 'string') throw new Error('Value must be string');
                break;
            case 'Number':
                if (typeof value !== 'number' && typeof value !== 'string')
                    throw new Error('Value must be number or string');
                break;
            case 'Boolean':
                if (typeof value !== 'boolean') throw new Error('Value must be boolean');
                break;
            case 'Array':
                if (!Array.isArray(value)) throw new Error('Value must be array');
                break;
            case 'FieldReference':
                if (typeof value !== 'string' && !(value instanceof FieldReference))
                    throw new Error('Value must be string or FieldReference');
                break;
            case 'FunctionCall':
                if (!(value instanceof FunctionCall)) throw new Error('Value must be FunctionCall');
                break;
        }
    }

    toString(): string {
        switch (this.type) {
            case 'String':
                // use JSON.stringify to escape quotes
                return JSON.stringify(this.value);
            case 'Number':
                return this.value.toString();
            case 'FieldReference': {
                if (typeof this.value === 'string') {
                    return this.value;
                } else {
                    const fr = this.value as FieldReference;
                    let r = fr.field;
                    if (fr.args.length > 0) {
                        r += '(' + fr.args.map((a) => a.toString()).join(',') + ')';
                    }
                    return r;
                }
            }
            case 'FunctionCall':
                return this.value.toString();
            case 'Boolean':
                return this.value ? 'true' : 'false';
            case 'Array':
                return '[' + (this.value as AttributeArgValue[]).map((v) => v.toString()).join(', ') + ']';
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

    toString(): string {
        return `${this.name}: ${this.value}`;
    }
}

export class FunctionCall {
    constructor(public func: string, public args: FunctionCallArg[] = []) {}

    toString(): string {
        return `${this.func}` + '(' + this.args.map((a) => a.toString()).join(', ') + ')';
    }
}

export class FunctionCallArg {
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
    constructor(public name: string | undefined, public value: any) {}

    toString(): string {
        const val =
            this.value === null || this.value === undefined
                ? 'null'
                : typeof this.value === 'string'
                ? `"${this.value}"`
                : this.value.toString();
        return this.name ? `${this.name}: ${val}` : val;
    }
}

export class Enum extends ContainerDeclaration {
    public fields: EnumField[] = [];

    constructor(public name: string, public documentations: string[] = []) {
        super(documentations);
    }

    addField(
        name: string,
        attributes: (FieldAttribute | PassThroughAttribute)[] = [],
        documentations: string[] = []
    ): EnumField {
        const field = new EnumField(name, attributes, documentations);
        this.fields.push(field);
        return field;
    }

    addAttribute(name: string, args: AttributeArg[] = []) {
        const attr = new ContainerAttribute(name, args);
        this.attributes.push(attr);
        return attr;
    }

    addComment(name: string): string {
        this.documentations.push(name);
        return name;
    }

    toString(): string {
        return (
            super.toString() +
            `enum ${this.name} {\n` +
            indentString([...this.fields, ...this.attributes].map((d) => d.toString()).join('\n')) +
            '\n}'
        );
    }
}

export class EnumField extends DeclarationBase {
    constructor(
        public name: string,
        public attributes: (FieldAttribute | PassThroughAttribute)[] = [],
        public documentations: string[] = []
    ) {
        super();
    }

    addAttribute(name: string, args: AttributeArg[] = []): FieldAttribute {
        const attr = new FieldAttribute(name, args);
        this.attributes.push(attr);
        return attr;
    }

    toString(): string {
        return (
            super.toString() +
            this.name +
            (this.attributes.length > 0 ? ' ' + this.attributes.map((a) => a.toString()).join(' ') : '')
        );
    }
}
