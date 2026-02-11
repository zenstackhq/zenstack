import { AstFactory } from './ast-factory';
import { BooleanLiteral, NullExpr, NumberLiteral, StringLiteral, ThisExpr } from '../ast';

export class ThisExprFactory extends AstFactory<ThisExpr> {
    constructor() {
        super({ type: ThisExpr, node: { value: 'this' } });
    }
}

export class NullExprFactory extends AstFactory<NullExpr> {
    constructor() {
        super({ type: NullExpr, node: { value: 'null' } });
    }
}

export class NumberLiteralFactory extends AstFactory<NumberLiteral> {
    value?: number | string;

    constructor() {
        super({ type: NumberLiteral });
    }

    setValue(value: number | string) {
        this.value = value;
        this.update({
            value: this.value.toString(),
        });
        return this;
    }
}

export class StringLiteralFactory extends AstFactory<StringLiteral> {
    value?: string;

    constructor() {
        super({ type: StringLiteral });
    }

    setValue(value: string) {
        this.value = value;
        this.update({
            value: this.value,
        });
        return this;
    }
}
export class BooleanLiteralFactory extends AstFactory<BooleanLiteral> {
    value?: boolean;

    constructor() {
        super({ type: BooleanLiteral });
    }

    setValue(value: boolean) {
        this.value = value;
        this.update({
            value: this.value,
        });
        return this;
    }
}
