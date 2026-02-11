import { AstFactory } from './ast-factory';
import { AbstractDeclaration, type Reference } from '../ast';
import {
    type BuiltinType,
    DataField,
    DataFieldType,
    DataModel,
    Enum,
    EnumField,
    LiteralExpr,
    Model,
    ModelImport,
    type RegularID,
    type RegularIDWithTypeNames,
    TypeDeclaration,
    type TypeDef,
    UnsupportedFieldType,
} from '../generated/ast';
import { AttributeFactory, DataFieldAttributeFactory, DataModelAttributeFactory } from './attribute';
import { ExpressionBuilder } from './expression';
export const DeclarationBuilder = () =>
    ({
        get Attribute() {
            return new AttributeFactory();
        },
        get DataModel() {
            return new DataModelFactory();
        },
        get DataSource(): any {
            throw new Error('DataSource is not implemented');
        },
        get Enum() {
            return new EnumFactory();
        },
        get FunctionDecl(): any {
            throw new Error('FunctionDecl is not implemented');
        },
        get GeneratorDecl(): any {
            throw new Error('GeneratorDecl is not implemented');
        },
        get Plugin(): any {
            throw new Error('Plugin is not implemented');
        },
        get Procedure(): any {
            throw new Error('Procedure is not implemented');
        },
        get TypeDef(): any {
            throw new Error('TypeDef is not implemented');
        },
    }) satisfies DeclarationBuilderType;
type DeclarationBuilderType<T extends AbstractDeclaration = AbstractDeclaration> = {
    [K in T['$type']]: AstFactory<Extract<T, { $type: K }>>;
};
type DeclarationBuilderMap = ReturnType<typeof DeclarationBuilder>;

export type DeclarationBuilder<T extends AbstractDeclaration = AbstractDeclaration> = Pick<
    DeclarationBuilderMap,
    Extract<T['$type'], keyof DeclarationBuilderMap>
>;

export class DataModelFactory extends AstFactory<DataModel> {
    attributes: DataModelAttributeFactory[] = [];
    baseModel?: Reference<DataModel>;
    comments: string[] = [];
    fields: DataFieldFactory[] = [];
    isView?: boolean;
    mixins: Reference<TypeDef>[] = [];
    name?: RegularID;

    constructor() {
        super({
            type: DataModel,
            node: {
                attributes: [],
                comments: [],
                fields: [],
                mixins: [],
            },
        });
    }

    addAttribute(builder: (attr: DataModelAttributeFactory) => DataModelAttributeFactory) {
        this.attributes.push(builder(new DataModelAttributeFactory()).setContainer(this.node));
        this.update({
            attributes: this.attributes,
        });
        return this;
    }

    setBaseModel(model: Reference<DataModel>) {
        this.baseModel = model;
        this.update({
            baseModel: this.baseModel,
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

    addComment(comment: string) {
        this.comments.push(comment);
        this.update({
            comments: this.comments,
        });
        return this;
    }

    addField(builder: (field: DataFieldFactory) => DataFieldFactory) {
        this.fields.push(builder(new DataFieldFactory()).setContainer(this.node));
        this.update({
            fields: this.fields,
        });
        return this;
    }

    setIsView(isView: boolean) {
        this.isView = isView;
        this.update({
            isView: this.isView,
        });
        return this;
    }

    addMixin(mixin: Reference<TypeDef>) {
        this.mixins.push(mixin);
        this.update({
            mixins: this.mixins,
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
}

export class DataFieldFactory extends AstFactory<DataField> {
    attributes: DataFieldAttributeFactory[] = [];
    comments: string[] = [];
    name?: string;
    type?: DataFieldTypeFactory;

    constructor() {
        super({ type: DataField, node: { attributes: [], comments: [] } });
    }

    addAttribute(
        builder: ((attr: DataFieldAttributeFactory) => DataFieldAttributeFactory) | DataFieldAttributeFactory,
    ) {
        if (builder instanceof DataFieldAttributeFactory) {
            builder.setContainer(this.node);
            this.attributes.push(builder);
        } else {
            const attr = builder(new DataFieldAttributeFactory());
            attr.setContainer(this.node);
            this.attributes.push(attr);
        }
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

    setName(name: string) {
        this.name = name;
        this.update({
            name: this.name,
        });
        return this;
    }

    setType(builder: (type: DataFieldTypeFactory) => DataFieldTypeFactory) {
        this.type = builder(new DataFieldTypeFactory()).setContainer(this.node);
        this.update({
            type: this.type,
        });
        return this;
    }
}

export class DataFieldTypeFactory extends AstFactory<DataFieldType> {
    array?: boolean;
    optional?: boolean;
    reference?: Reference<TypeDeclaration>;
    type?: BuiltinType;
    unsupported?: UnsupportedFieldTypeFactory;

    constructor() {
        super({ type: DataFieldType });
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

    setType(type: BuiltinType) {
        this.type = type;
        this.update({
            type: this.type,
        });
        return this;
    }

    setUnsupported(builder: (a: UnsupportedFieldTypeFactory) => UnsupportedFieldTypeFactory) {
        this.unsupported = builder(new UnsupportedFieldTypeFactory()).setContainer(this.node);
        this.update({
            unsupported: this.unsupported,
        });
        return this;
    }
}

export class UnsupportedFieldTypeFactory extends AstFactory<UnsupportedFieldType> {
    value?: AstFactory<LiteralExpr>;
    constructor() {
        super({ type: UnsupportedFieldType });
    }
    setValue(builder: (value: ExpressionBuilder<LiteralExpr>) => AstFactory<LiteralExpr>) {
        this.value = builder(ExpressionBuilder());
        this.update({
            value: this.value!,
        });
        return this;
    }
}

export class ModelFactory extends AstFactory<Model> {
    declarations: AstFactory<AbstractDeclaration>[] = [];
    imports: ModelImportFactory[] = [];
    constructor() {
        super({ type: Model, node: { declarations: [], imports: [] } });
    }
    addImport(builder: (b: ModelImportFactory) => ModelImportFactory) {
        this.imports.push(builder(new ModelImportFactory()).setContainer(this.node));
        this.update({
            imports: this.imports,
        });
        return this;
    }
    addDeclaration(builder: (b: DeclarationBuilder) => AstFactory<AbstractDeclaration>) {
        this.declarations.push(builder(DeclarationBuilder()).setContainer(this.node));
        this.update({
            declarations: this.declarations,
        });
        return this;
    }
}

export class ModelImportFactory extends AstFactory<ModelImport> {
    path?: string | undefined;

    constructor() {
        super({ type: ModelImport });
    }

    setPath(path: string) {
        this.path = path;
        this.update({
            path: this.path,
        });
        return this;
    }
}

export class EnumFactory extends AstFactory<Enum> {
    name?: string;
    comments: string[] = [];
    fields: EnumFieldFactory[] = [];
    attributes: DataModelAttributeFactory[] = [];

    constructor() {
        super({ type: Enum, node: { comments: [], fields: [], attributes: [] } });
    }

    addField(builder: (b: EnumFieldFactory) => EnumFieldFactory) {
        this.fields.push(builder(new EnumFieldFactory()).setContainer(this.node));
        this.update({
            fields: this.fields,
        });
        return this;
    }

    addAttribute(builder: (b: DataModelAttributeFactory) => DataModelAttributeFactory) {
        this.attributes.push(builder(new DataModelAttributeFactory()).setContainer(this.node));
        this.update({
            attributes: this.attributes,
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
}

export class EnumFieldFactory extends AstFactory<EnumField> {
    name?: RegularIDWithTypeNames;
    comments: string[] = [];
    attributes: DataFieldAttributeFactory[] = [];

    constructor() {
        super({ type: EnumField, node: { comments: [], attributes: [] } });
    }

    setName(name: RegularIDWithTypeNames) {
        this.name = name;
        this.update({
            name: this.name,
        });
        return this;
    }

    addAttribute(builder: (b: DataFieldAttributeFactory) => DataFieldAttributeFactory) {
        this.attributes.push(builder(new DataFieldAttributeFactory()).setContainer(this.node));
        this.update({
            attributes: this.attributes,
        });
        return this;
    }

    addComment(comment: string) {
        this.comments.push(comment);
        this.update({
            comments: this.comments,
        });
        return this;
    }
}
