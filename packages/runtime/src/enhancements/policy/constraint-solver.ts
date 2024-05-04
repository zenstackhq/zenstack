import Logic, { Formula } from 'logic-solver';
import { match } from 'ts-pattern';
import type {
    CheckerConstraint,
    ComparisonConstraint,
    ComparisonTerm,
    LogicalConstraint,
    ValueConstraint,
    VariableConstraint,
} from '../types';

export class ConstraintSolver {
    private stringTable: string[] = [];
    private variables: Map<string, Formula> = new Map<string, Formula>();

    solve(constraint: CheckerConstraint): boolean {
        this.stringTable = [];
        this.variables = new Map<string, Formula>();

        const formula = this.buildFormula(constraint);
        const solver = new Logic.Solver();
        solver.require(formula);
        const solution = solver.solve();
        if (solution) {
            console.log('Solution:');
            this.variables.forEach((v, k) => console.log(`\t${k}=${solution?.evaluate(v)}`));
        } else {
            console.log('No solution');
        }
        return !!solution;
    }

    private buildFormula(constraint: CheckerConstraint): Logic.Formula {
        return match(constraint)
            .when(
                (c): c is ValueConstraint => c.kind === 'value',
                (c) => this.buildValueFormula(c)
            )
            .when(
                (c): c is VariableConstraint => c.kind === 'variable',
                (c) => this.buildVariableFormula(c)
            )
            .when(
                (c): c is ComparisonConstraint => ['eq', 'gt', 'gte', 'lt', 'lte'].includes(c.kind),
                (c) => this.buildComparisonFormula(c)
            )
            .when(
                (c): c is LogicalConstraint => ['and', 'or', 'not'].includes(c.kind),
                (c) => this.buildLogicalFormula(c)
            )
            .otherwise(() => {
                throw new Error(`Unsupported constraint format: ${JSON.stringify(constraint)}`);
            });
    }

    private buildLogicalFormula(constraint: LogicalConstraint) {
        return match(constraint.kind)
            .with('and', () => Logic.and(...constraint.children.map((c) => this.buildFormula(c))))
            .with('or', () => Logic.or(...constraint.children.map((c) => this.buildFormula(c))))
            .with('not', () => {
                if (constraint.children.length !== 1) {
                    throw new Error('"not" constraint must have exactly one child');
                }
                return Logic.not(this.buildFormula(constraint.children[0]));
            })
            .exhaustive();
    }

    private buildComparisonFormula(constraint: ComparisonConstraint) {
        return match(constraint.kind)
            .with('eq', () => this.transformEquality(constraint.left, constraint.right))
            .with('gt', () =>
                this.transformComparison(constraint.left, constraint.right, (l, r) => Logic.greaterThan(l, r))
            )
            .with('gte', () =>
                this.transformComparison(constraint.left, constraint.right, (l, r) => Logic.greaterThanOrEqual(l, r))
            )
            .with('lt', () =>
                this.transformComparison(constraint.left, constraint.right, (l, r) => Logic.lessThan(l, r))
            )
            .with('lte', () =>
                this.transformComparison(constraint.left, constraint.right, (l, r) => Logic.lessThanOrEqual(l, r))
            )
            .exhaustive();
    }

    buildVariableFormula(constraint: VariableConstraint) {
        return match(constraint.type)
            .with('boolean', () => this.booleanVariable(constraint.name))
            .with('number', () => this.intVariable(constraint.name))
            .with('string', () => this.intVariable(constraint.name))
            .exhaustive();
    }

    private buildValueFormula(constraint: ValueConstraint) {
        return match(constraint.value)
            .when(
                (v): v is boolean => typeof v === 'boolean',
                (v) => (v === true ? Logic.TRUE : Logic.FALSE)
            )
            .when(
                (v): v is number => typeof v === 'number',
                (v) => Logic.constantBits(v)
            )
            .when(
                (v): v is string => typeof v === 'string',
                (v) => {
                    const index = this.stringTable.indexOf(v);
                    if (index === -1) {
                        this.stringTable.push(v);
                        return Logic.constantBits(this.stringTable.length - 1);
                    } else {
                        return Logic.constantBits(index);
                    }
                }
            )
            .exhaustive();
    }

    private booleanVariable(name: string) {
        this.variables.set(name, name);
        return name;
    }

    private intVariable(name: string) {
        const r = Logic.variableBits(name, 32);
        this.variables.set(name, r);
        return r;
    }

    private transformEquality(left: ComparisonTerm, right: ComparisonTerm) {
        if (left.type !== right.type) {
            throw new Error(`Type mismatch in equality constraint: ${JSON.stringify(left)}, ${JSON.stringify(right)}`);
        }
        const leftConstraint = this.buildFormula(left);
        const rightConstraint = this.buildFormula(right);
        if (left.type === 'boolean' && right.type === 'boolean') {
            return Logic.equiv(leftConstraint, rightConstraint);
        } else {
            return Logic.equalBits(leftConstraint, rightConstraint);
        }
    }

    private transformComparison(
        left: ComparisonTerm,
        right: ComparisonTerm,
        func: (left: Logic.Formula, right: Logic.Formula) => Logic.Formula
    ) {
        const leftConstraint = this.buildFormula(left);
        const rightConstraint = this.buildFormula(right);
        return func(leftConstraint, rightConstraint);
    }
}
