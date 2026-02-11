import type { Reference } from 'langium';
import { AstFactory } from './ast-factory';
import {
    Argument,
    ArrayExpr,
    BinaryExpr,
    FieldInitializer,
    FunctionDecl,
    InvocationExpr,
    MemberAccessExpr,
    MemberAccessTarget,
    ObjectExpr,
    ReferenceArg,
    ReferenceExpr,
    ReferenceTarget,
    UnaryExpr,
    type Expression,
    type RegularID,
} from '../ast';
import {
    BooleanLiteralFactory,
    NullExprFactory,
    NumberLiteralFactory,
    StringLiteralFactory,
    ThisExprFactory,
} from './primitives';

export const ExpressionBuilder = () =>
    ({
        get ArrayExpr() {
            return new ArrayExprFactory();
        },
        get BinaryExpr() {
            return new BinaryExprFactory();
        },
        get BooleanLiteral() {
            return new BooleanLiteralFactory();
        },
        get InvocationExpr() {
            return new InvocationExprFactory();
        },
        get MemberAccessExpr() {
            return new MemberAccessExprFactory();
        },
        get NullExpr() {
            return new NullExprFactory();
        },
        get NumberLiteral() {
            return new NumberLiteralFactory();
        },
        get ObjectExpr() {
            return new ObjectExprFactory();
        },
        get ReferenceExpr() {
            return new ReferenceExprFactory();
        },
        get StringLiteral() {
            return new StringLiteralFactory();
        },
        get ThisExpr() {
            return new ThisExprFactory();
        },
        get UnaryExpr() {
            return new UnaryExprFactory();
        },
    }) satisfies ExpressionBuilderType;
type ExpressionBuilderType<T extends Expression = Expression> = {
    [K in T['$type']]: AstFactory<Extract<T, { $type: K }>>;
};

type ExpressionFactoryMap = ReturnType<typeof ExpressionBuilder>;

export type ExpressionBuilder<T extends Expression = Expression> = Pick<
    ExpressionFactoryMap,
    Extract<T['$type'], keyof ExpressionFactoryMap>
>;

export class UnaryExprFactory extends AstFactory<UnaryExpr> {
    operand?: AstFactory<Expression>;

    constructor() {
        super({ type: UnaryExpr, node: { operator: '!' } });
    }

    setOperand(builder: (a: ExpressionBuilder) => AstFactory<Expression>) {
        this.operand = builder(ExpressionBuilder());
        this.update({
            operand: this.operand,
        });
        return this;
    }
}

export class ReferenceExprFactory extends AstFactory<ReferenceExpr> {
    target?: Reference<ReferenceTarget>;
    args: ReferenceArgFactory[] = [];

    constructor() {
        super({ type: ReferenceExpr, node: { args: [] } });
    }

    setTarget(target: ReferenceTarget) {
        this.target = {
            $refText: target.name,
            ref: target,
        };
        this.update({
            target: this.target,
        });
        return this;
    }

    addArg(builder: (a: ExpressionBuilder) => AstFactory<Expression>, name?: string) {
        const arg = new ReferenceArgFactory().setValue(builder);
        if (name) {
            arg.setName(name);
        }
        this.args.push(arg);
        this.update({
            args: this.args,
        });
        return this;
    }
}

export class ReferenceArgFactory extends AstFactory<ReferenceArg> {
    name?: string;
    value?: AstFactory<Expression>;

    constructor() {
        super({ type: ReferenceArg });
    }

    setName(name: string) {
        this.name = name;
        this.update({
            name: this.name,
        });
        return this;
    }

    setValue(builder: (a: ExpressionBuilder) => AstFactory<Expression>) {
        this.value = builder(ExpressionBuilder());
        this.update({
            value: this.value,
        });
        return this;
    }
}

export class MemberAccessExprFactory extends AstFactory<MemberAccessExpr> {
    member?: Reference<MemberAccessTarget>;
    operand?: AstFactory<Expression>;

    constructor() {
        super({ type: MemberAccessExpr });
    }

    setMember(target: Reference<MemberAccessTarget>) {
        this.member = target;
        this.update({
            member: this.member,
        });
        return this;
    }

    setOperand(builder: (b: ExpressionBuilder) => AstFactory<Expression>) {
        this.operand = builder(ExpressionBuilder());
        this.update({
            operand: this.operand,
        });
        return this;
    }
}

export class ObjectExprFactory extends AstFactory<ObjectExpr> {
    fields: FieldInitializerFactory[] = [];

    constructor() {
        super({ type: ObjectExpr, node: { fields: [] } });
    }

    addField(builder: (b: FieldInitializerFactory) => FieldInitializerFactory) {
        this.fields.push(builder(new FieldInitializerFactory()));
        this.update({
            fields: this.fields,
        });
        return this;
    }
}

export class FieldInitializerFactory extends AstFactory<FieldInitializer> {
    name?: RegularID;
    value?: AstFactory<Expression>;

    constructor() {
        super({ type: FieldInitializer });
    }

    setName(name: RegularID) {
        this.name = name;
        this.update({
            name: this.name!,
        });
        return this;
    }

    setValue(builder: (a: ExpressionBuilder) => AstFactory<Expression>) {
        this.value = builder(ExpressionBuilder());
        this.update({
            value: this.value!,
        });
        return this;
    }
}

export class InvocationExprFactory extends AstFactory<InvocationExpr> {
    args: ArgumentFactory[] = [];
    function?: Reference<FunctionDecl>;

    constructor() {
        super({ type: InvocationExpr, node: { args: [] } });
    }

    addArg(builder: (arg: ArgumentFactory) => ArgumentFactory) {
        this.args.push(builder(new ArgumentFactory()));
        this.update({
            args: this.args,
        });
        return this;
    }

    setFunction(value: FunctionDecl) {
        this.function = {
            $refText: value.name,
            ref: value,
        };
        this.update({
            function: this.function!,
        });
        return this;
    }
}

export class ArgumentFactory extends AstFactory<Argument> {
    value?: AstFactory<Expression>;

    constructor() {
        super({ type: Argument });
    }

    setValue(builder: (a: ExpressionBuilder) => AstFactory<Expression>) {
        this.value = builder(ExpressionBuilder());
        this.update({
            value: this.value!,
        });
        return this;
    }
}

export class ArrayExprFactory extends AstFactory<ArrayExpr> {
    items: AstFactory<Expression>[] = [];

    constructor() {
        super({ type: ArrayExpr, node: { items: [] } });
    }

    addItem(builder: (a: ExpressionBuilder) => AstFactory<Expression>) {
        this.items.push(builder(ExpressionBuilder()));
        this.update({
            items: this.items,
        });
        return this;
    }
}

export class BinaryExprFactory extends AstFactory<BinaryExpr> {
    operator?: BinaryExpr['operator'];
    right?: AstFactory<Expression>;
    left?: AstFactory<Expression>;
    // TODO: add support for CollectionPredicateBinding

    constructor() {
        super({ type: BinaryExpr });
    }

    setOperator(operator: BinaryExpr['operator']) {
        this.operator = operator;
        this.update({
            operator: this.operator!,
        });
        return this;
    }
    setRight(builder: (arg: ExpressionBuilder) => AstFactory<Expression>) {
        this.right = builder(ExpressionBuilder());
        this.update({
            right: this.right!,
        });
        return this;
    }
    setLeft(builder: (arg: ExpressionBuilder) => AstFactory<Expression>) {
        this.left = builder(ExpressionBuilder());
        this.update({
            left: this.left!,
        });
        return this;
    }
}
