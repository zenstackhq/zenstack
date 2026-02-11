import { AstFactory } from './ast-factory';
import {
    Attribute,
    AttributeArg,
    AttributeParam,
    AttributeParamType,
    DataFieldAttribute,
    DataModelAttribute,
    Expression,
    InternalAttribute,
    TypeDeclaration,
    type Reference,
    type RegularID,
} from '../ast';
import { ExpressionBuilder } from './expression';

export class DataFieldAttributeFactory extends AstFactory<DataFieldAttribute> {
    args: AttributeArgFactory[] = [];
    decl?: Reference<Attribute>;
    constructor() {
        super({ type: DataFieldAttribute, node: { args: [] } });
    }
    setDecl(decl: Attribute) {
        if (!decl) {
            throw new Error('Attribute declaration is required');
        }
        this.decl = {
            $refText: decl.name,
            ref: decl,
        };
        this.update({
            decl: this.decl,
        });
        return this;
    }
    addArg(builder: (b: ExpressionBuilder) => AstFactory<Expression>, name?: string) {
        const factory = new AttributeArgFactory().setValue(builder);
        if (name) {
            factory.setName(name);
        }
        this.args.push(factory);
        this.update({
            args: this.args,
        });
        return this;
    }
}

export class DataModelAttributeFactory extends AstFactory<DataModelAttribute> {
    args: AttributeArgFactory[] = [];
    decl?: Reference<Attribute>;
    constructor() {
        super({ type: DataModelAttribute, node: { args: [] } });
    }
    setDecl(decl: Attribute) {
        if (!decl) {
            throw new Error('Attribute declaration is required');
        }
        this.decl = {
            $refText: decl.name,
            ref: decl,
        };
        this.update({
            decl: this.decl,
        });
        return this;
    }
    addArg(builder: (b: ExpressionBuilder) => AstFactory<Expression>, name?: string) {
        const factory = new AttributeArgFactory().setValue(builder);
        if (name) {
            factory.setName(name);
        }
        this.args.push(factory);
        this.update({
            args: this.args,
        });
        return this;
    }
}

export class AttributeArgFactory extends AstFactory<AttributeArg> {
    name?: RegularID = '';
    value?: AstFactory<Expression>;

    constructor() {
        super({ type: AttributeArg });
    }

    setName(name: RegularID) {
        this.name = name;
        this.update({
            name: this.name,
        });
        return this;
    }

    setValue(builder: (b: ExpressionBuilder) => AstFactory<Expression>) {
        this.value = builder(ExpressionBuilder());
        this.update({
            value: this.value,
        });
        return this;
    }
}

export class InternalAttributeFactory extends AstFactory<InternalAttribute> {
    decl?: Reference<Attribute>;
    args: AttributeArgFactory[] = [];

    constructor() {
        super({ type: InternalAttribute, node: { args: [] } });
    }

    setDecl(decl: Attribute) {
        this.decl = {
            $refText: decl.name,
            ref: decl,
        };
        this.update({
            decl: this.decl,
        });
        return this;
    }

    addArg(builder: (b: ExpressionBuilder) => AstFactory<Expression>, name?: string) {
        const factory = new AttributeArgFactory().setValue(builder);
        if (name) {
            factory.setName(name);
        }
        this.args.push(factory);
        this.update({
            args: this.args,
        });
        return this;
    }
}

export class AttributeParamFactory extends AstFactory<AttributeParam> {
    attributes: InternalAttributeFactory[] = [];
    comments: string[] = [];
    default?: boolean;
    name?: RegularID;
    type?: AttributeParamTypeFactory;

    constructor() {
        super({
            type: AttributeParam,
            node: {
                comments: [],
                attributes: [],
            },
        });
    }

    addAttribute(builder: (b: InternalAttributeFactory) => InternalAttributeFactory) {
        this.attributes.push(builder(new InternalAttributeFactory()));
        this.update({
            attributes: this.attributes,
        });
        return this;
    }

    setComments(comments: string[]) {
        this.comments = comments;
        this.update({
            comments: this.comments,
        });
        return this;
    }

    setDefault(defaultValue: boolean) {
        this.default = defaultValue;
        this.update({
            default: this.default,
        });
        return this;
    }

    setName(name: string) {
        this.name = name;
        this.update({
            name: this.name,
        });
        return this;
    }

    setType(builder: (b: AttributeParamTypeFactory) => AttributeParamTypeFactory) {
        this.type = builder(new AttributeParamTypeFactory());
        this.update({
            type: this.type,
        });
        return this;
    }
}

export class AttributeParamTypeFactory extends AstFactory<AttributeParamType> {
    array?: boolean;
    optional?: boolean;
    reference?: Reference<TypeDeclaration>;
    type?: AttributeParamType['type'];
    constructor() {
        super({ type: AttributeParamType });
    }
    setArray(array: boolean) {
        this.array = array;
        this.update({
            array: this.array,
        });
        return this;
    }

    setOptional(optional: boolean) {
        this.optional = optional;
        this.update({
            optional: this.optional,
        });
        return this;
    }

    setReference(reference: TypeDeclaration) {
        this.reference = {
            $refText: reference.name,
            ref: reference,
        };
        this.update({
            reference: this.reference,
        });
        return this;
    }

    setType(type: AttributeParamType['type']) {
        this.type = type;
        this.update({
            type: this.type,
        });
        return this;
    }
}

export class AttributeFactory extends AstFactory<Attribute> {
    name?: string;
    comments: string[] = [];
    attributes: InternalAttributeFactory[] = [];
    params: AttributeParamFactory[] = [];

    constructor() {
        super({ type: Attribute, node: { comments: [], attributes: [], params: [] } });
    }

    setName(name: string) {
        this.name = name;
        this.update({
            name: this.name,
        });
        return this;
    }

    setComments(comments: string[]) {
        this.comments = comments;
        this.update({
            comments: this.comments,
        });
        return this;
    }

    addAttribute(builder: (b: InternalAttributeFactory) => InternalAttributeFactory) {
        this.attributes.push(builder(new InternalAttributeFactory()));
        this.update({
            attributes: this.attributes,
        });
        return this;
    }

    addParam(builder: (b: AttributeParamFactory) => AttributeParamFactory) {
        this.params.push(builder(new AttributeParamFactory()));
        this.update({
            params: this.params,
        });
        return this;
    }
}
